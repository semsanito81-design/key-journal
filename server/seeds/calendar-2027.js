import { pool } from '../db.js';

// Генерируем все дни года, по умолчанию — рабочие (пн–пт) или выходные (сб–вс)
function generateYear(year) {
  const days = [];
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, 11, 31));
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay(); // 0=вс, 6=сб
    const isWeekend = dow === 0 || dow === 6;
    days.push({ date: iso, type: isWeekend ? 'dayoff' : 'work', name: null });
  }
  return days;
}

// Переопределения из PDF
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
  '2026-12-31': 'Дополнительный выходной',
  '2027-02-22': 'Дополнительный выходной',
  '2027-05-03': 'Дополнительный выходной',
  '2027-05-10': 'Дополнительный выходной',
  '2027-06-14': 'Дополнительный выходной',
  '2027-11-05': 'Дополнительный выходной',
};

export async function seedCalendar2027() {
  const days = generateYear(2027);
  for (const d of days) {
    if (HOLIDAYS_2027[d.date]) { d.type = 'holiday'; d.name = HOLIDAYS_2027[d.date]; }
    else if (SHORT_2027[d.date]) { d.type = 'short'; d.name = SHORT_2027[d.date]; }
  }
  // Дополнительные выходные могут быть в 2026 — добавляем отдельно
  for (const [date, name] of Object.entries(EXTRA_OFF_2027)) {
    const year = +date.slice(0, 4);
    const exists = days.find(x => x.date === date);
    if (exists) { exists.type = 'dayoff'; exists.name = name; }
    else days.push({ date, type: 'dayoff', name, year });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM calendar_days WHERE year=$1', [2027]);
    for (const d of days) {
      await client.query(
        `INSERT INTO calendar_days(date, year, type, name) VALUES($1,$2,$3,$4)`,
        [d.date, +d.date.slice(0,4), d.type, d.name]
      );
    }
    await client.query('COMMIT');
    console.log(`✅ Залито ${days.length} дней на 2027`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Генерация базового календаря на любой год (пн-пт — рабочие, сб-вс — выходные)
export function generateBaseYear(year) {
  const days = [];
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, 11, 31));
  
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay(); // 0 = воскресенье, 6 = суббота
    const isWeekend = dow === 0 || dow === 6;
    days.push({ date: iso, year, type: isWeekend ? 'dayoff' : 'work', name: null });
  }
  return days;
}