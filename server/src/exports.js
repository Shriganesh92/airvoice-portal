import ExcelJS from 'exceljs'; // builds Excel (.xlsx) files
import PDFDocument from 'pdfkit'; // builds PDF files

// Formats a number as money text, e.g. 1200 -> "Rs. 1200.00"
const inr = (n) => `Rs. ${Number(n).toFixed(2)}`;
// Wraps a value in quotes for CSV; a quote inside the value is doubled ("" ) as CSV requires
const csvCell = (v) => `"${String(v).replaceAll('"', '""')}"`;

// Builds the CSV text for one bill
export function billToCsv(bill, subscriber) {
  const rows = [ // each inner array = one CSV line
    ['Bill number', bill.bill_number],
    ['Subscriber', subscriber.name],
    ['Mobile', subscriber.mobile],
    ['Billing period', `${bill.period_start} to ${bill.period_end}`],
    ['Due date', bill.due_date],
    ['Status', bill.status],
    [], // empty line = blank row
    ['Service', 'Description', 'Amount (INR)'], // header of the charges table
    ...bill.items.map((i) => [i.service_type, i.description, i.amount.toFixed(2)]), // one row per service line
    ['', 'Total', bill.total_amount.toFixed(2)],
    [],
    ['Payment date', 'Method', 'Reference', 'Amount (INR)'], // header of the payments table
    // slice(0, 10) keeps only the date part of 2026-09-20T10:30:00
    ...bill.payments.map((p) => [p.paid_on.slice(0, 10), p.method, p.reference, p.amount.toFixed(2)]),
  ];
  // Quote every cell, join cells with commas and lines with \r\n (the CSV line break)
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

// Builds the Excel file for one bill; async because ExcelJS writes the file asynchronously
export async function billToXlsx(bill, subscriber) {
  const wb = new ExcelJS.Workbook(); // the workbook (the whole .xlsx file)
  const ws = wb.addWorksheet('Bill'); // one sheet named "Bill"
  ws.columns = [{ width: 18 }, { width: 38 }, { width: 18 }, { width: 16 }]; // column widths A to D

  ws.addRow(['AirVoice - Bill', bill.bill_number]).font = { bold: true, size: 14 }; // title row, bold and bigger
  ws.addRow(['Subscriber', subscriber.name]);
  ws.addRow(['Mobile', subscriber.mobile]);
  ws.addRow(['Billing period', `${bill.period_start} to ${bill.period_end}`]);
  ws.addRow(['Due date', bill.due_date]);
  ws.addRow(['Status', bill.status]);
  ws.addRow([]); // blank row
  ws.addRow(['Service', 'Description', 'Amount (INR)']).font = { bold: true }; // table header in bold
  bill.items.forEach((i) => ws.addRow([i.service_type, i.description, i.amount])); // one row per service (amount stays a real number)
  ws.addRow(['', 'Total', bill.total_amount]).font = { bold: true };
  ws.addRow([]);
  ws.addRow(['Payment date', 'Method', 'Reference', 'Amount (INR)']).font = { bold: true };
  bill.payments.forEach((p) => ws.addRow([p.paid_on.slice(0, 10), p.method, p.reference, p.amount]));
  ws.getColumn(3).numFmt = '#,##0.00'; // column C shows numbers like 1,200.00
  ws.getColumn(4).numFmt = '#,##0.00'; // column D (payment amounts) same format

  return wb.xlsx.writeBuffer(); // returns the file as bytes; billing.js sends it to the browser
}

// Streams a PDF straight into the HTTP response
export function billToPdf(bill, subscriber, res) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' }); // new A4 page with 50pt margins
  doc.pipe(res); // everything written to doc goes straight to the browser

  doc.fillColor('#0B5C75').fontSize(22).text('AirVoice', { continued: false }); // brand name in teal
  doc.fillColor('#555').fontSize(10).text('Voice | DTH | Internet'); // grey tagline
  doc.moveDown(); // blank line

  doc.fillColor('#000').fontSize(14).text(`Bill ${bill.bill_number}`); // bill heading in black
  doc.fontSize(10).fillColor('#333'); // smaller dark-grey text for details
  doc.text(`Subscriber: ${subscriber.name}  (${subscriber.mobile})`);
  doc.text(`Plan: ${subscriber.plan}`);
  doc.text(`Billing period: ${bill.period_start} to ${bill.period_end}`);
  doc.text(`Due date: ${bill.due_date}`);
  doc.text(`Status: ${bill.status.toUpperCase()}`); // PAID / UNPAID
  doc.moveDown();

  // Helper that draws one table row. cols = cell texts, widths = column widths, bold = header/total style
  const row = (cols, widths, bold = false) => {
    const y = doc.y; // remember the row's top position so all cells line up
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
    let x = 50; // start at the left margin
    cols.forEach((c, i) => {
      // Last column (the amount) is right-aligned; width - 8 leaves a small gap between columns
      doc.text(String(c), x, y, { width: widths[i] - 8, align: i === cols.length - 1 ? 'right' : 'left' });
      x += widths[i]; // move right for the next cell
    });
    doc.moveDown(0.4); // small gap before the next row
  };

  doc.fontSize(12).fillColor('#000').font('Helvetica-Bold').text('Charges'); // section heading
  doc.moveDown(0.3).fontSize(10);
  row(['Service', 'Description', 'Amount'], [90, 305, 100], true); // table header
  bill.items.forEach((i) => row([i.service_type, i.description, inr(i.amount)], [90, 305, 100])); // one row per service
  row(['', 'Total', inr(bill.total_amount)], [90, 305, 100], true); // total row in bold

  doc.moveDown().fontSize(12).font('Helvetica-Bold').text('Payments'); // section heading
  doc.moveDown(0.3).fontSize(10);
  if (bill.payments.length === 0) { // nothing paid yet
    doc.font('Helvetica').text('No payments recorded yet.');
  } else {
    row(['Date', 'Method / Ref', 'Amount'], [90, 305, 100], true); // table header
    bill.payments.forEach((p) =>
      row([p.paid_on.slice(0, 10), `${p.method} - ${p.reference}`, inr(p.amount)], [90, 305, 100]),
    );
  }
  doc.end(); // finish the PDF; this closes the response
}
