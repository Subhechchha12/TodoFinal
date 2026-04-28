const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const otplib = require('otplib');
const qrcode = require('qrcode');
const User = require('../models/User');
const { usernameExists, addUsername } = require('../config/upstash');

const router = express.Router();

// @route   POST api/auth/register
router.post('/register', async (req, res) => {
  const { name, username, password } = req.body;

  try {
    if (!name || !username || !password) {
      return res.status(400).json({ msg: 'Please provide name, username, and password' });
    }

    // O(1) username uniqueness check via Upstash SISMEMBER
    const taken = await usernameExists(username);
    if (taken) return res.status(400).json({ msg: 'Username already exists' });

    const user = new User({ name, username, password });

    // Encrypt password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    // Generate MFA Secret
    const secret = otplib.generateSecret();
    user.mfaSecret = secret;
    user.mfaSetupComplete = false;

    // 1. Save to MongoDB (source of truth)
    await user.save();

    // 2. Record username in Upstash Set (best-effort, non-blocking)
    addUsername(username).catch((e) =>
      console.warn('⚠️ Upstash SADD failed (username not cached):', e.message)
    );

    const otpauth = otplib.generateURI({ issuer: 'TaskFlow', label: user.username, secret });
    const qrCode = await qrcode.toDataURL(otpauth);

    const payload = { user: { id: user.id }, isTemp: true };

    const tempToken = await new Promise((resolve, reject) => {
      jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: 600 }, (err, tok) => { // 10 minutes temp token
        if (err) return reject(err);
        resolve(tok);
      });
    });

    return res.json({ 
      mfaRequired: true, 
      isSetup: true, 
      tempToken, 
      qrCode 
    });
  } catch (err) {
    console.error('REGISTER ERROR:', err.message, err.stack);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    if (!username || !password) {
      return res.status(400).json({ msg: 'Please provide username and password' });
    }

    // NOTE: Login still hits MongoDB because we need the hashed password.
    // SISMEMBER is only used for fast "does this username exist?" checks (registration).
    const user = await User.findOne({ username });

    if (!user) return res.status(400).json({ msg: 'Invalid credentials' });
    if (!user.password) return res.status(400).json({ msg: 'Use Google sign-in for this account' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: 'Invalid credentials' });

    // Handle existing users without MFA secret
    let qrCode = null;
    if (!user.mfaSecret) {
      user.mfaSecret = otplib.generateSecret();
      user.mfaSetupComplete = false;
      await user.save();
    }

    if (!user.mfaSetupComplete) {
      const otpauth = otplib.generateURI({ issuer: 'TaskFlow', label: user.username, secret: user.mfaSecret });
      qrCode = await qrcode.toDataURL(otpauth);
    }

    const payload = { user: { id: user.id }, isTemp: true };

    const tempToken = await new Promise((resolve, reject) => {
      jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: 600 }, (err, tok) => {
        if (err) return reject(err);
        resolve(tok);
      });
    });

    return res.json({ 
      mfaRequired: true, 
      isSetup: !user.mfaSetupComplete, 
      tempToken,
      qrCode
    });
  } catch (err) {
    console.error('LOGIN ERROR:', err.message, err.stack);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/auth/mfa/verify
router.post('/mfa/verify', async (req, res) => {
  const { tempToken, mfaCode } = req.body;

  try {
    if (!tempToken || !mfaCode) {
      return res.status(400).json({ msg: 'Token and MFA code required' });
    }

    const decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
    if (!decoded.isTemp) {
      return res.status(400).json({ msg: 'Invalid token type' });
    }

    const user = await User.findById(decoded.user.id);
    if (!user) return res.status(404).json({ msg: 'User not found' });

    let isValid = false;
    try {
      isValid = otplib.verify({ token: mfaCode, secret: user.mfaSecret });
    } catch (e) {
      return res.status(400).json({ msg: 'Invalid MFA Code' });
    }
    
    if (!isValid) return res.status(400).json({ msg: 'Invalid MFA Code' });

    if (!user.mfaSetupComplete) {
      user.mfaSetupComplete = true;
      await user.save();
    }

    const payload = { user: { id: user.id } };

    const token = await new Promise((resolve, reject) => {
      jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: 36000 }, (err, tok) => {
        if (err) return reject(err);
        resolve(tok);
      });
    });

    // Persist token list (best-effort)
    User.findByIdAndUpdate(
      user.id,
      { $push: { tokens: { $each: [{ token, createdAt: new Date() }], $position: 0, $slice: 5 } } },
      { new: false }
    ).catch(() => {});

    return res.json({ token });
  } catch (err) {
    console.error('MFA VERIFY ERROR:', err);
    res.status(401).json({ msg: 'Token expired or invalid' });
  }
});

// @route   GET api/auth/google
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// @route   GET api/auth/google/callback
router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: 'http://localhost:3000', session: true }),
  (req, res) => {
    const payload = { user: { id: req.user.id } };
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: 36000 }, (err, token) => {
      if (err) return res.status(500).send('Server Error');
      res.json({ token });
    });
  }
);

module.exports = router;