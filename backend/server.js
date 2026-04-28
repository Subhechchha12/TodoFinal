const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
require('dotenv').config();

const app = express();

// Redis: now handled via Upstash HTTP REST (see config/upstash.js) — no local client needed.
let lastMongoError = null;
mongoose.connection.on('error', (err) => {
    lastMongoError = err;
});

// 2. Middleware
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}));
app.use(express.json());

// 3. Session Middleware 
// BUG FIX: Don't use JWT_SECRET for sessions; use a dedicated SESSION_SECRET
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback_secret', 
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production', // true if using HTTPS
        httpOnly: true 
    }
}));

// 4. Passport
require('./config/passport')(passport);
app.use(passport.initialize());
app.use(passport.session());

// 5. Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/todos', require('./routes/todos'));
app.use('/api/payment', require('./routes/payment'));

app.get('/', (req, res) => res.send("API is working!"));
app.get('/health', (req, res) => {
    const mongoState = mongoose.connection.readyState;
    res.json({
        ok: true,
        server: 'up',
        mongo: {
            readyState: mongoState,
            connected: mongoState === 1,
            lastError: lastMongoError ? String(lastMongoError.message || lastMongoError) : null
        },
        upstash: {
            provider: 'Upstash Redis REST',
            url: process.env.UPSTASH_REDIS_REST_URL || '(not set)'
        }
    });
});

// 6. Start HTTP server immediately; connect dependencies in background.
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server is LIVE at http://localhost:${PORT}`);
});

(async () => {

    try {
        console.log("Attempting to connect to Mongo...");
        await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
        console.log('✅ ✨ MongoDB Connected');
    } catch (err) {
        console.error('⚠️ MongoDB not ready:', err.message || err);
    }
})();