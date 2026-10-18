import React from 'react'; // the React library
import ReactDOM from 'react-dom/client'; // connects React to the real web page (browser DOM)
import { BrowserRouter } from 'react-router-dom'; // makes URL-based pages (routing) work
import App from './App.jsx'; // the main component with all the routes
import './styles.css'; // loads the global CSS for the whole app

// Find <div id="root"> in index.html and let React take control of it
ReactDOM.createRoot(document.getElementById('root')).render(
  // StrictMode: development-only helper that warns about common mistakes (adds no visible UI)
  <React.StrictMode>
    {/* BrowserRouter watches the browser URL; Routes in App.jsx use it to pick the page */}
    <BrowserRouter>
      <App /> {/* the whole app starts here */}
    </BrowserRouter>
  </React.StrictMode>,
);