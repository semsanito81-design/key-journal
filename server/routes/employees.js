import { authHook, requireRole } from '../auth.js';
import { q } from '../db.js';

export default async function(app){
  app.addHook('preHandler', authHook);

  // Получить всех сотрудников
  app.get('/', async (req) => {
    const { rows } = await q('SELECT * FROM employees WHERE is_active = true ORDER BY full_name');
    return rows;
  });

  // Добавить сотрудника
  app.post('/', { preHandler: requireRole('admin', 'operator') }, async (req, reply) => {
    const { full_name, position, department } = req.body;
    if (!full_name) return reply.code(400).send({ error: 'Укажите ФИО' });
    
    const { rows } = await q(
      'INSERT INTO employees (full_name, position, department) VALUES ($1, $2, $3) RETURNING *',
      [full_name, position || '', department || '']
    );
    return rows[0];
  });

  // Изменить
  app.patch('/:id', { preHandler: requireRole('admin', 'operator') }, async (req, reply) => {
    const { full_name, position, department } = req.body;
    const { rows } = await q(
      'UPDATE employees SET full_name=$1, position=$2, department=$3 WHERE id=$4 RETURNING *',
      [full_name, position, department, req.params.id]
    );
    return rows[0];
  });

    // Массовый импорт (bulk)
  app.post('/bulk', { preHandler: requireRole('admin', 'operator') }, async (req, reply) => {
    const items = req.body || [];
    if(!Array.isArray(items)) return reply.code(400).send({error:'Ожидался массив'});
    
    let added = 0;
    for(const item of items) {
      if(!item.full_name) continue;
      
      // Проверяем, нет ли уже такого сотрудника
      const { rows: exists } = await q(
        'SELECT id FROM employees WHERE full_name = $1', 
        [item.full_name]
      );
      
      if(exists.length === 0) {
        await q(
          'INSERT INTO employees (full_name, position, department) VALUES ($1, $2, $3)',
          [item.full_name, item.position || '', item.department || '']
        );
        added++;
      }
    }
    return { added };
  });

  // Удалить (архивировать)
  app.delete('/:id', { preHandler: requireRole('admin') }, async (req) => {
    await q('UPDATE employees SET is_active = false WHERE id = $1', [req.params.id]);
    return { ok: true };
  });
}