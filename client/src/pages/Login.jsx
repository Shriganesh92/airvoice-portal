import { useEffect, useState } from 'react'; // useState = remember values; useEffect = run code when something changes
import { Navigate, useNavigate } from 'react-router-dom'; // Navigate = redirect; useNavigate = change page from code
import Logo from '../components/Logo.jsx'; // the AirVoice logo
import { api, session } from '../api.js'; // API calls + saved login

export default function Login() {
  const navigate = useNavigate(); // function to jump to another URL
  const [step, setStep] = useState('mobile'); // 'mobile' | 'otp'  (which of the two screens is showing)
  const [mobile, setMobile] = useState(''); // what the user typed as mobile number
  const [otp, setOtp] = useState(''); // what the user typed as OTP
  const [sentTo, setSentTo] = useState(''); // masked email from the server, e.g. ar*****@example.com
  const [error, setError] = useState(''); // error message to show ('' = none)
  const [busy, setBusy] = useState(false); // true while waiting for the server (disables the button)
  const [cooldown, setCooldown] = useState(0); // seconds left before "Resend OTP" works again

  // Countdown timer: runs whenever "cooldown" changes (see [cooldown] below)
  useEffect(() => {
    if (cooldown <= 0) return; // nothing to count down
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000); // after 1 second, reduce by 1 (which triggers this effect again)
    return () => clearTimeout(t); // cleanup: cancel the timer if the page closes or cooldown changes
  }, [cooldown]);

  // Already logged in? Skip this page. (Placed after the hooks above, because hooks must always run in the same order)
  if (session.token) return <Navigate to="/" replace />;

  // Step 1: ask the server to email an OTP. Also used by the "Resend OTP" button
  const sendOtp = async (e) => {
    e?.preventDefault(); // stop the browser's default form submit (page reload); ?. because there may be no event
    setError(''); setBusy(true); // clear old error; show "Sending…"
    try {
      const res = await api.requestOtp(mobile); // POST /api/auth/request-otp
      setSentTo(res.sentTo); setStep('otp'); setOtp(''); setCooldown(30); // remember masked email, switch screen, clear old OTP, start 30s timer
    } catch (err) { setError(err.message); } // show the server's message (invalid / not registered / inactive / wait 30s)
    finally { setBusy(false); } // runs in both cases: re-enable the button
  };

  // Step 2: send the typed OTP to the server
  const verify = async (e) => {
    e.preventDefault(); // stop the page reload
    setError(''); setBusy(true);
    try {
      const { token, subscriber } = await api.verifyOtp(mobile, otp); // POST /api/auth/verify-otp
      session.save(token, subscriber); // keep the login in sessionStorage
      navigate('/'); // go to the bill list
    } catch (err) { setError(err.message); } // e.g. "Incorrect OTP. 2 attempts left."
    finally { setBusy(false); }
  };

  return (
    <div className="login">
      {/* Left panel: branding and a decorative picture */}
      <section className="login-panel">
        <Logo size={44} />
        <h1>See what you owe. Pay in a minute.</h1>
        <p>Your postpaid bills for voice, DTH and internet, all in one place.</p>
        {/* Decorative signal-wave drawing made with SVG; aria-hidden hides it from screen readers */}
        <svg className="login-art" viewBox="0 0 400 160" aria-hidden="true">
          <g fill="none" strokeLinecap="round" strokeWidth="10">
            <path d="M20 140C90 20 190 20 260 140" stroke="#fff" opacity=".9" /> {/* outer white curve */}
            <path d="M70 140C115 62 165 62 210 140" stroke="#F2A33A" /> {/* middle orange curve */}
            <path d="M120 140C140 106 140 106 160 140" stroke="#fff" opacity=".6" /> {/* small inner white curve */}
          </g>
        </svg>
      </section>

      {/* Right panel: the form. Shows screen 1 or screen 2 depending on "step" */}
      <section className="login-form">
        {step === 'mobile' ? (
          // Screen 1: mobile number. noValidate = we do our own checks (the server validates the number)
          <form onSubmit={sendOtp} noValidate>
            <h2>Log in</h2>
            {/* htmlFor links the label to the input with the same id (clicking the label focuses the input) */}
            <label htmlFor="mobile">Registered mobile number</label>
            {/* A "controlled input": it shows the state value, and every keystroke updates the state.
                replace(/\D/g, '') removes anything that is not a digit. */}
            <input id="mobile" inputMode="numeric" autoComplete="tel-national" maxLength={10} placeholder="10-digit number"
              value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))} autoFocus />
            {error && <p className="error" role="alert">{error}</p>} {/* shown only when there is an error */}
            {/* Disabled while waiting, or while the box is empty */}
            <button className="btn btn-primary" disabled={busy || mobile.length === 0}>
              {busy ? 'Sending…' : 'Send OTP'}
            </button>
            <p className="hint">Demo: the OTP arrives in the Mailpit inbox at <code>localhost:8025</code>.</p>
          </form>
        ) : (
          // Screen 2: enter the OTP
          <form onSubmit={verify} noValidate>
            <h2>Enter your OTP</h2>
            <p className="hint">We emailed a 6-digit code to {sentTo}.</p>
            <label htmlFor="otp">One-time password</label>
            {/* Same controlled-input pattern, digits only, max 6 */}
            <input id="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6-digit code"
              value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} autoFocus />
            {error && <p className="error" role="alert">{error}</p>}
            {/* The button works only when exactly 6 digits are typed */}
            <button className="btn btn-primary" disabled={busy || otp.length !== 6}>
              {busy ? 'Checking…' : 'Verify and log in'}
            </button>
            <div className="row-between">
              {/* Go back to screen 1 and clear the error. type="button" so it doesn't submit the form */}
              <button type="button" className="btn btn-quiet" onClick={() => { setStep('mobile'); setError(''); }}>Change number</button>
              {/* Disabled during the 30s countdown, which matches the server's 30-second limit */}
              <button type="button" className="btn btn-quiet" disabled={cooldown > 0 || busy} onClick={sendOtp}>
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend OTP'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}