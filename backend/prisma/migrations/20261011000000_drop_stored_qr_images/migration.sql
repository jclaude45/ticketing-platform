-- Data only: QR images are now drawn from the ticket id and serial when shown.
-- The stored PNGs (about 2.2 KB per ticket, copied again into each paid order) are dropped.
UPDATE "Ticket" SET "qrCode" = NULL WHERE "qrCode" IS NOT NULL;
UPDATE "Payment" p SET "ticketsData" = (
  SELECT jsonb_agg(elem - 'qrCode') FROM jsonb_array_elements(p."ticketsData"::jsonb) elem
)
WHERE p."ticketsData" IS NOT NULL AND jsonb_typeof(p."ticketsData"::jsonb) = 'array';
