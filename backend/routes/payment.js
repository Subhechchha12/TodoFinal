const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Razorpay = require('razorpay');
const auth = require('../middleware/authMiddleware');
const User = require('../models/User');

// Lazy-init Razorpay instance to ensure env vars are loaded
let razorpayInstance = null;
function getRazorpay() {
  if (!razorpayInstance) {
    razorpayInstance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return razorpayInstance;
}

// @route   POST api/payment/order
// @desc    Create a Razorpay Order
router.post('/order', auth, async (req, res) => {
  try {
    const options = {
      amount: 50000, // Amount in paise (50000 = ₹500)
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
    };

    const order = await getRazorpay().orders.create(options);
    res.json(order);
  } catch (err) {
    console.error("Order creation failed:", err);
    res.status(500).send('Payment Server Error');
  }
});

// @route   POST api/payment/verify
// @desc    Verify Razorpay signature & upgrade user to premium
router.post('/verify', auth, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    // Verify signature using HMAC-SHA256
    const generated_signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({ msg: 'Payment verification failed: invalid signature' });
    }

    await User.findByIdAndUpdate(req.user.id, { isPremium: true });
    res.json({ msg: 'Upgrade Successful' });
  } catch (err) {
    console.error('Verification Error:', err);
    res.status(500).send('Verification Error');
  }
});

module.exports = router;