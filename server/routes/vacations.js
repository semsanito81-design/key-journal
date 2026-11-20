import { authHook, requireRole } from '../auth.js';
import { q } from '../db.js';

export default async function(app) {
  app.addHook('preHandler', authHook);

  // Список отпусков (фильтры: year, employee_id)
  app.get('/', async (req) => {
    const { year, employee_id } = req.query;
    const cond = [], params = [];
    if (year) {
      params.push(+year);
      cond.push(`EXTRACT(YEAR FROM v.date_from) <= $${params.length} AND EXTRACT(YEAR FROM v.date_to) >= $${params.length}`);
    }
    if (employee_id) { params.push(employee_id); cond.push(`v.employee_id = $${params.length}`); }
    const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
    const { rows } = await q(`
      SELECT v.*, e.full_name AS employee_name, e.position, e.department
      FROM vacations v
      JOIN employees e ON e.id = v.employee_id
      ${where}
      ORDER BY v.date_from DESC`, params);
    return rows;
  });

  // Создать
  app.post('/', { preHandler: requireRole('admin','operator') }, async (req, reply) => {
    const b = req.body || {};
    if (!b.employee_id || !b.date_from || !b.date_to)
      return reply.code(400).send({ error: 'employee_id, date_from, date_to обязательны' });
    try {
      const { rows } = await q(`
        INSERT INTO vacations(employee_id, date_from, date_to, kind, note, created_by)
        VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
        [b.employee_id, b.date_from, b.date_to, b.kind || 'annual', b.note || null, req.user.id]);
      return rows[0];
    } catch (e) {
      if (e.code === '23514') return reply.code(400).send({ error: 'Дата окончания раньше даты начала' });
      throw e;
    }
  });

  // Изменить
  app.patch('/:id', { preHandler: requireRole('admin','operator') }, async (req, reply) => {
    const b = req.body || {};
    const { rows } = await q(`
      UPDATE vacations SET
        date_from = COALESCE($1, date_from),
        date_to   = COALESCE($2, date_to),
        kind      = COALESCE($3, kind),
        note      = COALESCE($4, note),
        updated_at = now()
      WHERE id=$5 RETURNING *`,
      [b.date_from || null, b.date_to || null, b.kind || null, b.note ?? null, req.params.id]);
    if (!rows[0]) return reply.code(404).send({ error: 'Не найдено' });
    return rows[0];
  });

  // Удалить
  app.delete('/:id', { preHandler: requireRole('admin','operator') }, async (req) => {
    await q('DELETE FROM vacations WHERE id=$1', [req.params.id]);
    return { ok: true };
  });
}