export const up = (pgm) => {
  pgm.createTable('calendar_days', {
    date:       { type: 'date', primaryKey: true },
    year:       { type: 'smallint', notNull: true },
    type:       { type: 'text', notNull: true, check: "type IN ('work','holiday','short','dayoff')" },
    name:       { type: 'text' },
    created_at: { type: 'timestamptz', default: pgm.func('now()') },
  });
  pgm.createIndex('calendar_days', 'year');
};

export const down = (pgm) => {
  pgm.dropTable('calendar_days');
};