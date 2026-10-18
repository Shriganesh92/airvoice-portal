import { Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom'; // tools for pages/URLs: redirect, placeholder for child page, route definitions, change page in code
import Logo from './components/Logo.jsx'; // the AirVoice logo
import Login from './pages/Login.jsx'; // login screen
import Bills from './pages/Bills.jsx'; // bill list
import BillDetail from './pages/BillDetail.jsx'; // one bill + downloads
import Pay from './pages/Pay.jsx'; // payment screen with QR
import { session } from './api.js'; // reads/clears the saved login

// Shell = the frame shown around every logged-in page (top bar + page content)
function Shell() {
  const navigate = useNavigate(); // function to jump to another URL from code
  const user = session.user; // the saved subscriber details (name, etc.)
  // Not logged in? Redirect to /login. "replace" swaps the history entry so Back doesn't return here
  if (!session.token) return <Navigate to="/login" replace />;

  // Logout: forget the token and user, then go to the login page
  const logout = () => { session.clear(); navigate('/login'); };

  return (
    <>
      {/* <> </> is a fragment: groups elements without adding an extra div */}
      <header className="topbar">
        <div className="wrap topbar-inner">
          <Logo />
          <div className="topbar-user">
            {/* ?. avoids a crash if user is null */}
            <span>{user?.name}</span>
            <button className="btn btn-quiet" onClick={logout}>Log out</button>
          </div>
        </div>
      </header>
      {/* Outlet = the spot where the matching child page (Bills, BillDetail or Pay) is drawn */}
      <main className="wrap page"><Outlet /></main>
    </>
  );
}

// The route table: which URL shows which page
// Routes picks the first matching Route and draws its element
export default function App() {
  return (
    <Routes>
      {/* Public page: no login needed */}
      <Route path="/login" element={<Login />} />
      {/* These three share the Shell, which checks the login first */}
      <Route element={<Shell />}>
        <Route path="/" element={<Bills />} /> {/* home: bill list */}
        <Route path="/bills/:id" element={<BillDetail />} /> {/* :id is the bill number from the URL */}
        <Route path="/bills/:id/pay" element={<Pay />} /> {/* payment screen for that bill */}
      </Route>
      {/* Any other URL: send the user to the home page */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
