import { config } from "dotenv";
import { Pool } from "pg";
config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const res = await pool.query('SELECT email, name, role FROM "user"');
console.log(JSON.stringify(res.rows, null, 2));
await pool.end();
