import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { q } from './db.js';

const ITER = 100000;

function bytesToHex(b){ return [...b].map(x=>x.toString(16).padStart(2,'0')).join(''); }
function hexToBytes(h){ const a=new Uint8Array(h.length/2);
  for(let i=0;i<a.length;i++)a[i]=parseInt(h.substr(i*2,2),16); return a; }

export function randomSalt(){ return bytesToHex(crypto.randomBytes(16)); }

export function hashPassword(password, saltHex){
  return new Promise((resolve,reject)=>{
    crypto.pbkdf2(password, hexToBytes(saltHex), ITER, 32, 'sha256',
      (err,dk)=> err?reject(err):resolve(bytesToHex(dk)));
  });
}

export async function verifyLogin(login, password){
  const { rows } = await q('SELECT * FROM users WHERE login=$1',[login]);
  const u = rows[0];
  if(!u || !u.active) throw new Error('Пользователь не найден или отключён');
  const h = await hashPassword(password, u.salt);
  if(h !== u.hash) throw new Error('Неверный пароль');
  await q('UPDATE users SET last_login=now() WHERE id=$1',[u.id]);
  const token = jwt.sign(
    { id:u.id, login:u.login, role:u.role, fullName:u.full_name },
    process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES || '8h' });
  return { token, user:{ id:u.id, login:u.login, role:u.role, fullName:u.full_name } };
}

export async function authHook(request, reply){
  try{
    const t = request.cookies?.kcj_token
           || (request.headers.authorization||'').replace(/^Bearer /,'');
    if(!t) throw 0;
    request.user = jwt.verify(t, process.env.JWT_SECRET);
  }catch{
    return reply.code(401).send({ error:'Unauthorized' });
  }
}

export function requireRole(...roles){
  return async (req,reply)=>{
    if(!roles.includes(req.user.role))
      return reply.code(403).send({ error:'Forbidden' });
  };
}