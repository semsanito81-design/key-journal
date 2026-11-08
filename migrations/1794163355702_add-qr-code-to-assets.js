export const up = (pgm) => {
  pgm.addColumns('assets', {
    qr_code: { type: 'text' }
  });
};

export const down = (pgm) => {
  pgm.dropColumns('assets', 'qr_code');
};