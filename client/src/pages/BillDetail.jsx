import { useEffect, useState } from 'react'; // useState = remember values; useEffect = run code when the page loads
import { Link, useParams } from 'react-router-dom'; // Link = clickable link without page reload; useParams = read :id from the URL
import StatusBadge from '../components/StatusBadge.jsx'; // small Paid/Unpaid label
import { api, fmtDate, fmtMonth, inr } from '../api.js'; // API calls + date and money formatters

// Maps the database value to the text shown on screen, e.g. "dth" -> "DTH"
const SERVICE_LABEL = { voice: 'Voice', dth: 'DTH', internet: 'Internet' };

export default function BillDetail() {
  const { id } = useParams(); // bill id from the URL /bills/:id
  const [bill, setBill] = useState(null); // the loaded bill (null until it arrives)
  const [error, setError] = useState(''); // error message to show ('' = none)
  const [downloading, setDownloading] = useState(''); // which format is being prepared ('' = none)

  // Runs after the page first appears, and again whenever "id" changes (see [id] below)
  useEffect(() => {
    // Fetch the bill; on success store it (this redraws the page), on failure store the error message
    api.getBill(id).then(setBill).catch((e) => setError(e.message));
  }, [id]);

  // Called when a download button is clicked (format = pdf, xlsx or csv)
  const download = async (format) => {
    setError(''); setDownloading(format); // clear old error; remember which button is busy
    try { await api.download(bill.id, format, `${bill.bill_number}.${format}`); } // fetch the file and save it
    catch (e) { setError(e.message); } // show the problem to the user
    finally { setDownloading(''); } // runs in both cases: re-enable the buttons
  };

  // Failed to load the bill (e.g. not found / not yours): show only a back link and the error
  // role="alert" makes screen readers announce the message
  if (error && !bill) return <><Link to="/">← All bills</Link><p className="error" role="alert">{error}</p></>;
  // Still waiting for the server
  if (!bill) return <p className="muted">Loading bill…</p>;

  // Normal view: the bill was loaded
  return (
    <>
      <Link to="/">← All bills</Link>
      <div className="bill-head">
        <div>
          <h1>{fmtMonth(bill.period_start)} bill</h1> {/* e.g. "September 2026 bill" */}
          <p className="muted">{bill.bill_number} · {fmtDate(bill.period_start)} to {fmtDate(bill.period_end)} · due {fmtDate(bill.due_date)}</p>
        </div>
        <StatusBadge status={bill.status} /> {/* Paid or Unpaid badge */}
      </div>

      {/* Show a download error here (only appears if there is one) */}
      {error && <p className="error" role="alert">{error}</p>}

      <div className="actions">
        {/* Pay button appears only for unpaid bills, and shows the amount still due */}
        {bill.status === 'unpaid' && (
          <Link className="btn btn-accent" to={`/bills/${bill.id}/pay`}>Pay {inr(bill.balance)}</Link>
        )}
        {/* Loop over the three formats to make three buttons (key helps React track each one) */}
        {['pdf', 'xlsx', 'csv'].map((f) => (
          // While one download is running, all buttons are disabled (!! turns the text into true/false)
          <button key={f} className="btn btn-quiet" disabled={!!downloading} onClick={() => download(f)}>
            {/* Shows "Preparing…" on the clicked button; "xlsx" is displayed as "XLS" */}
            {downloading === f ? 'Preparing…' : `Download ${f === 'xlsx' ? 'XLS' : f.toUpperCase()}`}
          </button>
        ))}
      </div>

      <h2>Charges</h2>
      {/* table-scroll lets the table scroll sideways on small phone screens */}
      <div className="table-scroll">
        <table>
          <thead><tr><th>Service</th><th>Description</th><th className="num">Amount</th></tr></thead>
          <tbody>
            {/* One row per bill item; idx (position) is used as key because items have no id here */}
            {bill.items.map((i, idx) => (
              <tr key={idx}><td>{SERVICE_LABEL[i.service_type]}</td><td>{i.description}</td><td className="num">{inr(i.amount)}</td></tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={2}>Total</td><td className="num">{inr(bill.total_amount)}</td></tr> {/* colSpan={2} = cell spans two columns */}
            <tr><td colSpan={2} className="muted">Paid so far</td><td className="num muted">{inr(bill.paid_amount)}</td></tr>
            {/* Balance row appears only if something is still owed */}
            {bill.balance > 0 && <tr><td colSpan={2}>Balance due</td><td className="num">{inr(bill.balance)}</td></tr>}
          </tfoot>
        </table>
      </div>

      <h2>Payments</h2>
      {/* No payments: show a message; otherwise show the payment table */}
      {bill.payments.length === 0 ? (
        <p className="muted">No payments yet for this bill.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {/* One row per payment; p.id from the database is a good unique key */}
              {bill.payments.map((p) => (
                <tr key={p.id}><td>{fmtDate(p.paid_on)}</td><td>{p.method}</td><td className="muted">{p.reference}</td><td className="num">{inr(p.amount)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}