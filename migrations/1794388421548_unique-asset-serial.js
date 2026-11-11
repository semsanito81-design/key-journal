export const up = (pgm) => {
  pgm.addConstraint('assets', 'assets_serial_number_unique', {
    unique: 'serial_number',
  });
};

export const down = (pgm) => {
  pgm.dropConstraint('assets', 'assets_serial_number_unique');
};