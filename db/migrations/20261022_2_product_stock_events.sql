-- 2026-10-22: when sellers switch a product between "Tersedia" and "Stok Kosong", one row per switch, for the
-- dashboards' Aktivitas chart. Filled from the notifications already sent for such switches (the seller's own
-- copy, "You marked …"), so the chart also shows the days before this migration.
--   psql -h localhost -U postgres -d prafi_db -v ON_ERROR_STOP=1 -f db/migrations/20261022_2_product_stock_events.sql
BEGIN;

CREATE TABLE product_stock_events (
  id SERIAL PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  -- the new value: false = marked "Stok Kosong", true = "Tersedia" again
  is_available BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX product_stock_events_created_at ON product_stock_events (created_at);

INSERT INTO product_stock_events (product_id, is_available, created_at)
SELECT p.id, n.name = 'Product available again', n.created_at
FROM notifications n
JOIN products p ON p.id::text = n.entity_id
WHERE n.type = 'PRODUCT_AVAILABILITY_CHANGED' AND n.description LIKE 'You marked%';

COMMIT;
