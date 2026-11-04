ALTER TABLE "Employee"
ADD COLUMN "qrCodeSerials" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN "qrCodeGenerationCount" INTEGER NOT NULL DEFAULT 0;

WITH unique_qr_codes AS (
  SELECT
    employee."employeeId",
    qr."value",
    MIN(qr."ordinality") AS first_ordinality
  FROM "Employee" AS employee
  CROSS JOIN LATERAL unnest(employee."qrCode") WITH ORDINALITY AS qr("value", "ordinality")
  GROUP BY employee."employeeId", qr."value"
), ranked_qr_codes AS (
  SELECT
    "employeeId",
    "value",
    ROW_NUMBER() OVER (
      PARTITION BY "employeeId"
      ORDER BY first_ordinality
    )::INTEGER AS serial_number
  FROM unique_qr_codes
), employee_qr_codes AS (
  SELECT
    "employeeId",
    array_agg("value" ORDER BY serial_number) AS qr_codes,
    array_agg(serial_number ORDER BY serial_number) AS qr_serials,
    MAX(serial_number) AS generation_count
  FROM ranked_qr_codes
  GROUP BY "employeeId"
)
UPDATE "Employee" AS employee
SET
  "qrCode" = COALESCE(employee_qr_codes.qr_codes, ARRAY[]::TEXT[]),
  "qrCodeSerials" = COALESCE(employee_qr_codes.qr_serials, ARRAY[]::INTEGER[]),
  "qrCodeGenerationCount" = COALESCE(employee_qr_codes.generation_count, 0)
FROM employee_qr_codes
WHERE employee."employeeId" = employee_qr_codes."employeeId";
