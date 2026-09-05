-- =============================================================================
-- Audit trail is append-only.
--   Data & State Model §40, §79–80 (audit trail, append-only); Security §48;
--   Technology Architecture §56 (correlation ids); INV-S-audit.
--
-- Every privileged action writes an `audit_event`. Once written it is the
-- historical record: it can never be updated or deleted, at the DB level, by
-- anyone — including the application role. Only INSERT is permitted.
-- =============================================================================
CREATE OR REPLACE FUNCTION pcs_guard_audit_event() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'PCS_IMMUTABLE: audit_event is append-only (op=%, id=%)', TG_OP, OLD.id;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER trg_guard_audit_event
  BEFORE UPDATE OR DELETE ON audit_event
  FOR EACH ROW EXECUTE FUNCTION pcs_guard_audit_event();
