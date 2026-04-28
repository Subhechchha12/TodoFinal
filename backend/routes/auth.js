const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const otplib = require('otplib');
const qrcode = require('qrcode');
const User = require('../models/User');
const { usernameExists, addUsername } = require('../config/upstash');
const auth = require('../middleware/authMiddleware');

const router = express.Router();

// Helper: sign a JWT and return a promise
function signToken(payload, expiresIn) {
  return new Promise((resolve, reject) => {
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn }, (err, tok) => {
      if (err) return reject(err);
      resolve(tok);
    });
  });
}

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
    const tempToken = await signToken(payload, 600); // 10 minutes temp token

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
    const tempToken = await signToken(payload, 600);

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

    // Bug 1 FIX: otplib.verify() returns a Promise<{ valid, delta, ... }> in v13
    // Must await it and check .valid property
    let isValid = false;
    try {
      const result = await otplib.verify({ token: mfaCode, secret: user.mfaSecret });
      isValid = result.valid;
    } catch (e) {
      console.error('MFA verify error:', e);
      return res.status(400).json({ msg: 'Invalid MFA Code' });
    }
    
    if (!isValid) return res.status(400).json({ msg: 'Invalid MFA Code' });

    if (!user.mfaSetupComplete) {
      user.mfaSetupComplete = true;
      await user.save();
    }

    const payload = { user: { id: user.id } }; // No isTemp — this is the real token
    const token = await signToken(payload, 36000);

    // Persist token list (best-effort)
    User.findByIdAndUpdate(
      user.id,
      { $push: { tokens: { $each: [{ token, createdAt: new Date() }], $position: 0, $slice: 5 } } }
    ).catch(() => {});

    return res.json({ token });
  } catch (err) {
    console.error('MFA VERIFY ERROR:', err);
    res.status(401).json({ msg: 'Token expired or invalid' });
  }
});

// @route   GET api/auth/me
// @desc    Get current user info (requires full JWT, not temp token)
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password -mfaSecret -tokens');
    if (!user) return res.status(404).json({ msg: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// @route   GET api/auth/google
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// @route   GET api/auth/google/callback
// Bug 2 & 5 FIX: Google OAuth users now go through MFA flow too.
// We redirect to the frontend with a temp token so MFA can be completed there.
router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: 'http://localhost:3000', session: true }),
  async (req, res) => {
    try {
      const user = req.user;

      // Ensure Google OAuth user has an MFA secret
      if (!user.mfaSecret) {
        user.mfaSecret = otplib.generateSecret();
        user.mfaSetupComplete = false;
        await user.save();
      }

      const isSetup = !user.mfaSetupComplete;

      // Generate QR code if MFA setup is needed
      let qrCode = '';
      if (isSetup) {
        const otpauth = otplib.generateURI({ issuer: 'TaskFlow', label: user.username || user.email, secret: user.mfaSecret });
        qrCode = await qrcode.toDataURL(otpauth);
      }

      // Issue temp token for MFA verification
      const payload = { user: { id: user.id }, isTemp: true };
      const tempToken = await signToken(payload, 600);

      // Redirect to frontend with MFA params in URL
      const params = new URLSearchParams({
        mfaRequired: 'true',
        isSetup: String(isSetup),
        tempToken,
      });

      // QR code data URLs are large — only include if needed
      if (qrCode) {
        params.set('qrCode', qrCode);
      }

      res.redirect(`http://localhost:3000/?${params.toString()}`);
    } catch (err) {
      console.error('Google callback error:', err);
      res.redirect('http://localhost:3000/?error=auth_failed');
    }
  }
);

module.exports = router;