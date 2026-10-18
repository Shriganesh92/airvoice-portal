import express from 'express'; // the web framework
import cors from 'cors'; // controls which websites may call this API
import authRoutes from './auth.js'; // login routes (request-otp, verify-otp)
import billingRoutes from './billing.js'; // bill routes (list, detail, download, payment)

const app = express(); // create the server app
app.use(cors({ origin: process.env.CLIENT_ORIGIN })); // only the frontend (http://localhost:5173) is allowed to call this API from a browser
app.use(express.json()); // read JSON request bodies so req.body works in the routes

app.get('/api/health', (_req, res) => res.json({ ok: true })); // quick check that the server is running
app.use('/api/auth', authRoutes); // routes in auth.js become /api/auth/request-otp and /api/auth/verify-otp
app.use('/api/bills', billingRoutes); // routes in billing.js become /api/bills, /api/bills/:id, etc. (login required)

// Express 5 forwards rejected promises from async handlers here
// An error handler has 4 parameters (err first); Express recognises it by that
app.use((err, _req, res, _next) => {
  console.error(err); // the real error goes to the server console only
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' }); // the user gets a friendly message, no technical details
});

const port = process.env.PORT || 4000; // port from .env, or 4000 by default
app.listen(port, () => console.log(`AirVoice API listening on http://localhost:${port}`)); // start listening; prints the message you saw earlier
