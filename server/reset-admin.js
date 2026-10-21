import 'dotenv/config';
import { pool } from './db.js';
import { hashPassword, randomSalt } from './auth.js';

const salt = randomSalt();
const hash = await hashPassword('admin123', salt);

// upsert — создаст или обновит
await pool.query(`
  INSERT INTO users(login, full_name, role, salt, hash, active)
  VALUES('admin','Администратор','admin',$1,$2,true)
  ON CONFLICT (login)
  DO UPDATE SET salt=$1, hash=$2, active=true
`, [salt, hash]);

const { rows } = await pool.query(
  "SELECT id, login, role, active FROM users WHERE login='admin'");
console.log('✅ admin сброшен:', rows[0]);
await pool.end();