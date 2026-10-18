import crypto from 'node:crypto'; // built-in: random numbers + hashing
import { Router } from 'express'; // groups related routes
import jwt from 'jsonwebtoken'; // creates/verifies login tokens
import nodemailer from 'nodemailer'; // sends email (to Mailpit)
import { pool } from './db.js'; // PostgreSQL connection

const router = Router();

const OTP_TTL_MS = Number(process.env.OTP_TTL_SECONDS || 300) * 1000; // OTP lifetime: 5 min default
const RESEND_COOLDOWN_MS = 30_000; // wait 30s between OTP requests
const MAX_ATTEMPTS = 3; // wrong guesses allowed

// mobile -> { hash, expires, attempts, lastSent }. In-memory: fine for a single-process demo.
const otpStore = new Map(); // cleared when server restarts

// Mail sender settings come from .env (Mailpit: localhost:1025)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false, // no TLS needed locally
});

// Scramble text into a SHA-256 hash (we store the hash, never the OTP)
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Hide most of the email: ar*****@example.com
const maskEmail = (email) => {
  const [user, domain] = email.split('@'); // split at @
  return `${user.slice(0, 2)}${'*'.repeat(Math.max(user.length - 2, 1))}@${domain}`;
};

// Step 1: validate number against the DB, then email an OTP
router.post('/request-otp', async (req, res) => {
  const mobile = String(req.body?.mobile ?? '').trim(); // safe read + clean

  // Must be 10 digits starting with 6-9
  if (!/^[6-9]\d{9}$/.test(mobile)) {
    return res.status(400).json({ error: 'Enter a valid 10-digit mobile number.' });
  }

  // $1 placeholder prevents SQL injection
  const { rows } = await pool.query('SELECT * FROM subscribers WHERE mobile = $1', [mobile]);
  const subscriber = rows[0]; // undefined if not found

  if (!subscriber) { // number not in DB
    return res.status(404).json({ error: 'This mobile number is not registered with AirVoice.' });
  }
  if (subscriber.status !== 'active') { // in DB but not active
    return res.status(403).json({
      error: 'This AirVoice account is inactive. Please contact customer care to reactivate it.',
    });
  }

  const previous = otpStore.get(mobile); // earlier OTP, if any
  // Sent less than 30s ago? Refuse (anti-spam)
  if (previous && Date.now() - previous.lastSent < RESEND_COOLDOWN_MS) {
    return res.status(429).json({ error: 'Please wait 30 seconds before requesting another OTP.' });
  }

  const otp = crypto.randomInt(100000, 1000000).toString(); // random 6 digits
  // Save hash + expiry + attempt counter (replaces any old OTP)
  otpStore.set(mobile, { hash: sha(otp), expires: Date.now() + OTP_TTL_MS, attempts: 0, lastSent: Date.now() });

  // Email goes to the address stored in the DB, not one typed by the user
  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: subscriber.email,
    subject: `Your AirVoice login code: ${otp}`,
    text: `Hi ${subscriber.name},\n\nYour one-time password is ${otp}.\nIt expires in ${OTP_TTL_MS / 60000} minutes. Do not share it with anyone.\n\n- AirVoice`,
  });

  // Reply with masked email so the full address isn't exposed
  res.json({ message: 'OTP sent.', sentTo: maskEmail(subscriber.email) });
});

// Step 2: verify OTP, issue a JWT
router.post('/verify-otp', async (req, res) => {
  const mobile = String(req.body?.mobile ?? '').trim();
  const otp = String(req.body?.otp ?? '').trim(); // what the user typed

  const entry = otpStore.get(mobile); // saved OTP details
  if (!entry) return res.status(400).json({ error: 'Request an OTP first.' });
  if (Date.now() > entry.expires) { // too old
    otpStore.delete(mobile);
    return res.status(400).json({ error: 'This OTP has expired. Request a new one.' });
  }
  if (entry.attempts >= MAX_ATTEMPTS) { // out of tries
    otpStore.delete(mobile);
    return res.status(429).json({ error: 'Too many wrong attempts. Request a new OTP.' });
  }

  // Hash the typed OTP and compare with the stored hash
  if (sha(otp) !== entry.hash) {
    entry.attempts += 1; // count the wrong try
    const left = MAX_ATTEMPTS - entry.attempts; // tries remaining
    return res.status(400).json({ error: `Incorrect OTP. ${left} attempt${left === 1 ? '' : 's'} left.` });
  }

  otpStore.delete(mobile); // single use

  // Fresh read from DB (only safe columns, no email)
  const { rows } = await pool.query(
    'SELECT id, name, mobile, plan, status FROM subscribers WHERE mobile = $1',
    [mobile],
  );
  const subscriber = rows[0];
  // Re-check status: it may have changed since the OTP was sent
  if (!subscriber || subscriber.status !== 'active') {
    return res.status(403).json({ error: 'This account is no longer active.' });
  }

  // Token holds only the subscriber id ("sub"), signed with the secret, valid 2 hours
  const token = jwt.sign({ sub: subscriber.id }, process.env.JWT_SECRET, { expiresIn: '2h' });
  res.json({ token, subscriber }); // browser stores the token
});

// Middleware used by all /api/bills routes
export function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? ''; // "Bearer <token>"
  const token = header.startsWith('Bearer ') ? header.slice(7) : null; // cut off "Bearer "
  if (!token) return res.status(401).json({ error: 'Please log in to continue.' }); // not logged in
  try {
    // Verify signature + expiry, then remember who the user is for the route that runs next
    req.subscriberId = jwt.verify(token, process.env.JWT_SECRET).sub;
    next(); // allow the request to continue
  } catch { // fake, tampered or expired token
    res.status(401).json({ error: 'Your session has expired. Please log in again.' });
  }
}

export default router; // index.js mounts this router