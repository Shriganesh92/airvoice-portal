-- AirVoice schema + sample data
-- Standard package per cycle: voice 200 + DTH 300 + internet 700 = 1200
-- Extra usage: one extra line of 100 on the bill (total becomes 1300)
-- You type the bill ITEMS; the bill TOTAL is calculated from them (see step 4).
-- Payment method: UPI only.

DROP TABLE IF EXISTS payments, bill_items, bills, subscribers CASCADE;
DROP FUNCTION IF EXISTS fill_subscriber_id() CASCADE;

-- ============ TABLES ============

CREATE TABLE subscribers (
  id      SERIAL PRIMARY KEY,
  mobile  VARCHAR(10) UNIQUE NOT NULL,
  name    TEXT NOT NULL,
  email   TEXT NOT NULL,            -- OTP is sent here (Mailpit)
  plan    TEXT NOT NULL,
  status  TEXT NOT NULL CHECK (status IN ('active', 'inactive'))
);

CREATE TABLE bills (
  id            SERIAL PRIMARY KEY,
  subscriber_id INT NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  bill_number   TEXT UNIQUE NOT NULL,
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  due_date      DATE NOT NULL,
  total_amount  NUMERIC(10,2) NOT NULL DEFAULT 0,   -- filled in by step 4 below
  UNIQUE (id, subscriber_id)        -- lets other tables check bill + owner together
);

CREATE TABLE bill_items (
  id            SERIAL PRIMARY KEY,
  subscriber_id INT NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  bill_id       INT NOT NULL,
  service_type  TEXT NOT NULL CHECK (service_type IN ('voice', 'dth', 'internet')),
  description   TEXT NOT NULL,
  amount        NUMERIC(10,2) NOT NULL,
  FOREIGN KEY (bill_id, subscriber_id) REFERENCES bills(id, subscriber_id) ON DELETE CASCADE
);

CREATE TABLE payments (
  id            SERIAL PRIMARY KEY,
  subscriber_id INT NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  bill_id       INT NOT NULL,
  paid_on       TIMESTAMPTZ NOT NULL,
  amount        NUMERIC(10,2) NOT NULL,
  method        TEXT NOT NULL DEFAULT 'UPI',
  reference     TEXT NOT NULL,
  FOREIGN KEY (bill_id, subscriber_id) REFERENCES bills(id, subscriber_id) ON DELETE CASCADE
);

CREATE INDEX idx_bills_subscriber ON bills(subscriber_id);
CREATE INDEX idx_payments_bill ON payments(bill_id);

-- The app's "Simulate payment" button inserts a payment with only a bill_id.
-- This helper fills in subscriber_id automatically so the app keeps working.
CREATE FUNCTION fill_subscriber_id() RETURNS trigger AS $$
BEGIN
  IF NEW.subscriber_id IS NULL THEN
    SELECT subscriber_id INTO NEW.subscriber_id FROM bills WHERE id = NEW.bill_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payments_fill_subscriber
BEFORE INSERT ON payments
FOR EACH ROW EXECUTE FUNCTION fill_subscriber_id();

-- ============ 1. SUBSCRIBERS ============
INSERT INTO subscribers (id, mobile, name, email, plan, status) VALUES
  (1, '9876543210', 'Arjun Kumar',  'arjun.kumar@example.com',  'AirVoice Triple Play 1200', 'active'),
  (2, '9123456780', 'Priya Raman',  'priya.raman@example.com',  'AirVoice Triple Play 1200', 'active'),
  (3, '9000000001', 'Ravi Shankar', 'ravi.shankar@example.com', 'AirVoice Triple Play 1200', 'inactive');

