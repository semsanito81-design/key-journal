export const up = (pgm) => {
  // 1. Создаём таблицу статусов
  pgm.createTable('asset_statuses', {
    code:       { type: 'text', primaryKey: true },
    name:       { type: 'text', notNull: true },
    color:      { type: 'text', notNull: true, default: '#64748b' },
    sort_order: { type: 'smallint', notNull: true, default: 0 },
    is_active:  { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', default: pgm.func('now()') },
  });

  // 2. Заполняем существующими статусами + новый «В мастерской»
  pgm.sql(`
    INSERT INTO asset_statuses (code, name, color, sort_order) VALUES
      ('active',      'В работе',     '#16a34a', 1),
      ('repair',      'В ремонте',    '#d97706', 2),
      ('storage',     'На складе',    '#2563eb', 3),
      ('written_off', 'Списано',      '#dc2626', 4),
      ('workshop',    'В мастерской', '#7c3aed', 5)
  `);

  // 3. Убираем старый CHECK
  pgm.dropConstraint('assets', 'assets_status_check');

  // 4. Добавляем FK на новую таблицу
  pgm.addConstraint('assets', 'assets_status_fk', {
    foreignKeys: {
      columns: 'status',
      references: 'asset_statuses(code)',
    },
  });
};

export const down = (pgm) => {
  // Откат: возвращаем CHECK и удаляем таблицу
  pgm.dropConstraint('assets', 'assets_status_fk');
  pgm.addConstraint('assets', 'assets_status_check', {
    check: "status = ANY (ARRAY['active'::text, 'repair'::text, 'storage'::text, 'written_off'::text])"
  });
  pgm.dropTable('asset_statuses');
};