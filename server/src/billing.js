import crypto from 'node:crypto'; // built-in: used for the random mock payment reference
import { Router } from 'express'; // groups related routes
import { pool } from './db.js'; // PostgreSQL connection
import { requireAuth } from './auth.js'; // login check (middleware)
import { billToCsv, billToPdf, billToXlsx } from './exports.js'; // file generators

const router = Router();
router.use(requireAuth); // every route below needs a valid login token; sets req.subscriberId

// Bill is "paid" once payments cover the total, otherwise "unpaid" (status is never stored in the DB)
const statusOf = (total, paid) => (paid >= total ? 'paid' : 'unpaid');

// Loads one bill with items + payments, scoped to the logged-in subscriber (prevents reading others' bills)
async function loadBill(subscriberId, billId) {
  if (!Number.isInteger(billId)) return null; // e.g. /abc becomes NaN -> treat as "not found"
  // BOTH conditions must match: the bill id AND the owner. This is the isolation rule.
  const { rows } = await pool.query('SELECT * FROM bills WHERE id = $1 AND subscriber_id = $2', [billId, subscriberId]);
  const bill = rows[0]; // undefined if no match
  if (!bill) return null; // someone else's bill looks the same as a missing one

  // Run both queries at the same time (faster than one after the other)
  const [items, payments] = await Promise.all([
    // The service lines of this bill (voice, DTH, internet, extra)
    pool.query('SELECT service_type, description, amount FROM bill_items WHERE bill_id = $1 ORDER BY id', [bill.id]),
    pool.query(
      // to_char formats the date/time as text, e.g. 2026-09-20T10:30:00
      `SELECT id, to_char(paid_on, 'YYYY-MM-DD"T"HH24:MI:SS') AS paid_on, amount, method, reference
       FROM payments WHERE bill_id = $1 ORDER BY paid_on`, // oldest payment first
      [bill.id],
    ),
  ]);

  bill.items = items.rows; // attach the lines to the bill object
  bill.payments = payments.rows; // attach the payment history
  bill.paid_amount = payments.rows.reduce((sum, p) => sum + p.amount, 0); // add up all payments
  bill.balance = Math.max(bill.total_amount - bill.paid_amount, 0); // amount still due, never below 0
  bill.status = statusOf(bill.total_amount, bill.paid_amount); // "paid" or "unpaid"
  return bill;
}

// Small helper: fetch the logged-in subscriber's name, mobile and plan (used in downloads)
const getSubscriber = async (id) =>
  (await pool.query('SELECT name, mobile, plan FROM subscribers WHERE id = $1', [id])).rows[0];

// List of bills, newest first
router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    // LEFT JOIN keeps bills even if they have no payments yet; SUM adds the payments per bill
    // COALESCE turns "no payments" (NULL) into 0
    `SELECT b.id, b.bill_number, b.period_start, b.period_end, b.due_date, b.total_amount,
            COALESCE(SUM(p.amount), 0) AS paid_amount
     FROM bills b LEFT JOIN payments p ON p.bill_id = b.id
     WHERE b.subscriber_id = $1
     GROUP BY b.id ORDER BY b.period_start DESC`, // WHERE = only this user's bills; newest period first
    [req.subscriberId], // id taken from the JWT, not from the browser request
  );
  const bills = rows.map((b) => ({
    ...b, // keep all columns
    paid_amount: Number(b.paid_amount), // SUM may come back as text, so convert to a number
    balance: Math.max(b.total_amount - Number(b.paid_amount), 0), // amount still due
    status: statusOf(b.total_amount, Number(b.paid_amount)), // paid / unpaid
  }));
  // Send the list plus the total outstanding amount (sum of all balances)
  res.json({ bills, outstanding: bills.reduce((s, b) => s + b.balance, 0) });
});

// One bill with its items and payments
router.get('/:id', async (req, res) => {
  const bill = await loadBill(req.subscriberId, Number(req.params.id)); // :id from the URL, as a number
  if (!bill) return res.status(404).json({ error: 'Bill not found.' }); // missing or not yours
  res.json(bill);
});

// Download a bill as pdf, xlsx or csv
router.get('/:id/download', async (req, res) => {
  const format = String(req.query.format ?? 'pdf').toLowerCase(); // ?format=csv, defaults to pdf
  if (!['pdf', 'xlsx', 'csv'].includes(format)) { // allow only these three
    return res.status(400).json({ error: 'Format must be pdf, xlsx or csv.' });
  }
  const bill = await loadBill(req.subscriberId, Number(req.params.id)); // same ownership check
  if (!bill) return res.status(404).json({ error: 'Bill not found.' });
  const subscriber = await getSubscriber(req.subscriberId); // customer details for the file
  const filename = `${bill.bill_number}.${format}`; // e.g. AV-9876543210-202607.pdf

  // Tells the browser to save the response as a file with this name
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  if (format === 'csv') {
    res.type('text/csv').send(billToCsv(bill, subscriber)); // CSV is plain text
  } else if (format === 'xlsx') {
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); // Excel file type
    res.send(Buffer.from(await billToXlsx(bill, subscriber))); // wait for Excel file, send as raw bytes
  } else {
    res.type('application/pdf');
    billToPdf(bill, subscriber, res); // PDF is streamed straight into the response
  }
});

// Mock payment: returns a UPI-style deep link for the QR code. No money moves.
router.post('/:id/payment-intent', async (req, res) => {
  const bill = await loadBill(req.subscriberId, Number(req.params.id));
  if (!bill) return res.status(404).json({ error: 'Bill not found.' });
  // 409 = Conflict: nothing to pay
  if (bill.status === 'paid') return res.status(409).json({ error: 'This bill is already paid.' });

  // Build the link's query string safely (handles spaces and special characters)
  const params = new URLSearchParams({
    pa: process.env.UPI_PAYEE_ID || 'airvoice@demobank', // pa = payee UPI id (from .env or default)
    pn: 'AirVoice', // pn = payee name
    am: bill.balance.toFixed(2), // am = amount: remaining balance with 2 decimals
    cu: 'INR', // cu = currency
    tn: `Bill ${bill.bill_number}`, // tn = note shown in the UPI app
    tr: `AV${bill.id}${Date.now()}`, // tr = unique transaction reference
  });
  // The frontend turns upiLink into a QR code
  res.json({ upiLink: `upi://pay?${params.toString()}`, amount: bill.balance, billNumber: bill.bill_number });
});

// Demo-only: simulates the bank confirming the payment so the history updates
router.post('/:id/simulate-payment', async (req, res) => {
  const bill = await loadBill(req.subscriberId, Number(req.params.id));
  if (!bill) return res.status(404).json({ error: 'Bill not found.' });
  if (bill.status === 'paid') return res.status(409).json({ error: 'This bill is already paid.' });

  await pool.query(
    // Adds a payment row for the full remaining balance. subscriber_id is filled by the DB trigger
    `INSERT INTO payments (bill_id, paid_on, amount, method, reference) VALUES ($1, now(), $2, 'UPI', $3)`,
    // Reference looks like MOCK-A1B2C3D4 (4 random bytes as hex, in capitals)
    [bill.id, bill.balance, `MOCK-${crypto.randomBytes(4).toString('hex').toUpperCase()}`],
  );
  res.json({ message: 'Payment recorded (mock).' });
});

export default router; // index.js mounts this router