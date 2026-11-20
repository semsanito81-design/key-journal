import { authHook, requireRole } from '../auth.js';
import { q, pool } from '../db.js';
import { generateBaseYear } from '../seeds/calendar-2027.js';
//import { seedCalendar2027 } from '../seeds/calendar-2027.js';

export default async function(app) {
  app.addHook('preHandler', authHook);

  // Список годов, которые есть в БД
  app.get('/years', async () => {
    const { rows } = await q(`SELECT DISTINCT year FROM calendar_days ORDER BY year DESC`);
    return rows.map(r => r.year);
  });

  // Все дни года
  app.get('/:year', async (req, reply) => {
    const year = +req.params.year;
    if (!year || year < 2000 || year > 2100) return reply.code(400).send({ error: 'Неверный год' });
    const { rows } = await q(
      `SELECT date::text, type, name FROM calendar_days WHERE year=$1 ORDER BY date`,
      [year]
    );
    return rows;
  });

   // Сгенерировать календарь на любой год (admin)
  app.post('/:year/seed', { preHandler: requireRole('admin') }, async (req, reply) => {
    const year = +req.params.year;
    if (!year || year < 2000 || year > 2100) {
      return reply.code(400).send({ error: 'Неверный год (допустимо 2000–2100)' });
    }

    // Проверяем, есть ли уже данные
    const { rows: existing } = await q('SELECT count(*) FROM calendar_days WHERE year=$1', [year]);
    if (+existing[0].count > 0) {
      return reply.code(409).send({ error: `Календарь на ${year} год уже загружен. Удалите его перед повторной генерацией.` });
    }

    // Генерируем базовый календарь
    const days = generateBaseYear(year);
    // Если это 2027 — применяем праздники из PDF
    if (year === 2027) {
      const HOLIDAYS_2027 = {
        '2027-01-01': 'Новогодние каникулы', '2027-01-02': 'Новогодние каникулы',
        '2027-01-03': 'Новогодние каникулы', '2027-01-04': 'Новогодние каникулы',
        '2027-01-05': 'Новогодние каникулы', '2027-01-06': 'Новогодние каникулы',
        '2027-01-07': 'Рождество Христово', '2027-01-08': 'Новогодние каникулы',
        '2027-02-23': 'День защитника Отечества',
        '2027-03-08': 'Международный женский день',
        '2027-05-01': 'Праздник Весны и Труда',
        '2027-05-09': 'День Победы',
        '2027-06-12': 'День России',
        '2027-11-04': 'День народного единства',
      };
      const SHORT_2027 = {
        '2027-02-20': 'Перед Днём защитника Отечества',
        '2027-04-30': 'Перед Праздником Весны и Труда',
        '2027-06-11': 'Перед Днём России',
        '2027-11-03': 'Перед Днём народного единства',
      };
      const EXTRA_OFF_2027 = {
        '2027-02-22': 'Дополнительный выходной',
        '2027-05-03': 'Дополнительный выходной',
        '2027-05-10': 'Дополнительный выходной',
        '2027-06-14': 'Дополнительный выходной',
        '2027-11-05': 'Дополнительный выходной',
      };
      for (const d of days) {
        if (HOLIDAYS_2027[d.date]) { d.type = 'holiday'; d.name = HOLIDAYS_2027[d.date]; }
        else if (SHORT_2027[d.date]) { d.type = 'short'; d.name = SHORT_2027[d.date]; }
        else if (EXTRA_OFF_2027[d.date]) { d.type = 'dayoff'; d.name = EXTRA_OFF_2027[d.date]; }
      }
    }

    // Вставляем в БД
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const d of days) {
        await client.query(
          `INSERT INTO calendar_days(date, year, type, name) VALUES($1,$2,$3,$4)`,
          [d.date, year, d.type, d.name]
        );
      }
      await client.query('COMMIT');
      return { ok: true, year, count: days.length };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });

  // Удалить календарь за год (admin)
  app.delete('/:year', { preHandler: requireRole('admin') }, async (req, reply) => {
    const year = +req.params.year;
    const { rowCount } = await q('DELETE FROM calendar_days WHERE year=$1', [year]);
    if (rowCount === 0) return reply.code(404).send({ error: 'Календарь за этот год не найден' });
    return { ok: true, deleted: rowCount };
  });

  // Изменить тип дня (admin)
  app.patch('/day/:date', { preHandler: requireRole('admin') }, async (req, reply) => {
    const { type, name } = req.body || {};
    if (!['work','holiday','short','dayoff'].includes(type))
      return reply.code(400).send({ error: 'Неверный тип' });
    const { rows } = await q(
      `UPDATE calendar_days SET type=$1, name=$2 WHERE date=$3 RETURNING date::text, type, name`,
      [type, name || null, req.params.date]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'День не найден' });
    return rows[0];
  });
}