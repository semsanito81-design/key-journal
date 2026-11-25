import { authHook, requireRole } from '../auth.js';
import { q } from '../db.js';

export default async function(app) {
  app.addHook('preHandler', authHook);

  // Публичный (для всех авторизованных) — список активных статусов
  app.get('/', async (req) => {
    const includeInactive = req.query.all === '1';
    const { rows } = await q(
      `SELECT code, name, color, sort_order, is_active
       FROM asset_statuses
       ${includeInactive ? '' : 'WHERE is_active = true'}
       ORDER BY sort_order, name`
    );
    return rows;
  });

  // Создать (admin)
  app.post('/', { preHandler: requireRole('admin') }, async (req, reply) => {
    const { code, name, color, sort_order } = req.body || {};
    if (!code || !name) return reply.code(400).send({ error: 'Укажите код и название' });
    if (!/^[a-z_][a-z0-9_]*$/.test(code))
      return reply.code(400).send({ error: 'Код: только строчные латинские буквы, цифры и _' });
    try {
      const { rows } = await q(
        `INSERT INTO asset_statuses (code, name, color, sort_order)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [code, name, color || '#64748b', sort_order || 0]
      );
      return rows[0];
    } catch (e) {
      if (e.code === '23505') return reply.code(409).send({ error: 'Статус с таким кодом уже существует' });
      throw e;
    }
  });

  // Обновить (admin)
  app.patch('/:code', { preHandler: requireRole('admin') }, async (req, reply) => {
    const { name, color, sort_order, is_active } = req.body || {};
    const { rows } = await q(
      `UPDATE asset_statuses SET
         name = COALESCE($1, name),
         color = COALESCE($2, color),
         sort_order = COALESCE($3, sort_order),
         is_active = COALESCE($4, is_active)
       WHERE code = $5 RETURNING *`,
      [name ?? null, color ?? null, sort_order ?? null, is_active ?? null, req.params.code]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Не найдено' });
    return rows[0];
  });

  // Удалить (admin) — только если не используется
  app.delete('/:code', { preHandler: requireRole('admin') }, async (req, reply) => {
    const { rows: used } = await q(
      'SELECT count(*) FROM assets WHERE status = $1', [req.params.code]
    );
    if (+used[0].count > 0)
      return reply.code(400).send({
        error: `Нельзя удалить: статус используется в ${used[0].count} активах. Сначала смените им статус или деактивируйте.`
      });
    await q('DELETE FROM asset_statuses WHERE code = $1', [req.params.code]);
    return { ok: true };
  });
}