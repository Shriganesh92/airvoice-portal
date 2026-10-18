import { useEffect, useState } from 'react'; // useState = remember values; useEffect = run code when the page loads
import { Link, useNavigate, useParams } from 'react-router-dom'; // Link = clickable link; useNavigate = change page from code; useParams = read :id from the URL
import { QRCodeSVG } from 'qrcode.react'; // draws a QR code as an SVG picture from any text
import { api, inr } from '../api.js'; // API calls + money formatter

export default function Pay() {
  const { id } = useParams(); // bill id from the URL /bills/:id/pay
  const navigate = useNavigate(); // function to jump to another URL
  const [intent, setIntent] = useState(null); // { upiLink, amount, billNumber } from the server (null until it arrives)
  const [error, setError] = useState(''); // error message ('' = none)
  const [busy, setBusy] = useState(false); // true while the simulated payment is being recorded

  // Runs when the page appears (and again if "id" changes)
  useEffect(() => {
    // Ask the server for the payment details; on success store them (page redraws), on failure store the message
    api.paymentIntent(id).then(setIntent).catch((e) => setError(e.message)); // e.g. "This bill is already paid."
  }, [id]);

  // Called when the demo button is clicked
  const simulate = async () => {
    setBusy(true); setError(''); // disable the button; clear old error
    // Record the mock payment, then go to the bill page, where the new payment now shows up
    try { await api.simulatePayment(id); navigate(`/bills/${id}`); }
    // On failure show the message and re-enable the button. (On success we leave the page, so no reset is needed)
    catch (e) { setError(e.message); setBusy(false); }
  };

  return (
    <div className="pay">
      <Link to={`/bills/${id}`}>← Back to bill</Link>
      <h1>Pay your bill</h1>
      {/* role="alert" makes screen readers announce the error */}
      {error && <p className="error" role="alert">{error}</p>}
      {/* Waiting for the server and nothing has failed: show a loading message */}
      {!intent && !error && <p className="muted">Preparing payment…</p>}
      {/* The card appears only once the payment details have arrived */}
      {intent && (
        <div className="pay-card">
          <p className="muted">{intent.billNumber}</p>
          <p className="summary-amount">{inr(intent.amount)}</p> {/* remaining balance, e.g. ₹1,300.00 */}
          {/* The QR encodes the upi://pay?... link built by the server (billing.js) */}
          <div className="qr"><QRCodeSVG value={intent.upiLink} size={220} marginSize={2} /></div>
          <p>Scan with any UPI app to pay.</p>
          <p className="hint">Demo only: this QR is a sample payment link. No real payment is taken.</p>
          {/* Shows the raw link as text, so a reviewer can see what the QR contains */}
          <code className="upi-string">{intent.upiLink}</code>
          {/* Fake "bank confirmation": disabled while busy so it can't be double-clicked */}
          <button className="btn btn-primary" onClick={simulate} disabled={busy}>
            {busy ? 'Recording…' : 'Simulate successful payment'}
          </button>
        </div>
      )}
    </div>
  );
}
