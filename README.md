# AirVoice Billing Portal

A self-service web portal for AirVoice **postpaid** subscribers (voice, DTH, internet).
A subscriber logs in with their registered mobile number and an emailed OTP, reviews their
monthly bills and payments, downloads any bill as PDF / XLS / CSV, and pays an unpaid bill
through a mock UPI QR code.

> Everything involving money, SMS and email delivery is **simulated**. No real payment, SMS gateway or credentials are used.

---

## Contents

1. [Features](#1-features)
2. [Tech stack and why](#2-tech-stack-and-why)
3. [Setup and run](#3-setup-and-run)
4. [Sample data and test accounts](#4-sample-data-and-test-accounts)
5. [Database design](#5-database-design)
6. [Assumptions (and why)](#6-assumptions-and-why)
7. [How it works](#7-how-it-works)
8. [API reference](#8-api-reference)
9. [Error handling](#9-error-handling)
10. [Manual test checklist](#10-manual-test-checklist)
11. [Known limitations](#11-known-limitations)
12. [AI assistance: what I built vs what the AI built](#12-ai-assistance)
13. [Project structure](#13-project-structure)

---

## 1. Features

| Requirement | Where it lives |
|---|---|
| Login with registered mobile number + OTP, delivered by email through Mailpit | `server/src/auth.js`, `client/src/pages/Login.jsx` |
| Validate the mobile against the data source and confirm status is **active** | `request-otp` (and again in `verify-otp`) |
| Clear errors for invalid, unregistered and inactive numbers | `auth.js`, shown in `Login.jsx` |
| Bill list: period, total, paid / unpaid | `server/src/billing.js` (`GET /api/bills`), `client/src/pages/Bills.jsx` |
| Itemised bill by service (voice / DTH / internet) | `GET /api/bills/:id`, `BillDetail.jsx` |
| Payment history per bill (date, amount, method, reference) | `GET /api/bills/:id`, `BillDetail.jsx` |
| Download a bill as PDF, XLS or CSV | `server/src/exports.js`, `GET /api/bills/:id/download` |
| Unpaid bill leads to a payment screen with a UPI-style QR | `POST /api/bills/:id/payment-intent`, `Pay.jsx` |
| PostgreSQL as data source | `db/init.sql` |

---

## 2. Tech stack and why

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 18 + Vite + React Router | React was the preferred option. Vite gives a fast dev server and a simple setup. |
| Backend | Node.js 20.6+ and Express 5 | A browser must not hold database credentials, send email or verify OTPs, so a small API is needed. Express 5 forwards errors from `async` handlers automatically. |
| Database | PostgreSQL 16 | The brief allows PostgreSQL instead of Google Sheets. It avoids Google credentials and gives real constraints (keys, checks). |
| Email (OTP) | Nodemailer to **Mailpit** (SMTP `localhost:1025`) | Mailpit catches emails locally, so no real mail account is needed. |
| Auth | JWT (`jsonwebtoken`) | Stateless sessions. The subscriber id inside the token scopes every query. |
| Exports | `pdfkit`, `exceljs`, hand-written CSV | Free libraries, files generated on the server from the same loaded bill. |
| QR | `qrcode.react` | Renders the UPI link as an SVG QR code. |

All tools are free and open source.

---

## 3. Setup and run

### Prerequisites

- **Node.js 20.6 or newer** (the server uses `node --env-file`)
- **PostgreSQL 14+** (developed on 16), with `psql` or pgAdmin
- **Mailpit** (free single-file download from the Mailpit GitHub releases page)

### Step 1: Create the database

Create an empty database called `airvoice`, then run `db/init.sql` inside it.

**Using pgAdmin:** right-click *Databases > Create > Database...*, name it `airvoice`, then open
*Query Tool* on that database, open `db/init.sql` and run it (F5).

**Using psql:**

```bash
psql -U postgres -c "CREATE DATABASE airvoice;"
psql -U postgres -d airvoice -f db/init.sql
```

`init.sql` is safe to re-run: it drops and recreates every table, which resets the sample data.

### Step 2: Start Mailpit

Download and Extract the Zip file mailpit-windows-amd64.zip from this URL: https://github.com/axllent/mailpit/releases

Run the Mailpit executable using cmd and **leave it running**:

```bash
mailpit            # Windows: mailpit.exe
```

- SMTP server: `localhost:1025` (what the API sends to)
- Inbox web UI: <http://localhost:8025> (where you read the OTP)

### Step 3: Configure and start the API

```bash
cd server
npm install
copy .env.example .env        # macOS/Linux: cp .env.example .env
```

Edit `server/.env`:

- `DATABASE_URL`: the example uses a placeholder user `airvoice` / `airvoice_dev_pw`.
  Either create that role (below) or replace it with your own local user and password,
  for example `postgres://postgres:<your-password>@localhost:5432/airvoice`.
- `JWT_SECRET`: set a long random string. One way to make one:

  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

Optional: create the role used by the example file.

```sql
CREATE USER airvoice WITH PASSWORD 'airvoice_dev_pw';
GRANT ALL PRIVILEGES ON DATABASE airvoice TO airvoice;
```

(If you create the role after running `init.sql` as another user, also run
`GRANT ALL ON ALL TABLES IN SCHEMA public TO airvoice; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO airvoice;`
in the `airvoice` database. The simplest route is to run `init.sql` as the user the app will use.)

Start the API:

```bash
npm run dev
```

You should see `AirVoice API listening on http://localhost:4000`.

### Step 4: Start the web app

In a second terminal:

```bash
cd client
npm install
npm run dev
```

Open <http://localhost:5173>. The Vite dev server proxies `/api` to the API on port 4000,
so the browser only ever talks to one origin.

### Configuration reference (`server/.env.example`)

| Variable | Meaning |
|---|---|
| `PORT` | API port (default 4000) |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret used to sign login tokens. Never commit the real one. |
| `SMTP_HOST`, `SMTP_PORT` | Where OTP email is sent (Mailpit) |
| `MAIL_FROM` | "From" address on OTP emails |
| `OTP_TTL_SECONDS` | OTP lifetime, default 300 (5 minutes) |
| `UPI_PAYEE_ID` | Fake payee ID placed in the UPI link (`airvoice@demobank`) |
| `CLIENT_ORIGIN` | Allowed browser origin for CORS |

`server/.env` is listed in `.gitignore`. Only `.env.example` (placeholder values) is committed.

---

## 4. Sample data and test accounts

All sample data is typed by hand in `db/init.sql`, with explicit ids. Nothing is generated by formulas, so
what you read in the file is exactly what is in the database. The only calculation is the bill **total**,
which one `UPDATE` computes as the sum of that bill's own line items.

**Plan:** *AirVoice Triple Play 1200* = Voice 200 + DTH 300 + Internet 700 = **Rs. 1,200 per cycle**.
**Extra usage:** one extra line of Rs. 100 on a bill makes it **Rs. 1,300**.

| Mobile | Subscriber | Status | What to expect |
|---|---|---|---|
| `9876543210` | Arjun Kumar (`arjun.kumar@example.com`) | active | 3 bills. Amount due **Rs. 2,500** |
| `9123456780` | Priya Raman (`priya.raman@example.com`) | active | 3 bills. Amount due **Rs. 1,200** |
| `9000000001` | Ravi Shankar | **inactive** | Login refused with an "inactive account" message |
| `9999999999` | (none) | not in database | "Not registered" error |
| `123` | (none) | invalid format | "Enter a valid 10-digit mobile number" |

### Bills

| Bill | Subscriber | Cycle | Due | Total | Payments | Status |
|---|---|---|---|---|---|---|
| AV-9876543210-202607 | Arjun | 15 Jul - 14 Aug 2026 | 24 Aug 2026 | 1,200 | 700 + 500 (two UPI parts) | Paid |
| AV-9876543210-202608 | Arjun | 15 Aug - 14 Sep 2026 | 24 Sep 2026 | 1,300 (extra data usage) | none | Unpaid |
| AV-9876543210-202609 | Arjun | 15 Sep - 14 Oct 2026 | 24 Oct 2026 | 1,200 | none | Unpaid |
| AV-9123456780-202607 | Priya | 15 Jul - 14 Aug 2026 | 24 Aug 2026 | 1,200 | 1,200 | Paid |
| AV-9123456780-202608 | Priya | 15 Aug - 14 Sep 2026 | 24 Sep 2026 | 1,300 (extra voice usage) | 1,300 | Paid |
| AV-9123456780-202609 | Priya | 15 Sep - 14 Oct 2026 | 24 Oct 2026 | 1,200 | none | Unpaid |

Arjun's first bill shows a **split payment** (700 + 500) so the payment history is more than one row.

### How to log in during a demo

1. Enter `9876543210` and click **Send OTP**.
2. Open <http://localhost:8025>. The email "Your AirVoice login code" is there.
3. Type the 6-digit code and click **Verify and log in**.

### Adding another subscriber

Insert in this order: `subscribers`, then `bills`, then `bill_items`, then re-run the total `UPDATE`
(step 4 of `init.sql`), then `payments` (optional).

---

## 5. Database design

Four tables. Ownership flows **subscriber > bills > (bill_items, payments)**.

```
subscribers 1 ---- * bills 1 ---- * bill_items
                           1 ---- * payments
```

| Table | Purpose | Key columns |
|---|---|---|
| `subscribers` | Identity and status | `mobile` (unique), `name`, `email`, `plan`, `status` (`active` / `inactive`, CHECK constraint) |
| `bills` | One row per monthly bill | `bill_number` (unique), `period_start`, `period_end`, `due_date`, `total_amount` |
| `bill_items` | Service-wise breakdown | `service_type` (`voice` / `dth` / `internet`, CHECK), `description`, `amount` |
| `payments` | One row per payment | `paid_on` (timestamp with time zone), `amount`, `method` (default `UPI`), `reference` |

### Design decisions

- **Bill status is derived, not stored.** A bill is *paid* when the sum of its payments is at least its total.
  There is no `status` column that could disagree with the payments.
- **`subscriber_id` is on every table, protected by a composite foreign key.** `bills` has
  `UNIQUE (id, subscriber_id)`, and `bill_items` and `payments` reference `(bill_id, subscriber_id)`.
  The database therefore refuses an item or payment whose owner differs from the bill's owner.
- **A small trigger** (`fill_subscriber_id`) fills `subscriber_id` on `payments` from the bill when an insert
  supplies only `bill_id`. The "Simulate payment" button relies on this.
- **Money is `NUMERIC(10,2)`**, never floating point, in the database. The API converts to JS numbers for display.
- **Dates are `DATE`** (plain `YYYY-MM-DD` strings in the API, so no time-zone shifts). Payment moments are
  `TIMESTAMPTZ`.

---

## 6. Assumptions (and why)

These are the decisions I made.

| # | Assumption | Why |
|---|---|---|
| 1 | A valid mobile number is **10 digits starting with 6-9** (Indian mobiles), entered without country code. | Matches how Indian numbers work. It lets the server reject typos before touching the database. |
| 2 | The OTP is **emailed to the email stored on the subscriber** (via Mailpit), not sent to the typed number. | The brief says to use Mailpit instead of SMS. The registered email is the natural destination. The inbox is shown masked (`ar********@example.com`). |
| 3 | **OTP rules:** 6 digits, valid 5 minutes, single use, 3 wrong attempts then locked, 30-second resend cooldown. | Common, simple protection against guessing and spamming. Values are constants or env vars, easy to change. |
| 4 | OTPs are stored **hashed (SHA-256) in server memory only**. | A plain OTP is never kept. In-memory is enough for a single-process demo (see limitations). |
| 5 | **"Inactive"** means `subscribers.status = 'inactive'`. Inactive subscribers cannot log in. | The brief asks to confirm the status is active. A clear, single field keeps it simple. |
| 6 | Status is **re-checked when the OTP is verified**, not only when it is requested. | The account could be deactivated between the two steps. |
| 7 | **Three separate errors** for a bad format, an unregistered number and an inactive account. | The brief asks for appropriate messages. Trade-off: this reveals whether a number is registered. Acceptable for a demo. A production system would use one generic message. |
| 8 | A session is a **JWT valid for 2 hours**, kept in `sessionStorage`. | It clears when the tab closes. Short expiry limits damage if a token leaks. |
| 9 | Every bill query is **scoped by the subscriber id inside the token**. | A subscriber must never read another subscriber's bill, even by guessing an id. |
| 10 | **Billing cycle runs from the 15th to the 14th** of the next month. **Due date = 10 days after the cycle ends.** Bill number = `AV-<mobile>-<YYYYMM of cycle start>`. | A fixed, predictable pattern that is easy to read and verify in the sample data. |
| 11 | The **standard package** is Voice 200 + DTH 300 + Internet 700 = 1,200 per cycle. **Extra usage** is one extra Rs. 100 line. | Round numbers make totals easy to check by eye. |
| 12 | Extra usage appears as an **extra row of the same service type** (for example a second "internet" row). | Keeps one table of line items, with no special case. |
| 13 | **A bill is paid only when payments total at least the bill total.** A part-payment leaves the bill *unpaid* with a smaller balance. | Matches how real postpaid billing behaves and is why the sample data has a split payment. |
| 14 | **UPI is the only payment method.** | The brief asks for a UPI-style QR. One method keeps the data and screens simple. |
| 15 | The QR encodes `upi://pay?pa=...&pn=AirVoice&am=<balance>&cu=INR&tn=Bill <number>&tr=<ref>`. The amount is the bill's **remaining balance**. | This is the standard UPI deep-link format. Paying the balance (not the total) is correct after a part-payment. |
| 16 | The payee ID `airvoice@demobank` is a **placeholder**. | No real money or bank account is involved. It is set from `UPI_PAYEE_ID`. |
| 17 | A **"Simulate successful payment"** button records a payment named `MOCK-XXXXXXXX`. | A real payment would be confirmed by a bank or gateway callback. The button stands in for that so the demo shows the full flow. |
| 18 | "XLS" is delivered as **`.xlsx`** (modern Excel). | Opens in every current Excel, LibreOffice and Google Sheets. The legacy `.xls` format adds nothing for this use. |
| 19 | **Bills are pre-loaded** in the database. The app does not generate new monthly bills. | Bill generation (rating usage, cycle jobs) is outside the brief. |
| 20 | Amounts are in **INR**, shown with Indian grouping (for example Rs. 1,300.00). | The business context is India. |
| 21 | PostgreSQL is used instead of Google Sheets. | The brief allows it. It needs no Google credentials, and real constraints keep the data consistent. |

---

## 7. How it works

### Login flow

```
Browser                          API                                 Database / Mailpit
  | POST /auth/request-otp  ---> validate format
  |   { mobile }                 SELECT subscriber ----------------> found? active?
  |                              generate 6-digit OTP, store its hash in memory
  |                              send email -----------------------> Mailpit inbox
  | <--- { sentTo: "ar***@..." }
  | POST /auth/verify-otp   ---> check expiry, attempts, hash
  |   { mobile, otp }            re-check status ------------------> SELECT subscriber
  | <--- { token (JWT, 2h), subscriber }
  | GET /bills  (Authorization: Bearer <token>)
  |                              requireAuth verifies the token and sets req.subscriberId
  |                              every query: WHERE subscriber_id = <that id>
```

### Bill status and amounts

For each bill the API computes `paid_amount` (sum of payments), `balance` (total minus paid, never below zero)
and `status` (`paid` when `paid_amount >= total`). The list endpoint also returns `outstanding`, the sum of all
balances, shown as "Amount due" on the home page.

### Downloads

The browser cannot attach an `Authorization` header to a plain link. So the client `fetch`es the file with the
token, turns the response into a blob, and triggers the save itself (`api.download` in `client/src/api.js`).
On the server the same `loadBill()` result feeds the PDF, XLSX and CSV writers, so all three always show the same
numbers.

### Payment flow

1. Tap **Pay** on an unpaid bill. The client calls `payment-intent`.
2. The server returns a UPI link with the bill's remaining balance, and the client draws it as a QR code.
3. In the demo, **Simulate successful payment** calls `simulate-payment`, which inserts a payment row for the
   balance. The bill becomes *Paid* and the history updates.

---

## 8. API reference

All `/api/bills` routes require `Authorization: Bearer <token>`.

| Method | Path | Body / query | Success | Errors |
|---|---|---|---|---|
| GET | `/api/health` | | `{ ok: true }` | |
| POST | `/api/auth/request-otp` | `{ mobile }` | `{ message, sentTo }` | 400 invalid number, 404 not registered, 403 inactive, 429 resend too soon |
| POST | `/api/auth/verify-otp` | `{ mobile, otp }` | `{ token, subscriber }` | 400 wrong / expired / missing OTP, 429 too many attempts, 403 no longer active |
| GET | `/api/bills` | | `{ bills[], outstanding }` | 401 |
| GET | `/api/bills/:id` | | bill with `items[]`, `payments[]`, `paid_amount`, `balance`, `status` | 401, 404 |
| GET | `/api/bills/:id/download` | `?format=pdf\|xlsx\|csv` | file download | 400 bad format, 401, 404 |
| POST | `/api/bills/:id/payment-intent` | | `{ upiLink, amount, billNumber }` | 401, 404, 409 already paid |
| POST | `/api/bills/:id/simulate-payment` | | `{ message }` | 401, 404, 409 already paid |

A bill that belongs to someone else returns **404** (the same as a bill that does not exist), so ids cannot be probed.

---

## 9. Error handling

- **Input validation** on the server before any database call (mobile format, download format, numeric bill id).
- **Specific, human messages** for each login failure, shown inline under the form.
- **OTP protections:** expiry, single use, 3 attempts, resend cooldown (also shown as a countdown on the button).
- **Unexpected server errors** are caught by one Express error handler. The user sees a friendly message and the
  real error is logged on the server only.
- **Expired or missing session:** the API returns 401. The client clears the session and sends the user to the login page.
- **API unreachable:** the client shows "Cannot reach the server. Check that the backend is running."
- **Empty states:** no bills, no payments yet, and "all paid up" are all handled in the UI.
- **Secrets:** no credentials in the repository. `.env` is git-ignored and `.env.example` holds placeholders.

---

## 10. Manual test checklist

Tick these off after setup (they also make a good demo script).

- [ ] Log in as `9876543210` with the OTP from Mailpit. Bill list loads and "Amount due" is Rs. 2,500.
- [ ] Open the paid bill (July). Charges total 1,200 and payments show 700 and 500.
- [ ] Open the August bill. Charges show an extra "Extra data usage" row and total 1,300.
- [ ] Download PDF, XLS and CSV for one bill. The numbers match the screen.
- [ ] Open an unpaid bill, click **Pay**. A QR code and the UPI link appear.
- [ ] Click **Simulate successful payment**. The bill turns Paid and the Amount due drops.
- [ ] `123` shows the invalid-number error.
- [ ] `9999999999` shows "not registered".
- [ ] `9000000001` shows the inactive-account message.
- [ ] A wrong OTP three times locks the code and asks for a new one.
- [ ] Log in as Priya (`9123456780`): only Priya's bills appear and Amount due is Rs. 1,200.
- [ ] While logged in as Priya, open one of Arjun's bill URLs. Result is "Bill not found".
- [ ] Log out, then press the browser Back button. No bill data is shown.

To re-run the demo from scratch, run `db/init.sql` again.

---

## 11. Known limitations

- **OTP store is in memory.** OTPs are lost on server restart and would not work across several server instances.
  A production version would use Redis or a database table.
- **The "Simulate payment" endpoint is demo-only.** It lets a logged-in user mark their own bill as paid without any
  bank confirmation. A real system would record payments only from a verified gateway webhook, and this route would be removed.
- **Payments are never real.** The QR and UPI link are for demonstration. The fake payee ID is not a real account.
- **Error messages reveal whether a number is registered** (assumption 7). Fine for a demo, not for production.
- **No automated tests.** Verification is manual (section 10).
- **Bills are not generated.** New months must be added to the database by hand.
- **Single plan and single payment method** in the sample data.

---

## 12. AI assistance

The brief asks which parts were built with AI help and which on my own.

**AI assistant used:** Claude (Anthropic).

**Built mainly with AI assistance**

- First version of the project skeleton (Express API, React pages, styles, logo SVG).
- Server code for OTP, JWT, bill queries and the PDF / XLSX / CSV exports.
- React pages and the QR payment screen.

**Decisions I made myself**

- Using PostgreSQL instead of Google Sheets.
- The sample-data rules: standard package of Voice 200 + DTH 300 + Internet 700 = 1,200, extra usage of Rs. 100,
  billing cycle from the 15th to the 14th, UPI as the only payment method.
- Typing all sample data by hand with explicit ids, with `subscriber_id` on every table.
- Calculating bill totals inside `init.sql` from the typed line items.

**Done and verified by me**

- Installing and configuring Node.js, PostgreSQL, pgAdmin and Mailpit on Windows.
- Running the app end to end: login with OTP from Mailpit, bill list and detail, and PDF / XLS / CSV downloads.
- Running the manual test checklist in section 10.

**How I used the AI:** 
Initially, the structure for the project has been created in my mind and using prompt engineering method,
I have achieved a polished version of the project structure with help of the AI that has been determined previously. 
Then many modules are been modified to have a better clarity for the client and server handling process. 
The SQL manipulation operations for the customers has to be implemented manually using Postgresql.

---

## 13. Project structure

```
airvoice-portal/
├── .gitignore                 node_modules, dist, .env, logs
├── README.md
├── db/
│   └── init.sql               schema, trigger and hand-typed sample data (safe to re-run)
├── server/                    Node + Express 5 API (port 4000)
│   ├── .env.example           placeholder configuration (copy to .env)
│   ├── package.json
│   └── src/
│       ├── index.js           app setup, routes, global error handler
│       ├── db.js              PostgreSQL pool (dates as strings, NUMERIC as numbers)
│       ├── auth.js            request-otp, verify-otp, requireAuth middleware
│       ├── billing.js         bill list/detail, downloads, payment intent, simulate payment
│       └── exports.js         PDF, XLSX and CSV writers
└── client/                    React 18 + Vite app (port 5173)
    ├── index.html
    ├── vite.config.js         dev server and /api proxy
    ├── public/favicon.svg
    └── src/
        ├── main.jsx           React entry point, router
        ├── App.jsx            routes and the logged-in shell (top bar, logout)
        ├── api.js             fetch wrapper, session storage, formatters
        ├── styles.css         design tokens and layout
        ├── components/
        │   ├── Logo.jsx       AirVoice logo (two signal arcs over a dot)
        │   └── StatusBadge.jsx
        └── pages/
            ├── Login.jsx      two-step mobile + OTP form
            ├── Bills.jsx      amount due and billing history
            ├── BillDetail.jsx itemised charges, payments, downloads
            └── Pay.jsx        QR code and simulated payment
```
