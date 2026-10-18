// Small label that shows "Paid" or "Unpaid". "status" is a prop passed in by the page: 'paid' or 'unpaid'
export default function StatusBadge({ status }) {
  // The CSS class becomes "badge badge-paid" or "badge badge-unpaid", so styles.css can colour each one differently
  // The visible text is "Paid" when status is 'paid', otherwise "Unpaid"
  return <span className={`badge badge-${status}`}>{status === 'paid' ? 'Paid' : 'Unpaid'}</span>;
}
