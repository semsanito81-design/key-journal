import { verifyLogin, hashPassword, randomSalt, authHook } from '../auth.js';
import { q } from '../db.js';

export default async function(app){
  // --- Логин: без auth ---
  app.post('/login', async (req, reply)=>{
    const { login, password } = req.body || {};
    try{
      const { token, user } = await verifyLogin(login, password);
      await q(`INSERT INTO audit(user_id,user_name,action,entity,entity_id)
               VALUES($1,$2,'login','user',$1)`,[user.id,user.fullName]);
      reply.setCookie('kcj_token', token, {
        httpOnly:true, sameSite:'lax', path:'/', maxAge: 8*3600
      });
      return { user, token };
    }catch(e){
      reply.code(401).send({ error:e.message });
    }
  });

  // --- Логаут: требует auth ---
  app.post('/logout', { preHandler: authHook }, async (req, reply)=>{
    await q(`INSERT INTO audit(user_id,user_name,action,entity,entity_id)
             VALUES($1,$2,'logout','user',$1)`,
            [req.user.id, req.user.fullName]);
    reply.clearCookie('kcj_token', { path:'/' });
    return { ok:true };
  });

  // --- Текущий пользователь ---
  app.get('/me', { preHandler: authHook }, async (req)=> req.user);

  // --- Смена пароля ---
  app.post('/change-password', { preHandler: authHook }, async (req, reply)=>{
    const { oldPassword, newPassword } = req.body || {};
    if(!newPassword || newPassword.length<6)
      return reply.code(400).send({ error:'Пароль ≥6 символов' });
    const { rows } = await q('SELECT * FROM users WHERE id=$1',[req.user.id]);
    const u = rows[0];
    const h = await hashPassword(oldPassword, u.salt);
    if(h !== u.hash)
      return reply.code(400).send({ error:'Старый пароль неверен' });
    const salt = randomSalt();
    const hash = await hashPassword(newPassword, salt);
    await q('UPDATE users SET salt=$1,hash=$2 WHERE id=$3',[salt,hash,u.id]);
    await q(`INSERT INTO audit(user_id,user_name,action,entity,entity_id)
             VALUES($1,$2,'password_change','user',$1)`,[u.id,u.full_name]);
    return { ok:true };
  });
}