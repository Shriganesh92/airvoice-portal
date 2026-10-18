import { useEffect, useState } from 'react'; // useState = remember values; useEffect = run code when the page loads
import { Link, useNavigate } from 'react-router-dom'; // Link = clickable link; useNavigate = change page from code
import StatusBadge from '../components/StatusBadge.jsx'; // small Paid/Unpaid label
import { api, fmtDate, fmtMonth, inr } from '../api.js'; // API calls + date and money formatters

export default function Bills() {
  const navigate = useNavigate(); // function to jump to another URL
  const [data, setData] = useState(null); // { bills, outstanding } from the server (null until it arrives)
  const [error, setError] = useState(''); // error message ('' = none)

  // [] at the end = run once, when the page first appears
  useEffect(() => {
    // Fetch the bill list; on success store it (page redraws), on failure store the error message
    api.listBills().then(setData).catch((e) => setError(e.message));
  }, []);

  // Early returns: show an error, or a loading message, instead of the normal page
  if (error) return <p className="error" role="alert">{error}</p>; // role="alert" makes screen readers announce it
  if (!data) return <p className="muted">Loading your bills…</p>;

  // Keep only the unpaid bills (used for the summary box)
  const unpaid = data.bills.filter((b) => b.status === 'unpaid');

  return (
    <>
      {/* Summary box at the top */}
      <section className="summary">
        <div>
          <p className="muted">Amount due</p>
          <p className="summary-amount">{inr(data.outstanding)}</p> {/* total still owed, calculated by the server */}
          <p className="muted">
            {/* No unpaid bills: friendly message; otherwise "2 unpaid bills" (the s is added when there is more than 1) */}
            {unpaid.length === 0 ? 'You are all paid up.' : `${unpaid.length} unpaid bill${unpaid.length > 1 ? 's' : ''}`}
          </p>
        </div>
        {/* Shortcut button only if something is unpaid; unpaid[0] = first in the list (the newest, since the server sorts newest first) */}
        {unpaid.length > 0 && (
          <button className="btn btn-accent" onClick={() => navigate(`/bills/${unpaid[0].id}/pay`)}>
            Pay {fmtMonth(unpaid[0].period_start)} bill
          </button>
        )}
      </section>

      <h2>Billing history</h2>
      {/* No bills at all (e.g. a new subscriber): show a message instead of an empty table */}
      {data.bills.length === 0 ? (
        <p className="muted">No bills yet. Your first bill appears after your first billing cycle.</p>
      ) : (
        // table-scroll lets the table scroll sideways on small phone screens
        <div className="table-scroll">
          <table>
            <thead>
              {/* The last <th /> is an empty header for the button column */}
              <tr><th>Billing period</th><th>Bill number</th><th>Due</th><th className="num">Total</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {/* One row per bill; key = database id so React can track each row */}
              {data.bills.map((b) => (
                <tr key={b.id}>
                  <td><Link to={`/bills/${b.id}`}>{fmtMonth(b.period_start)}</Link></td> {/* month name links to the detail page */}
                  <td className="muted">{b.bill_number}</td>
                  <td>{fmtDate(b.due_date)}</td>
                  <td className="num">{inr(b.total_amount)}</td>
                  <td><StatusBadge status={b.status} /></td>
                  <td className="num">
                    {/* Unpaid: "Pay now" button; paid: "View" button */}
                    {b.status === 'unpaid'
                      ? <Link className="btn btn-small btn-accent" to={`/bills/${b.id}/pay`}>Pay now</Link>
                      : <Link className="btn btn-small btn-quiet" to={`/bills/${b.id}`}>View</Link>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}