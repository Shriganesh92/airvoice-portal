-- AirVoice: add new subscriber Ram Kumar (id 4)
-- Run this in pgAdmin (airvoice database -> Query Tool) AFTER db/init.sql has been run.
-- Do NOT re-run init.sql for this; init.sql wipes all data.
--
-- Plan: AirVoice Dual Plan 1000 = Voice 200 + Internet 800 = 1000 per cycle (no DTH)
-- Extra usage: extra lines of 100 on the bill
-- Payment references: TXN + subscriber id + 2-digit number (Ram = TXN4000xx)
--
-- Safe to re-run: step 0 removes any earlier copy of Ram first
-- (ON DELETE CASCADE also removes his bills, items and payments).

-- ============ 0. CLEAN UP ANY EARLIER COPY ============
DELETE FROM subscribers WHERE id = 4;

-- ============ 1. SUBSCRIBER ============
INSERT INTO subscribers (id, mobile, name, email, plan, status) VALUES
  (4, '9012345678', 'Ram Kumar', 'ram.kumar@example.com', 'AirVoice Dual Plan 1000', 'active');

-- ============ 2. BILLS (no total here; it is calculated in step 4) ============
-- (id, subscriber_id, bill_number, period_start, period_end, due_date)
INSERT INTO bills (id, subscriber_id, bill_number, period_start, period_end, due_date) VALUES
  (7, 4, 'AV-9012345678-202607', '2026-07-15', '2026-08-14', '2026-08-24'),   -- extra data usage
  (8, 4, 'AV-9012345678-202608', '2026-08-15', '2026-09-14', '2026-09-24'),   -- extra voice + extra data usage
  (9, 4, 'AV-9012345678-202609', '2026-09-15', '2026-10-14', '2026-10-24');   -- standard package

-- ============ 3. BILL ITEMS ============
-- (subscriber_id, bill_id, service, description, amount)
INSERT INTO bill_items (subscriber_id, bill_id, service_type, description, amount) VALUES
  -- Bill 7: standard + 100 extra data usage = 1100
  (4, 7, 'voice',    'Postpaid voice',    200.00),
  (4, 7, 'internet', 'Fibre Internet',    800.00),
  (4, 7, 'internet', 'Extra data usage',  100.00),
  -- Bill 8: standard + 100 extra voice + 100 extra data usage = 1200
  (4, 8, 'voice',    'Postpaid voice',    200.00),
  (4, 8, 'voice',    'Extra voice usage', 100.00),
  (4, 8, 'internet', 'Fibre Internet',    800.00),
  (4, 8, 'internet', 'Extra data usage',  100.00),
  -- Bill 9: standard package = 1000
  (4, 9, 'voice',    'Postpaid voice',    200.00),
  (4, 9, 'internet', 'Fibre Internet',    800.00);

-- ============ 4. TOTAL BILL (calculated from the items above) ============
-- Same statement as in init.sql. Re-run it whenever bill items change.
UPDATE bills
SET total_amount = (SELECT COALESCE(SUM(amount), 0)
                    FROM bill_items
                    WHERE bill_items.bill_id = bills.id);

-- ============ 5. PAYMENTS (UPI only) ============
-- (subscriber_id, bill_id, paid_on, amount, method, reference)
-- Bill 7 (1100): paid in full -> PAID 
-- Bills 8 (1200) and 9 (1000): no payment -> UNPAID 
INSERT INTO payments (subscriber_id, bill_id, paid_on, amount, method, reference) VALUES
  (4, 7, '2026-08-20 11:00+05:30', 1100.00, 'UPI', 'TXN400001');

-- ============ 6. KEEP ID COUNTERS IN SYNC ============
SELECT setval('subscribers_id_seq', (SELECT MAX(id) FROM subscribers));
SELECT setval('bills_id_seq',       (SELECT MAX(id) FROM bills));

-- ============ CHECK: expect 1100 (paid 1100), 1200 (paid 0), 1000 (paid 0) ============
SELECT b.bill_number, b.total_amount, COALESCE(SUM(p.amount), 0) AS paid
FROM bills b
LEFT JOIN payments p ON p.bill_id = b.id
WHERE b.subscriber_id = 4
GROUP BY b.id, b.bill_number, b.total_amount
ORDER BY b.bill_number;