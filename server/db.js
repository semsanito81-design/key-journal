import 'dotenv/config';
import pg from 'pg';

// ВАЖНО: заставляем pg отдавать даты как простые строки, без сдвигов часовых поясов
pg.types.setTypeParser(1082, (val) => val); // DATE
pg.types.setTypeParser(1114, (val) => val); // TIMESTAMP
pg.types.setTypeParser(1184, (val) => val); // TIMESTAMPTZ

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

export const q = (text, params) => pool.query(text, params);