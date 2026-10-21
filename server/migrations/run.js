import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../db.js';
import { hashPassword, randomSalt } from '../auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const sql = fs.readFileSync(path.join(__dirname,'001_init.sql'),'utf8');
await pool.query(sql);

// создать админа по умолчанию
const { rows } = await pool.query('SELECT 1 FROM users LIMIT 1');
if(!rows.length){
  const salt = randomSalt();
  const hash = await hashPassword('admin123', salt);
  await pool.query(`INSERT INTO users(login,full_name,role,salt,hash)
                    VALUES('admin','Администратор','admin',$1,$2)`,[salt,hash]);
  console.log('✅ Создан admin / admin123');
}
await pool.end();