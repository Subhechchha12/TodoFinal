const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

const toUsername = (email) => {
  const base = String(email || '').split('@')[0] || 'user';
  return base.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20) || 'user';
};

const makeUniqueUsername = async (base) => {
  let username = base;
  for (let i = 0; i < 10; i++) {
    const exists = await User.findOne({ username });
    if (!exists) return username;
    username = `${base}${Math.floor(1000 + Math.random() * 9000)}`;
  }
  return `${base}${Date.now()}`;
};

module.exports = function(passport) {
  // Required for passport to maintain login state during the OAuth redirect dance
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  });

  passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // First check if user exists by googleId
        let user = await User.findOne({ googleId: profile.id });
        if (user) return done(null, user);

        // Then check if user exists by email (e.g. registered manually first)
        const email = profile.emails?.[0]?.value;
        user = await User.findOne({ email });
        if (user) {
          // Link the Google ID to the existing account
          user.googleId = profile.id;
          if (!user.username && email) {
            user.username = await makeUniqueUsername(toUsername(email));
          }
          await user.save();
          return done(null, user);
        }

        // Create a brand new user
        const baseUsername = await makeUniqueUsername(toUsername(email));
        user = await User.create({
          name: profile.displayName,
          username: baseUsername,
          email,
          googleId: profile.id
        });
        done(null, user);
      } catch (err) {
        console.error('Google Strategy Error:', err);
        done(err, null);
      }
    }
  ));
};