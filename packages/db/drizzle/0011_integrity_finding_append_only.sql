-- =============================================================================
-- Integrity findings are append-only.
--   Data & State Model §113 (never silent repair); Security §41; INV INT-02.
--
-- A finding is the recorded evidence that an impossible/inconsistent state was
-- observed. It must not be quietly edited away or deleted — only INSERTs are
-- allowed. Remediation is a separate, auditable action, never a mutation here.
-- =============================================================================
CREATE OR REPLACE FUNCTION pcs_guard_integrity_finding() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'PCS_IMMUTABLE: integrity_finding is append-only (op=%, id=%)', TG_OP, OLD.id;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER trg_guard_integrity_finding
  BEFORE UPDATE OR DELETE ON integrity_finding
  FOR EACH ROW EXECUTE FUNCTION pcs_guard_integrity_finding();
