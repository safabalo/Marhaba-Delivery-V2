-- PostGIS spatial setup for Marhaba Delivery v2.
--
-- Prisma manages most columns, but geography columns are declared as
-- Unsupported() and the spatial (GiST) indexes cannot be expressed in the
-- Prisma schema. After running `prisma migrate deploy`, apply this script
-- (idempotent) to create the extension, backfill geometry, and add the
-- spatial indexes that power zone lookup and nearest-driver queries.
--
-- In development, `prisma migrate dev` picks up `CREATE EXTENSION postgis`
-- automatically (via the schema's `extensions = [postgis]`); the GiST indexes
-- below should be added as a follow-up migration step.

CREATE EXTENSION IF NOT EXISTS postgis;

-- Spatial indexes ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS delivery_zones_area_gix
  ON delivery_zones USING GIST (area);

CREATE INDEX IF NOT EXISTS driver_location_history_geom_gix
  ON driver_location_history USING GIST (geom);

-- Composite index to accelerate nearest-available-driver scans.
CREATE INDEX IF NOT EXISTS driver_profiles_lastloc_idx
  ON driver_profiles ("lastLng", "lastLat")
  WHERE status = 'AVAILABLE';
