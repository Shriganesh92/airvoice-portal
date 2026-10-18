import pg from 'pg'; // PostgreSQL driver for Node

// Return DATE columns as plain 'YYYY-MM-DD' strings (avoids timezone shifts)
// and NUMERIC columns as JS numbers.
pg.types.setTypeParser(1082, (v) => v); // 1082 = DATE type id; keep the raw text instead of converting to a JS Date
pg.types.setTypeParser(1700, (v) => parseFloat(v)); // 1700 = NUMERIC type id; by default it arrives as text, so convert to a number

// A pool keeps several database connections open and reuses them (faster than reconnecting for every query)
// DATABASE_URL comes from .env, e.g. postgres://user:password@localhost:5432/airvoice
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
// "export" lets auth.js and billing.js do: import { pool } from './db.js'
