import { authHook, requireRole } from '../auth.js';
import { q } from '../db.js';

export default async function(app){
  app.addHook('preHandler', authHook);

  // Получить справочник типов
  app.get('/types', async () => {
    const { rows } = await q('SELECT * FROM asset_types ORDER BY name');
    return rows;
  });

 // Получить историю перемещений по ID техники
  app.get('/:id/history', async (req) => {
    const { rows } = await q(`
      SELECT h.*, e.full_name as employee_name 
      FROM asset_history h
      LEFT JOIN employees e ON e.id = h.employee_id
      WHERE h.asset_id = $1
      ORDER BY h.created_at DESC
    `, [req.params.id]);
    return rows;
  });

  // Получить список всей техники с фильтрами
  app.get('/', async (req) => {
    const search = req.query.q || req.query.search || '';
    const { status = '', type = '' } = req.query;
    const cond = [], params = [];

   /* if(search) {
      params.push(`%${search}%`);
      cond.push(`(a.inv_number ILIKE $${params.length} OR a.serial_number ILIKE $${params.length} OR a.model ILIKE $${params.length} OR a.arm_name ILIKE $${params.length})`);
    }*/
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
    // Запись в историю о создании
    await q(`
      INSERT INTO asset_history (asset_id, action, comment, employee_id)
      VALUES ($1, 'created', 'Добавлено в систему', $2)
    `, [rows[0].id, b.employee_id || null]);
             
    return rows[0];
  });

  // 4. Обновить данные техники
  app.patch('/:id', { preHandler: requireRole('admin', 'operator') }, async (req, reply) => {
    const b = req.body;
    
    // 1. Получаем текущее состояние из базы
    const { rows: oldRows } = await q('SELECT * FROM assets WHERE id = $1', [req.params.id]);
    if (!oldRows[0]) return reply.code(404).send({ error: 'Не найдено' });
    const oldData = oldRows[0];

    // 2. Обновляем
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
      [b.inv_number, b.serial_number, b.type_code, b.model, b.status, b.arm_name, b.employee_id || null, b.location, b.note, req.params.id]);
      
    const newData = rows[0];

    // 3. Сравниваем и пишем в историю
    const changes = [];
    
    // Функция для получения ФИО по ID
    const getName = async (id) => {
      if (!id) return '—';
      const { rows } = await q('SELECT full_name FROM employees WHERE id = $1', [id]);
      return rows[0] ? rows[0].full_name : id; // Если не нашли, вернем ID
    };

    if (oldData.employee_id !== newData.employee_id) {
      const oldName = await getName(oldData.employee_id);
      const newName = await getName(newData.employee_id);
      changes.push(`Сотрудник: ${oldName} → ${newName}`);
    }
    if (oldData.arm_name !== newData.arm_name) {
      changes.push(`АРМ: ${oldData.arm_name || '—'} → ${newData.arm_name || '—'}`);
    }
    if (oldData.location !== newData.location) {
      changes.push(`Место: ${oldData.location || '—'} → ${newData.location || '—'}`);
    }
    if (oldData.status !== newData.status) {
      changes.push(`Статус: ${oldData.status} → ${newData.status}`);
    }

    if (changes.length > 0) {
      await q(`
        INSERT INTO asset_history (asset_id, action, comment, employee_id)
        VALUES ($1, 'update', $2, $3)
      `, [req.params.id, changes.join('; '), b.employee_id || null]);
    }

    return newData;
  });
}