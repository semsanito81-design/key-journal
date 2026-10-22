import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../db.js';
import { hashPassword, randomSalt } from '../auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('→ URL:', process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@'));
console.log('→ Миграция 001_init.sql...');

try {
  const sql = fs.readFileSync(path.join(__dirname, '001_init.sql'), 'utf8');
  await pool.query(sql);
  console.log('✅ Схема применена');
} catch (e) {
  console.error('❌ Ошибка схемы:', e.message);
  if (e.detail) console.error('   detail:', e.detail);
  if (e.hint)   console.error('   hint:', e.hint);
  await pool.end();
  process.exit(1);
}

try {
  const { rows } = await pool.query('SELECT 1 FROM users LIMIT 1');
  if (!rows.length) {
    const salt = randomSalt();
    const hash = await hashPassword('admin123', salt);
    await pool.query(
      `INSERT INTO users(login,full_name,role,salt,hash)
       VALUES('admin','Администратор','admin',$1,$2)`, [salt, hash]);
    console.log('✅ Создан admin / admin123');
  } else {
    console.log('ℹ️  Админ уже существует — пропускаю');
  }
} catch (e) {
  console.error('❌ Ошибка создания админа:', e.message);
  await pool.end();
  process.exit(1);
}

await pool.end();
console.log('✅ Миграция завершена');