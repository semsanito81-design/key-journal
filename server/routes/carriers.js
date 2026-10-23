import { authHook, requireRole } from '../auth.js';
import { q, pool } from '../db.js';

export default async function(app){
  // Все роуты требуют авторизации
  app.addHook('preHandler', authHook);

  // --- Список с фильтрами ---
  app.get('/', async (req)=>{
    const { q:search='', status='', carrier='', with:withParam='' } = req.query;
    const cond=[], params=[];
    if(search){ params.push(`%${search}%`);
      cond.push(`(employee ILIKE $${params.length} OR position ILIKE $${params.length}
        OR department ILIKE $${params.length} OR carrier_serial ILIKE $${params.length})`); }
   //if(status){ params.push(status); cond.push(`status=$${params.length}`); }
    if(carrier){ params.push(carrier); cond.push(`carrier_type=$${params.length}`); }
    const where = cond.length?'WHERE '+cond.join(' AND '):'';
    const { rows } = await q(
      `SELECT * FROM carriers ${where} ORDER BY ppp NULLS LAST, issue_date DESC`,
      params);
    
    if(withParam === 'certificates' && rows.length){
      const ids = rows.map(r=>r.id);
      const { rows: certs } = await q(`
        SELECT c.* 
          FROM v_certificates c
          WHERE c.carrier_id = ANY($1::uuid[])
          ORDER BY c.cert_type`, [ids]);
      const byCarrier = {};
      certs.forEach(c=>{
        (byCarrier[c.carrier_id] ||= []).push(c);
      });
      rows.forEach(r=>{ r.certificates = byCarrier[r.id] || []; });
    }
    return rows;
  });

  // --- Создать одну запись ---
  app.post('/', { preHandler: requireRole('admin','operator') }, async (req, reply)=>{
    const b = req.body || {};
    if(!b.employee) return reply.code(400).send({ error:'Укажите ФИО' });
    const { rows:maxr } = await q('SELECT COALESCE(MAX(ppp),0)+1 AS n FROM carriers');
    const { rows } = await q(`
      INSERT INTO carriers(ppp,issue_date,carrier_type,carrier_serial,employee,
        position,department,cert_type,cert_start,cert_serial,return_mark,status,
        sign_cert,sign_carrier,two_factor)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [maxr[0].n, b.issueDate||null, b.carrierType, b.carrierSerial, b.employee,
       b.position, b.department, b.certType, b.certStart||null, b.certSerial,
       b.returnMark||null, b.status||'active', b.signCert, b.signCarrier,
       !!b.twoFactor]);
    await q(`INSERT INTO audit(user_id,user_name,action,entity,entity_id,details)
             VALUES($1,$2,'carrier_create','carrier',$3,$4)`,
            [req.user.id, req.user.fullName, rows[0].id, b]);
    return rows[0];
  });

  // --- Массовый импорт ---
  app.post('/bulk', { preHandler: requireRole('admin','operator') }, async (req, reply)=>{
    const items = req.body || [];
    if(!Array.isArray(items) || !items.length)
      return reply.code(400).send({ error:'Ожидался непустой массив' });

    const client = await pool.connect();
    try{
      await client.query('BEGIN');
      const { rows:maxr } = await client.query(
        'SELECT COALESCE(MAX(ppp),0)+1 AS n FROM carriers');
      let ppp = maxr[0].n, added = 0;
      for(const b of items){
        if(!b.employee) continue;
        await client.query(`
          INSERT INTO carriers(ppp,issue_date,carrier_type,carrier_serial,employee,
            position,department,cert_type,cert_start,cert_serial,status,
            sign_cert,sign_carrier,two_factor)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [ppp++, b.issueDate||null, b.carrierType, b.carrierSerial, b.employee,
           b.position, b.department, b.certType, b.certStart||null,
           b.certSerial, b.status||'active', b.signCert, b.signCarrier,
           !!b.twoFactor]);
        added++;
      }
      await client.query('COMMIT');
      await client.query(
        `INSERT INTO audit(user_id,user_name,action,entity,details)
         VALUES($1,$2,'import_bulk','carrier',$3)`,
        [req.user.id, req.user.fullName, { added }]);
      return { added };
    }catch(e){
      await client.query('ROLLBACK');
      throw e;
    }finally{
      client.release();
    }
  });

  // --- Обновить ---
  app.patch('/:id', { preHandler: requireRole('admin','operator') }, async (req, reply)=>{
    const b = req.body || {};
    const { rows } = await q(`
      UPDATE carriers SET
        issue_date=$1, carrier_type=$2, carrier_serial=$3, employee=$4,
        position=$5, department=$6, cert_type=$7, cert_start=$8, cert_serial=$9,
        return_mark=$10, status=$11, sign_cert=$12, sign_carrier=$13,
        two_factor=$14, signature_data=$16, updated=now()
      WHERE id=$15 RETURNING *`,
      [b.issueDate||null,b.carrierType,b.carrierSerial,b.employee,b.position,
       b.department,b.certType,b.certStart||null,b.certSerial,b.returnMark||null,
       b.status||'active',b.signCert,b.signCarrier,!!b.twoFactor,req.params.id,
       b.signature_data || null]); // <-- НОВОЕ ПОЛЕ
    if(!rows[0]) return reply.code(404).send({ error:'Not found' });
    await q(`INSERT INTO audit(user_id,user_name,action,entity,entity_id,details)
             VALUES($1,$2,'carrier_update','carrier',$3,$4)`,
            [req.user.id, req.user.fullName, rows[0].id, b]);
    return rows[0];
  });

  // --- Удалить ---
  app.delete('/:id', { preHandler: requireRole('admin','operator') }, async (req)=>{
    await q('DELETE FROM carriers WHERE id=$1',[req.params.id]);
    await q(`INSERT INTO audit(user_id,user_name,action,entity,entity_id)
             VALUES($1,$2,'carrier_delete','carrier',$3)`,
            [req.user.id, req.user.fullName, req.params.id]);
    return { ok:true };
  });
}