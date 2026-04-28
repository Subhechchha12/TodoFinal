const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, unique: true, sparse: true, index: true },
  email: { type: String, unique: true, sparse: true, index: true },
  password: { type: String }, // Not required — Google OAuth users won't have one
  googleId: { type: String }, // Store Google profile ID for OAuth users
  isPremium: { type: Boolean, default: false }, // For your Razorpay logic later
  tokens: [
    {
      token: { type: String, required: true },
      createdAt: { type: Date, default: Date.now }
    }
  ],
  date: { type: Date, default: Date.now },
  mfaSecret: { type: String },
  mfaSetupComplete: { type: Boolean, default: false }
});

module.exports = mongoose.model('User', UserSchema);