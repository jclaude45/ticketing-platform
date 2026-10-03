-- One-off: rebuild the ticket history ("Historique des billets") for the actions made
-- before the history was recorded (generations, cancellations, scans).
--
-- * Only actions older than the first recorded ticket.* row (or now) are added: no
--   duplicate of what the backend records itself.
-- * Every added row carries newValues.backfill = true. To undo:
--     DELETE FROM "AuditLog" WHERE "newValues"->>'backfill' = 'true';
-- * Refuses to run twice (stops if backfilled rows already exist).
-- * Generations are rebuilt as batches: tickets of the same tariff and origin created
--   less than 10 seconds apart.
--
-- Run inside a transaction: psql -v ON_ERROR_STOP=1 -f backfill-ticket-history.sql

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "AuditLog" WHERE "newValues"->>'backfill' = 'true') THEN
    RAISE EXCEPTION 'Ticket history already backfilled: nothing done';
  END IF;
END $$;

CREATE TEMP TABLE cutoff AS
SELECT COALESCE(MIN("createdAt"), now()) AS at
FROM "AuditLog" WHERE action LIKE 'ticket.%';

-- ── Scans ──────────────────────────────────────────────────────────────────
INSERT INTO "AuditLog" (id, "userId", action, entity, "entityId", "newValues", "createdAt")
SELECT gen_random_uuid()::text, NULL, 'ticket.scan', 'event', t."eventId",
       jsonb_build_object(
         'eventName', e.name, 'serialNumber', t."serialNumber", 'holderName', t."holderName",
         'result', sv.result::text, 'controllerName', c.name, 'backfill', true),
       COALESCE(sv."offlineScannedAt", sv."scannedAt")
FROM "ScanValidation" sv
JOIN "Ticket" t ON t.id = sv."ticketId"
JOIN "Event" e ON e.id = t."eventId"
LEFT JOIN "Controller" c ON c.id = sv."controllerId"
WHERE sv."scannedAt" < (SELECT at FROM cutoff);

-- ── Cancellations ──────────────────────────────────────────────────────────
INSERT INTO "AuditLog" (id, "userId", action, entity, "entityId", "newValues", "createdAt")
SELECT gen_random_uuid()::text, e."organizerId", 'ticket.cancel', 'event', t."eventId",
       jsonb_build_object(
         'eventName', e.name, 'serialNumber', t."serialNumber", 'holderName', t."holderName",
         'status', 'CANCELLED', 'backfill', true),
       t."cancelledAt"
FROM "Ticket" t
JOIN "Event" e ON e.id = t."eventId"
WHERE t."cancelledAt" IS NOT NULL AND t."cancelledAt" < (SELECT at FROM cutoff);

-- ── Generations, as batches ────────────────────────────────────────────────
WITH src AS (
  SELECT t.id, t."eventId", t."templateId", t."serialNumber", t."holderName", t."createdAt",
         e.name AS event_name, e."organizerId", tt.name AS template_name,
         CASE
           WHEN t.metadata->>'source' = 'INVITATION' THEN 'INVITATION'
           WHEN EXISTS (SELECT 1 FROM "Payment" p WHERE p."ticketsData"::text LIKE '%' || t.id || '%') THEN 'ONLINE'
           ELSE 'GENERATION'
         END AS source
  FROM "Ticket" t
  JOIN "Event" e ON e.id = t."eventId"
  JOIN "TicketTemplate" tt ON tt.id = t."templateId"
  WHERE t."createdAt" < (SELECT at FROM cutoff)
),
marked AS (
  SELECT src.*,
         CASE WHEN "createdAt" - LAG("createdAt") OVER w > interval '10 seconds'
                OR LAG("createdAt") OVER w IS NULL THEN 1 ELSE 0 END AS new_batch
  FROM src
  WINDOW w AS (PARTITION BY "templateId", source ORDER BY "createdAt", "serialNumber")
),
batched AS (
  SELECT marked.*,
         SUM(new_batch) OVER (PARTITION BY "templateId", source ORDER BY "createdAt", "serialNumber") AS batch
  FROM marked
)
INSERT INTO "AuditLog" (id, "userId", action, entity, "entityId", "newValues", "createdAt")
SELECT gen_random_uuid()::text,
       CASE WHEN source = 'ONLINE' THEN NULL ELSE MIN("organizerId") END,
       'ticket.generate', 'event', "eventId",
       jsonb_build_object(
         'eventName', MIN(event_name), 'templateName', MIN(template_name), 'count', COUNT(*),
         'source', source, 'serialNumber', MIN("serialNumber"),
         'serialNumbers', (array_agg("serialNumber" ORDER BY "serialNumber"))[1:20],
         'holderName', MIN("holderName"), 'backfill', true),
       MIN("createdAt")
FROM batched
GROUP BY "eventId", "templateId", source, batch;

SELECT action, count(*) AS lignes FROM "AuditLog" WHERE "newValues"->>'backfill' = 'true' GROUP BY action ORDER BY action;

COMMIT;
