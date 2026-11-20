export const up = (pgm) => {
  pgm.createTable('vacations', {
    id:          { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    employee_id: { type: 'uuid', notNull: true, references: 'employees', onDelete: 'CASCADE' },
    date_from:   { type: 'date', notNull: true },
    date_to:     { type: 'date', notNull: true },
    kind:        { type: 'text', notNull: true, default: 'annual',
                   check: "kind IN ('annual','unpaid','sick','study','other')" },
    note:        { type: 'text' },
    created_by:  { type: 'uuid', references: 'users' },
    created_at:  { type: 'timestamptz', default: pgm.func('now()') },
    updated_at:  { type: 'timestamptz', default: pgm.func('now()') },
  });
  pgm.addConstraint('vacations', 'vacations_dates_check', 'CHECK (date_to >= date_from)');
  pgm.createIndex('vacations', 'employee_id');
  pgm.createIndex('vacations', ['date_from', 'date_to']);
};

export const down = (pgm) => {
  pgm.dropTable('vacations');
};