-- ============ 2. BILLS (no total here; it is calculated in step 4) ============
-- (id, subscriber_id, bill_number, period_start, period_end, due_date)
INSERT INTO bills (id, subscriber_id, bill_number, period_start, period_end, due_date) VALUES
  -- Arjun (subscriber 1)
  (1, 1, 'AV-9876543210-202607', '2026-07-15', '2026-08-14', '2026-08-24'),
  (2, 1, 'AV-9876543210-202608', '2026-08-15', '2026-09-14', '2026-09-24'),   -- has extra usage
  (3, 1, 'AV-9876543210-202609', '2026-09-15', '2026-10-14', '2026-10-24'),
  -- Priya (subscriber 2)
  (4, 2, 'AV-9123456780-202607', '2026-07-15', '2026-08-14', '2026-08-24'),
  (5, 2, 'AV-9123456780-202608', '2026-08-15', '2026-09-14', '2026-09-24'),   -- has extra usage
  (6, 2, 'AV-9123456780-202609', '2026-09-15', '2026-10-14', '2026-10-24');

-- ============ 3. BILL ITEMS ============
-- (subscriber_id, bill_id, service, description, amount)
INSERT INTO bill_items (subscriber_id, bill_id, service_type, description, amount) VALUES
  -- Arjun bill 1: standard package
  (1, 1, 'voice',    'Postpaid voice',    200.00),
  (1, 1, 'dth',      'DTH Pack',          300.00),
  (1, 1, 'internet', 'Fibre Internet',    700.00),
  -- Arjun bill 2: standard + 100 extra data usage
  (1, 2, 'voice',    'Postpaid voice',    200.00),
  (1, 2, 'dth',      'DTH Pack',          300.00),
  (1, 2, 'internet', 'Fibre Internet',    700.00),
  (1, 2, 'internet', 'Extra data usage',  100.00),
  -- Arjun bill 3: standard package
  (1, 3, 'voice',    'Postpaid voice',    200.00),
  (1, 3, 'dth',      'DTH Pack',          300.00),
  (1, 3, 'internet', 'Fibre Internet',    700.00),

  -- Priya bill 4: standard package
  (2, 4, 'voice',    'Postpaid voice',    200.00),
  (2, 4, 'dth',      'DTH Pack',          300.00),
  (2, 4, 'internet', 'Fibre Internet',    700.00),
  -- Priya bill 5: standard + 100 extra voice usage
  (2, 5, 'voice',    'Postpaid voice',    200.00),
  (2, 5, 'voice',    'Extra voice usage', 100.00),
  (2, 5, 'dth',      'DTH Pack',          300.00),
  (2, 5, 'internet', 'Fibre Internet',    700.00),
  -- Priya bill 6: standard package
  (2, 6, 'voice',    'Postpaid voice',    200.00),
  (2, 6, 'dth',      'DTH Pack',          300.00),
  (2, 6, 'internet', 'Fibre Internet',    700.00);

-- ============ 4. TOTAL BILL (calculated from the items above) ============
-- For every bill: total = sum of that bill's own items.
-- Run this again whenever you add or change bill items.
UPDATE bills
SET total_amount = (SELECT COALESCE(SUM(amount), 0)
                    FROM bill_items
                    WHERE bill_items.bill_id = bills.id);

-- ============ 5. PAYMENTS (UPI only) ============
-- (subscriber_id, bill_id, paid_on, amount, method, reference)
-- A bill is PAID when its payments add up to the bill total. No payment = UNPAID.
INSERT INTO payments (subscriber_id, bill_id, paid_on, amount, method, reference) VALUES
  -- Arjun bill 1 (1200): paid in two UPI parts (700 + 500)
  (1, 1, '2026-08-20 10:00+05:30',  700.00, 'UPI', 'TXN100001'),
  (1, 1, '2026-08-22 18:30+05:30',  500.00, 'UPI', 'TXN100002'),
  -- Arjun bills 2 and 3: no payments (unpaid)

  -- Priya bills 4 (1200) and 5 (1300): paid in full by UPI
  (2, 4, '2026-08-18 09:15+05:30', 1200.00, 'UPI', 'TXN200001'),
  (2, 5, '2026-09-20 20:00+05:30', 1300.00, 'UPI', 'TXN200002');
  -- Priya bill 6: no payment (unpaid)

-- ============ KEEP ID COUNTERS IN SYNC ============
SELECT setval('subscribers_id_seq', (SELECT MAX(id) FROM subscribers));
SELECT setval('bills_id_seq',       (SELECT MAX(id) FROM bills));