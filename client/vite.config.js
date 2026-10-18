import { defineConfig } from 'vite'; // helper that gives editor hints for the config object
import react from '@vitejs/plugin-react'; // lets Vite understand React (JSX) files

// The dev server proxies /api to the Express backend, so the browser sees one origin (no CORS fuss)
export default defineConfig({
  plugins: [react()], // turn on React support
  server: {
    port: 5173, // the frontend runs at http://localhost:5173
    // Any request starting with /api is forwarded to the backend instead of being handled by Vite
    // e.g. the browser calls /api/bills and Vite passes it on to http://localhost:4000/api/bills
    proxy: { '/api': 'http://localhost:4000' },
  },
});