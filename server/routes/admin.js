// server/routes/admin.js
import { authHook, requireRole } from '../auth.js';
import { q } from '../db.js';

export default async function(app){
  // Все роуты админки требуют авторизации и роли admin
  app.addHook('preHandler', authHook);
  app.addHook('preHandler', requireRole('admin'));

  // ============================================================
  // СТАТУСЫ ОБОРУДОВАНИЯ
  // ============================================================

  // Список всех статусов (можно и не-admin, для фильтров — сделаем отдельный роут ниже)
  app.get('/statuses', async () => {
    const { rows } = await q(
      `SELECT code, name, color, sort_order, is_active
       FROM asset_statuses
       ORDER BY sort_order, name`
    );
    return rows;
  });

  // Создать статус
  app.post('/statuses', async (req, reply) => {
    const b = req.body || {};
    if (!b.code || !b.name) return reply.code(400).send({ error: 'Укажите код и название' });
    try {
      const { rows } = await q(`
        INSERT INTO asset_statuses(code, name, color, sort_order, is_active)
        VALUES($1, $2, $3, $4, $5) RETURNING *`,
        [b.code, b.name, b.color || '#64748b', b.sort_order || 0, b.is_active ?? true]);
      return rows[0];
    } catch (e) {
      if (e.code === '23505') return reply.code(409).send({ error: 'Статус с таким кодом уже существует' });
      throw e;
    }
  });

  // Изменить
  app.patch('/statuses/:code', async (req, reply) => {
    const b = req.body || {};
    const { rows } = await q(`
      UPDATE asset_statuses SET
        name = COALESCE($1, name),
        color = COALESCE($2, color),
        sort_order = COALESCE($3, sort_order),
        is_active = COALESCE($4, is_active)
      WHERE code = $5 RETURNING *`,
      [b.name ?? null, b.color ?? null, b.sort_order ?? null, b.is_active ?? null, req.params.code]);
    if (!rows[0]) return reply.code(404).send({ error: 'Не найдено' });
    return rows[0];
  });

  // Удалить (только если не используется)
  app.delete('/statuses/:code', async (req, reply) => {
    const { rows } = await q('SELECT count(*)::int AS n FROM assets WHERE status = $1', [req.params.code]);
    if (rows[0].n > 0) {
      return reply.code(409).send({ error: `Статус используется в ${rows[0].n} активах. Сначала смените им статус.` });
    }
    await q('DELETE FROM asset_statuses WHERE code = $1', [req.params.code]);
    return { ok: true };
  });
}