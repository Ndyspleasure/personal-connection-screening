-- =============================================================================
-- Execution-domain immutability guards.
--   Data & State Model §33 (state transitions), §46 (attempt version-lock),
--   §71 (immutable records), §101 (state invariants);
--   Master Spec §33 (state transition rules); INV-D09; Threat TH-020, TH-030,
--   TH-031, TH-032.
--
-- After an attempt/session reaches a terminal state, no normal-flow row edit
-- can undo it. Version-lock columns and the frozen policy snapshot are
-- immutable for the whole lifetime of the attempt. Answers cannot be created,
-- updated, or deleted once the attempt is finalized.
-- =============================================================================

-- attempt ---------------------------------------------------------------------
-- Rules:
--   * Terminal states (COMPLETED, EXPIRED, ABANDONED, REVOKED, INTEGRITY_ERROR)
--     are final for normal flow — no UPDATE, no DELETE.
--   * Version-lock columns and the policy snapshot are IMMUTABLE for the whole
--     row lifetime, at every status (Data §46). New CMS publishes never mutate
--     these; the attempt row is created with them and never changes them.
CREATE OR REPLACE FUNCTION pcs_guard_attempt() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PCS_IMMUTABLE: attempts are append-only (id=%)', OLD.id;
  END IF;
  IF OLD.status IN ('COMPLETED', 'EXPIRED', 'ABANDONED', 'REVOKED', 'INTEGRITY_ERROR') THEN
    RAISE EXCEPTION 'PCS_IMMUTABLE: attempt % is in terminal state %', OLD.id, OLD.status;
  END IF;
  IF NEW.questionnaire_version_id IS DISTINCT FROM OLD.questionnaire_version_id
     OR NEW.scoring_version_id IS DISTINCT FROM OLD.scoring_version_id
     OR NEW.policy_version_id IS DISTINCT FROM OLD.policy_version_id
     OR NEW.policy_snapshot IS DISTINCT FROM OLD.policy_snapshot
     OR NEW.candidate_context_id IS DISTINCT FROM OLD.candidate_context_id
     OR NEW.public_ref IS DISTINCT FROM OLD.public_ref
     OR NEW.questionnaire_deadline IS DISTINCT FROM OLD.questionnaire_deadline
     OR NEW.started_at IS DISTINCT FROM OLD.started_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'PCS_IMMUTABLE: attempt version-lock or snapshot cannot change (id=%)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER trg_guard_attempt
  BEFORE UPDATE OR DELETE ON attempt
  FOR EACH ROW EXECUTE FUNCTION pcs_guard_attempt();
--> statement-breakpoint

-- session ---------------------------------------------------------------------
-- Rules:
--   * Terminal states (COMPLETED, EXPIRED, ABANDONED, REVOKED) cannot revive.
--   * Ownership is fixed at creation: attempt_id and token_fingerprint cannot
--     change (Data §101; Threat TH-006 fixation guard).
CREATE OR REPLACE FUNCTION pcs_guard_session() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PCS_IMMUTABLE: sessions are append-only (id=%)', OLD.id;
  END IF;
  IF OLD.status IN ('COMPLETED', 'EXPIRED', 'ABANDONED', 'REVOKED') THEN
    IF NEW.status <> OLD.status THEN
      RAISE EXCEPTION 'PCS_IMMUTABLE: session % is in terminal state %', OLD.id, OLD.status;
    END IF;
  END IF;
  IF NEW.attempt_id IS DISTINCT FROM OLD.attempt_id
     OR NEW.token_fingerprint IS DISTINCT FROM OLD.token_fingerprint
     OR NEW.public_ref IS DISTINCT FROM OLD.public_ref
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'PCS_IMMUTABLE: session ownership fixed at creation (id=%)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER trg_guard_session
  BEFORE UPDATE OR DELETE ON session
  FOR EACH ROW EXECUTE FUNCTION pcs_guard_session();
--> statement-breakpoint

-- answer ----------------------------------------------------------------------
-- Rules:
--   * The (attempt_id, question_version_id) identity of an answer row is fixed:
--     changing which question a persisted answer refers to is a corruption.
--     A new question requires a new answer row.
--   * Answers cannot be inserted, updated, or deleted once the parent attempt
--     is in a terminal state (COMPLETED/EXPIRED/ABANDONED/REVOKED/
--     INTEGRITY_ERROR) — Data §101, §102, INV-D09.
CREATE OR REPLACE FUNCTION pcs_guard_answer() RETURNS trigger AS $$
DECLARE attempt_status text;
DECLARE parent_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.attempt_id IS DISTINCT FROM OLD.attempt_id
       OR NEW.question_version_id IS DISTINCT FROM OLD.question_version_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'PCS_IMMUTABLE: answer identity is fixed at creation (id=%)', OLD.id;
    END IF;
  END IF;

  parent_id := COALESCE(NEW.attempt_id, OLD.attempt_id);
  SELECT status INTO attempt_status FROM attempt WHERE id = parent_id;
  IF attempt_status IN ('COMPLETED', 'EXPIRED', 'ABANDONED', 'REVOKED', 'INTEGRITY_ERROR') THEN
    RAISE EXCEPTION 'PCS_IMMUTABLE: answers frozen (parent attempt is %)', attempt_status;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER trg_guard_answer
  BEFORE INSERT OR UPDATE OR DELETE ON answer
  FOR EACH ROW EXECUTE FUNCTION pcs_guard_answer();
