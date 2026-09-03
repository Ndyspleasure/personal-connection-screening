-- =============================================================================
-- Finalization-domain immutability guards.
--   Data & State Model §71 (immutable records), §72 (mutability rules),
--   §101 (state invariants), §111 (double-submit example), §112 (timeout);
--   Master Spec §18 (result immutability); INV-D06 (one final submission).
--
-- After finalization, submission/evaluation/result/verification rows are the
-- historical record and cannot be mutated or deleted. Only the verification
-- status may flip to REVOKED — the underlying result stays as-is.
-- =============================================================================

-- submission ------------------------------------------------------------------
-- Rules:
--   * DELETE is always blocked.
--   * COMPLETED / EVALUATION_ERROR / INTEGRITY_ERROR are terminal for normal
--     flow: only finalized_at/updated_at may still fluctuate; the identity
--     (attempt_id, public_ref, idempotency_key) and status cannot change.
--   * A RECOVERABLE_ERROR submission may still transition forward.
CREATE OR REPLACE FUNCTION pcs_guard_submission() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PCS_IMMUTABLE: submissions are append-only (id=%)', OLD.id;
  END IF;
  IF NEW.attempt_id IS DISTINCT FROM OLD.attempt_id
     OR NEW.public_ref IS DISTINCT FROM OLD.public_ref
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
    RAISE EXCEPTION 'PCS_IMMUTABLE: submission identity fixed at creation (id=%)', OLD.id;
  END IF;
  IF OLD.status IN ('COMPLETED', 'EVALUATION_ERROR', 'INTEGRITY_ERROR')
     AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'PCS_IMMUTABLE: submission % is in terminal state %', OLD.id, OLD.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER trg_guard_submission
  BEFORE UPDATE OR DELETE ON submission
  FOR EACH ROW EXECUTE FUNCTION pcs_guard_submission();
--> statement-breakpoint

-- evaluation ------------------------------------------------------------------
-- Evaluations are append-only. Once written they are the historical record
-- (Data §71, §102). No column may change; no row may be deleted.
CREATE OR REPLACE FUNCTION pcs_guard_evaluation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PCS_IMMUTABLE: evaluations are append-only (id=%)', OLD.id;
  END IF;
  RAISE EXCEPTION 'PCS_IMMUTABLE: evaluation % is finalized', OLD.id;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER trg_guard_evaluation
  BEFORE UPDATE OR DELETE ON evaluation
  FOR EACH ROW EXECUTE FUNCTION pcs_guard_evaluation();
--> statement-breakpoint

-- result ----------------------------------------------------------------------
-- Same rule as evaluation: result is the business record. Never mutates.
CREATE OR REPLACE FUNCTION pcs_guard_result() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PCS_IMMUTABLE: results are append-only (id=%)', OLD.id;
  END IF;
  RAISE EXCEPTION 'PCS_IMMUTABLE: result % is finalized', OLD.id;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER trg_guard_result
  BEFORE UPDATE OR DELETE ON result
  FOR EACH ROW EXECUTE FUNCTION pcs_guard_result();
--> statement-breakpoint

-- verification ----------------------------------------------------------------
-- Rules:
--   * DELETE is blocked (Data §71).
--   * result_id and public_ref are immutable.
--   * status may only transition VALID -> REVOKED, and REVOKED stays REVOKED
--     (Data §39, §115; verification revoke is future-UI, not history rewrite).
CREATE OR REPLACE FUNCTION pcs_guard_verification() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PCS_IMMUTABLE: verifications are append-only (id=%)', OLD.id;
  END IF;
  IF NEW.result_id IS DISTINCT FROM OLD.result_id
     OR NEW.public_ref IS DISTINCT FROM OLD.public_ref
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'PCS_IMMUTABLE: verification identity fixed at creation (id=%)', OLD.id;
  END IF;
  IF OLD.status = 'REVOKED' AND NEW.status <> 'REVOKED' THEN
    RAISE EXCEPTION 'PCS_IMMUTABLE: verification % is already REVOKED', OLD.id;
  END IF;
  IF NEW.status NOT IN ('VALID', 'REVOKED') THEN
    RAISE EXCEPTION 'PCS_IMMUTABLE: verification status must be VALID or REVOKED';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER trg_guard_verification
  BEFORE UPDATE OR DELETE ON verification
  FOR EACH ROW EXECUTE FUNCTION pcs_guard_verification();
