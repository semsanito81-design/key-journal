export const up = (pgm) => {
  pgm.addColumns('assets', {
    last_inventory_date: { type: 'date' }
  });
};

export const down = (pgm) => {
  pgm.dropColumns('assets', 'last_inventory_date');
};