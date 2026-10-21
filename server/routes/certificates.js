import { authHook, requireRole } from '../auth.js';
import { q } from '../db.js';

export default async function(app){
  app.addHook('preHandler', authHook);

  // справочник типов
  app.get('/types', async ()=>{
    const { rows } = await q(
      `SELECT code, name, title, default_valid_years, description
         FROM cert_types ORDER BY code`);
    return rows;
  });

  // список сертификатов (можно фильтровать)
  app.get('/', async (req)=>{
    const { expiring, carrier_id, purpose } = req.query;
    const cond = [], params = [];
    if(carrier_id){ params.push(carrier_id); cond.push(`c.carrier_id=$${params.length}`); }
    if(purpose){ params.push(purpose); cond.push(`t.name=$${params.length}`); }
    if(expiring){
      params.push(+expiring);
      cond.push(`c.valid_to IS NOT NULL AND c.valid_to <= (CURRENT_DATE + ($${params.length}||' day')::interval)`);
    }
    const where = cond.length ? 'WHERE '+cond.join(' AND ') : '';
    const { rows } = await q(`
      SELECT c.*, t.name AS type_name, t.title AS type_title,
             cr.carrier_serial, cr.employee, cr.department
        FROM certificates c
        JOIN cert_types t  ON t.code = c.cert_type
        JOIN carriers  cr ON cr.id  = c.carrier_id
        ${where}
        ORDER BY c.valid_to NULLS LAST`, params);
    return rows;
  });

  // список сертификатов конкретного носителя
  app.get('/by-carrier/:carrierId', async (req)=>{
    const { rows } = await q(`
      SELECT c.*, t.name AS type_name, t.title AS type_title
        FROM certificates c
        JOIN cert_types t ON t.code = c.cert_type
        WHERE c.carrier_id = $1
        ORDER BY c.cert_type`, [req.params.carrierId]);
    return rows;
  });

  // создать сертификат
  app.post('/', requireRole('admin','operator'), async (req,reply)=>{
    const b = req.body||{};
    if(!b.carrierId || !b.certType || !b.validFrom)
      return reply.code(400).send({error:'carrierId, certType, validFrom обязательны'});

    // если valid_to не передан — вычислим по типу
    let validTo = b.validTo;
    if(!validTo){
      const { rows: t } = await q(
        'SELECT default_valid_years FROM cert_types WHERE code=$1',[b.certType]);
      if(!t[0]) return reply.code(400).send({error:'Неизвестный тип сертификата'});
      const { rows: v } = await q(
        `SELECT ($1::date + ($2||' year')::interval)::date AS valid_to`,
        [b.validFrom, t[0].default_valid_years]);
      validTo = v[0].valid_to;
    }

    try{
      const { rows } = await q(`
        INSERT INTO certificates(carrier_id, cert_type, serial_number,
                                 valid_from, valid_to, status, note)
        VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [b.carrierId, b.certType, b.serialNumber||null,
         b.validFrom, validTo, b.status||'active', b.note||null]);

      await q(`INSERT INTO audit(user_id,user_name,action,entity,entity_id,details)
               VALUES($1,$2,'cert_create','certificate',$3,$4)`,
              [req.user.id, req.user.fullName, rows[0].id, b]);
      return rows[0];
    }catch(e){
      if(e.code==='23505') return reply.code(409)
        .send({error:'На этом носителе уже есть сертификат такого типа'});
      throw e;
    }
  });

  // изменить
  app.patch('/:id', requireRole('admin','operator'), async (req,reply)=>{
    const b = req.body||{};
    // пересчёт valid_to, если поменяли valid_from или тип
    let validTo = b.validTo;
    if(b.validFrom && !validTo){
      const { rows: t } = await q(
        'SELECT default_valid_years FROM cert_types WHERE code=$1',[b.certType]);
      if(t[0]){
        const { rows: v } = await q(
          `SELECT ($1::date + ($2||' year')::interval)::date AS valid_to`,
          [b.validFrom, t[0].default_valid_years]);
        validTo = v[0].valid_to;
      }
    }
    const { rows } = await q(`
      UPDATE certificates SET
        cert_type     = COALESCE($1, cert_type),
        serial_number = COALESCE($2, serial_number),
        valid_from    = COALESCE($3, valid_from),
        valid_to      = COALESCE($4, valid_to),
        status        = COALESCE($5, status),
        note          = COALESCE($6, note),
        updated       = now()
      WHERE id = $7 RETURNING *`,
      [b.certType, b.serialNumber, b.validFrom, validTo, b.status, b.note,
       req.params.id]);
    if(!rows[0]) return reply.code(404).send({error:'Not found'});
    await q(`INSERT INTO audit(user_id,user_name,action,entity,entity_id,details)
             VALUES($1,$2,'cert_update','certificate',$3,$4)`,
            [req.user.id, req.user.fullName, rows[0].id, b]);
    return rows[0];
  });

  app.delete('/:id', requireRole('admin','operator'), async (req)=>{
    await q('DELETE FROM certificates WHERE id=$1',[req.params.id]);
    await q(`INSERT INTO audit(user_id,user_name,action,entity,entity_id)
             VALUES($1,$2,'cert_delete','certificate',$3)`,
            [req.user.id, req.user.fullName, req.params.id]);
    return { ok:true };
  });
}