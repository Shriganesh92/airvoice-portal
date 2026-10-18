// Thin fetch wrapper: adds the JWT, turns API errors into Error(message), handles expired sessions.
const TOKEN_KEY = 'av_token'; // name under which the login token is saved in the browser
const USER_KEY = 'av_user'; // name under which the subscriber details are saved

// Small helper object to read/save/clear the login session
// sessionStorage keeps data only for this browser tab; it is wiped when the tab is closed
export const session = {
  get token() { return sessionStorage.getItem(TOKEN_KEY); }, // read the saved token (null if not logged in)
  get user() { return JSON.parse(sessionStorage.getItem(USER_KEY) || 'null'); }, // saved text -> object (null if nothing saved)
  save(token, user) { // called after a successful login
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(user)); // storage only holds text, so the object becomes JSON text
  },
  clear() { sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(USER_KEY); }, // logout: delete both
};

// The one function every API call goes through
async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers }; // we send JSON; extra headers can be added by the caller
  if (session.token) headers.Authorization = `Bearer ${session.token}`; // attach the token if logged in (auth.js requireAuth reads this)

  let res;
  try {
    res = await fetch(`/api${path}`, { ...options, headers }); // e.g. /api/bills (Vite proxies it to the backend)
  } catch {
    // fetch only throws when the request never got an answer (server down, no network)
    throw new Error('Cannot reach the server. Check that the backend is running.');
  }

  if (!res.ok) { // status 400, 401, 404, 500 etc.
    const body = await res.json().catch(() => ({})); // read the server's { error: "..." }; use {} if the body isn't JSON
    if (res.status === 401 && session.token) { // token expired or invalid while logged in
      session.clear(); // forget the session
      window.location.assign('/login'); // send the user to the login page
    }
    throw new Error(body.error || 'Something went wrong. Please try again.'); // pages catch this and show the message
  }
  return res; // success: give the raw response back
}

// Helper: call the API and return the parsed JSON
const json = async (path, options) => (await request(path, options)).json();
// Helper: POST request with a JSON body (empty {} if no body given)
const post = (path, body) => json(path, { method: 'POST', body: JSON.stringify(body ?? {}) });

// The list of API calls that the React pages use
export const api = {
  requestOtp: (mobile) => post('/auth/request-otp', { mobile }), // login step 1
  verifyOtp: (mobile, otp) => post('/auth/verify-otp', { mobile, otp }), // login step 2
  listBills: () => json('/bills'), // all bills + outstanding amount
  getBill: (id) => json(`/bills/${id}`), // one bill with items and payments
  paymentIntent: (id) => post(`/bills/${id}/payment-intent`), // gets the UPI link for the QR code
  simulatePayment: (id) => post(`/bills/${id}/simulate-payment`), // demo: marks the bill as paid

  // Downloads need the Authorization header, so we fetch a blob and save it ourselves
  async download(id, format, filename) {
    const res = await request(`/bills/${id}/download?format=${format}`); // request the file (with the token)
    const url = URL.createObjectURL(await res.blob()); // turn the file data into a temporary browser URL
    // Make an invisible <a download> link pointing at that URL
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a); // add it to the page (some browsers need this)
    a.click(); // "click" it so the browser saves the file
    a.remove(); // clean up the link
    URL.revokeObjectURL(url); // free the temporary URL from memory
  },
};

// Formats money for the screen in Indian style, e.g. 1200 -> ₹1,200.00
export const inr = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);
// Formats a date like "14 Sep 2026".
// slice(0, 10) keeps only YYYY-MM-DD; adding T00:00:00 makes it local midnight so the day can't shift with timezones
export const fmtDate = (d) =>
  new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
// Same idea, but shows only month and year, e.g. "September 2026"
export const fmtMonth = (d) =>
  new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
