-- 002_certificates.sql
-- Справочник типов сертификатов + сертификаты, привязанные к носителям

BEGIN;

-- 1. Справочник типов
CREATE TABLE IF NOT EXISTS cert_types (
  code SMALLINT PRIMARY KEY,              -- 1, 2, 3
  name TEXT NOT NULL,                     -- '2FA' | 'ЦОД' | 'Оператор'
  title TEXT NOT NULL,                    -- человекочитаемое
  default_valid_years SMALLINT NOT NULL DEFAULT 2,
  description TEXT
);

INSERT INTO cert_types (code, name, title, default_valid_years, description) VALUES
  (1, '2FA',      'Двухфакторная аутентификация', 2, 'Базовый сертификат для входа в корпоративные системы'),
  (2, 'ЦОД',      'Система ЦОД',                  2, 'Сертификат для доступа к системе ЦОД'),
  (3, 'Оператор', 'Оператор выпуска сертификатов', 1, 'Дополнительный сертификат для операторов УЦ')
ON CONFLICT (code) DO NOTHING;

-- 2. Сертификаты
CREATE TABLE IF NOT EXISTS certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_id UUID NOT NULL REFERENCES carriers(id) ON DELETE CASCADE,
  cert_type SMALLINT NOT NULL REFERENCES cert_types(code),
  serial_number TEXT,
  valid_from DATE NOT NULL,
  valid_to DATE,                          -- NULL = вычислить по типу
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','expired','revoked','reserved')),
  note TEXT,
  created TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cert_carrier  ON certificates(carrier_id);
CREATE INDEX IF NOT EXISTS idx_cert_valid_to ON certificates(valid_to);
CREATE INDEX IF NOT EXISTS idx_cert_type     ON certificates(cert_type);
CREATE INDEX IF NOT EXISTS idx_cert_status   ON certificates(status);

-- 3. Уникальность: на одном носителе не может быть двух сертификатов одного типа
CREATE UNIQUE INDEX IF NOT EXISTS uq_cert_carrier_type
  ON certificates(carrier_id, cert_type);

-- 4. Перенос данных из старой схемы (cert_type/cert_start/cert_serial в carriers)
--    Если valid_to = NULL, вычислим по типу: +2 года для 1,2; +1 год для 3.
INSERT INTO certificates (carrier_id, cert_type, serial_number, valid_from, valid_to, status)
SELECT
  c.id,
  COALESCE(c.cert_type, 1)::smallint,
  c.cert_serial,
  c.cert_start,
  CASE
    WHEN c.cert_start IS NULL THEN NULL
    WHEN COALESCE(c.cert_type,1) = 3
      THEN (c.cert_start + INTERVAL '1 year')::date
    ELSE (c.cert_start + INTERVAL '2 year')::date
  END,
  CASE c.status
    WHEN 'expired' THEN 'expired'
    WHEN 'returned' THEN 'revoked'
    ELSE 'active'
  END
FROM carriers c
WHERE c.cert_start IS NOT NULL
  AND c.cert_type IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM certificates x
    WHERE x.carrier_id = c.id AND x.cert_type = c.cert_type
  );

COMMIT;

-- Проверка
SELECT 'cert_types' AS t, COUNT(*) FROM cert_types
UNION ALL
SELECT 'certificates', COUNT(*) FROM certificates
UNION ALL
SELECT 'carriers', COUNT(*) FROM carriers;