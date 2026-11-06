import { authHook, requireRole } from '../auth.js';
import { q } from '../db.js';

export default async function(app){
  app.addHook('preHandler', authHook);

  // Получить справочник типов
  app.get('/types', async () => {
    const { rows } = await q('SELECT * FROM asset_types ORDER BY name');
    return rows;
  });

  // Получить список всей техники с фильтрами
  app.get('/', async (req) => {
    const { search = '', status = '', type = '' } = req.query;
    const cond = [], params = [];

    if(search) {
      params.push(`%${search}%`);
      cond.push(`(a.inv_number ILIKE $${params.length} OR a.serial_number ILIKE $${params.length} OR a.model ILIKE $${params.length} OR a.arm_name ILIKE $${params.length})`);
    }
    if(status) { params.push(status); cond.push(`a.status = $${params.length}`); }
    if(type) { params.push(type); cond.push(`a.type_code = $${params.length}`); }

    const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
    
    const { rows } = await q(`
      SELECT a.*, e.full_name as employee_name 
      FROM assets a
      LEFT JOIN employees e ON e.id = a.employee_id
      ${where}
      ORDER BY a.created_at DESC`, params);
    return rows;
  });

  // 3. Добавить технику
  app.post('/', { preHandler: requireRole('admin', 'operator') }, async (req, reply) => {
    const b = req.body;
    if(!b.model || !b.type_code) return reply.code(400).send({ error: 'Модель и категория обязательны' });
    
    const { rows } = await q(`
      INSERT INTO assets (inv_number, serial_number, type_code, model, status, arm_name, employee_id, location, note)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [b.inv_number||null, b.serial_number||null, b.type_code, b.model, b.status||'active', b.arm_name||null, b.employee_id||null, b.location||null, b.note||null]);
    
    // Запись в историю
    await q(`INSERT INTO asset_history (asset_id, employee_id, action, comment) 
             VALUES ($1, $2, 'created', 'Добавлено в систему')`, [rows[0].id, b.employee_id||null]);
             
    return rows[0];
  });

  // 4. Обновить данные техники
  app.patch('/:id', { preHandler: requireRole('admin', 'operator') }, async (req, reply) => {
    const b = req.body;
      const { rows } = await q(`
      UPDATE assets SET
        inv_number = COALESCE($1, inv_number),
        serial_number = COALESCE($2, serial_number),
        type_code = COALESCE($3, type_code),
        model = COALESCE($4, model),
        status = COALESCE($5, status),
        arm_name = COALESCE($6, arm_name),
        employee_id = COALESCE($7, employee_id),
        location = COALESCE($8, location),
        note = COALESCE($9, note),
        updated_at = now()
      WHERE id = $10 RETURNING *`,
      [b.inv_number, b.serial_number, b.type_code, b.model, b.status, b.arm_name, b.employee_id, b.location, b.note, req.params.id]);
      
    if(!rows[0]) return reply.code(404).send({ error: 'Не найдено' });
    return rows[0];
  });

  // 5. Удалить
  app.delete('/:id', { preHandler: requireRole('admin') }, async (req) => {
    await q('DELETE FROM assets WHERE id = $1', [req.params.id]);
    return { ok: true };
  });
}