import { authHook, requireRole, hashPassword, randomSalt } from '../auth.js';
import { q } from '../db.js';

export default async function(app){
  app.addHook('preHandler', authHook);
  app.addHook('preHandler', requireRole('admin'));

  app.get('/', async ()=>{
    const { rows } = await q(
      `SELECT id,login,full_name,role,active,created,last_login FROM users ORDER BY login`);
    return rows;
  });

  app.post('/', async (req,reply)=>{
    const { login, fullName, role, password } = req.body||{};
    if(!login || !fullName || !password || password.length<6)
      return reply.code(400).send({error:'Проверьте поля'});
    const salt = randomSalt();
    const hash = await hashPassword(password, salt);
    const { rows } = await q(`
      INSERT INTO users(login,full_name,role,salt,hash)
      VALUES($1,$2,$3,$4,$5) RETURNING id,login,full_name,role,active,created`,
      [login,fullName,role,salt,hash]);
    await q(`INSERT INTO audit(user_id,user_name,action,entity,entity_id)
             VALUES($1,$2,'user_create','user',$3)`,
            [req.user.id, req.user.fullName, rows[0].id]);
    return rows[0];
  });

  app.patch('/:id', async (req,reply)=>{
    const { fullName, role, active, password } = req.body||{};
    if(password){
      if(password.length<6) return reply.code(400).send({error:'Пароль ≥6'});
      const salt = randomSalt();
      const hash = await hashPassword(password, salt);
      await q('UPDATE users SET salt=$1,hash=$2 WHERE id=$3',
              [salt,hash,req.params.id]);
    }
    const { rows } = await q(`
      UPDATE users SET full_name=COALESCE($1,full_name),
        role=COALESCE($2,role), active=COALESCE($3,active)
      WHERE id=$4 RETURNING id,login,full_name,role,active`,
      [fullName??null, role??null, active??null, req.params.id]);
    await q(`INSERT INTO audit(user_id,user_name,action,entity,entity_id)
             VALUES($1,$2,'user_update','user',$3)`,
            [req.user.id, req.user.fullName, req.params.id]);
    return rows[0];
  });

  app.delete('/:id', async (req,reply)=>{
    if(req.params.id === req.user.id)
      return reply.code(400).send({error:'Нельзя удалить себя'});
    await q('DELETE FROM users WHERE id=$1',[req.params.id]);
    await q(`INSERT INTO audit(user_id,user_name,action,entity,entity_id)
             VALUES($1,$2,'user_delete','user',$3)`,
            [req.user.id, req.user.fullName, req.params.id]);
    return { ok:true };
  });
}