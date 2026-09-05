-- =============================================================================
-- DB-level immutability guards for published versions.
--   Data & State Model §71, §74; INV-D08; Threat Model TH-033 / TH-034;
--   Functional Spec §85–86.
--
-- A PUBLISHED version's content is frozen: the ONLY permitted change is a
-- status-only transition PUBLISHED -> ARCHIVED. ARCHIVED is terminal. Content
-- rows (options, bindings, scoring rules) belonging to a PUBLISHED/ARCHIVED
-- parent version cannot be inserted, updated, or deleted. DRAFT rows remain
-- freely editable. Enforced at the database, independent of the app layer.
-- =============================================================================

-- questionnaire_version -------------------------------------------------------
CREATE OR REPLACE FUNCTION pcs_guard_questionnaire_version() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('PUBLISHED', 'ARCHIVED') THEN
      RAISE EXCEPTION 'PCS_IMMUTABLE: cannot delete % questionnaire_version %', OLD.status, OLD.id;
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'ARCHIVED' THEN
    RAISE EXCEPTION 'PCS_IMMUTABLE: questionnaire_version % is archived', OLD.id;
  END IF;
  IF OLD.status = 'PUBLISHED' THEN
    IF NEW.status <> 'ARCHIVED'
       OR NEW.questionnaire_id IS DISTINCT FROM OLD.questionnaire_id
       OR NEW.version_number IS DISTINCT FROM OLD.version_number
       OR NEW.scoring_version_id IS DISTINCT FROM OLD.scoring_version_id
       OR NEW.revision IS DISTINCT FROM OLD.revision
       OR NEW.published_at IS DISTINCT FROM OLD.published_at
       OR NEW.published_by IS DISTINCT FROM OLD.published_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'PCS_IMMUTABLE: questionnaire_version % is published (only status->ARCHIVED permitted)', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER trg_guard_questionnaire_version
  BEFORE UPDATE OR DELETE ON questionnaire_version
  FOR EACH ROW EXECUTE FUNCTION pcs_guard_questionnaire_version();
--> statement-breakpoint

-- question_version ------------------------------------------------------------
CREATE OR REPLACE FUNCTION pcs_guard_question_version() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('PUBLISHED', 'ARCHIVED') THEN
      RAISE EXCEPTION 'PCS_IMMUTABLE: cannot delete % question_version %', OLD.status, OLD.id;
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'ARCHIVED' THEN
    RAISE EXCEPTION 'PCS_IMMUTABLE: question_version % is archived', OLD.id;
  END IF;
  IF OLD.status = 'PUBLISHED' THEN
    IF NEW.status <> 'ARCHIVED'
       OR NEW.question_id IS DISTINCT FROM OLD.question_id
       OR NEW.version_number IS DISTINCT FROM OLD.version_number
       OR NEW.type IS DISTINCT FROM OLD.type
       OR NEW.text IS DISTINCT FROM OLD.text
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.required IS DISTINCT FROM OLD.required
       OR NEW.revision IS DISTINCT FROM OLD.revision
       OR NEW.published_at IS DISTINCT FROM OLD.published_at
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'PCS_IMMUTABLE: question_version % is published (only status->ARCHIVED permitted)', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER trg_guard_question_version
  BEFORE UPDATE OR DELETE ON question_version
  FOR EACH ROW EXECUTE FUNCTION pcs_guard_question_version();
--> statement-breakpoint

-- scoring_version -------------------------------------------------------------
CREATE OR REPLACE FUNCTION pcs_guard_scoring_version() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('PUBLISHED', 'ARCHIVED') THEN
      RAISE EXCEPTION 'PCS_IMMUTABLE: cannot delete % scoring_version %', OLD.status, OLD.id;
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'ARCHIVED' THEN
    RAISE EXCEPTION 'PCS_IMMUTABLE: scoring_version % is archived', OLD.id;
  END IF;
  IF OLD.status = 'PUBLISHED' THEN
    IF NEW.status <> 'ARCHIVED'
       OR NEW.scoring_configuration_id IS DISTINCT FROM OLD.scoring_configuration_id
       OR NEW.version_number IS DISTINCT FROM OLD.version_number
       OR NEW.formula_type IS DISTINCT FROM OLD.formula_type
       OR NEW.passing_rule IS DISTINCT FROM OLD.passing_rule
       OR NEW.passing_score IS DISTINCT FROM OLD.passing_score
       OR NEW.revision IS DISTINCT FROM OLD.revision
       OR NEW.published_at IS DISTINCT FROM OLD.published_at
       OR NEW.published_by IS DISTINCT FROM OLD.published_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'PCS_IMMUTABLE: scoring_version % is published (only status->ARCHIVED permitted)', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER trg_guard_scoring_version
  BEFORE UPDATE OR DELETE ON scoring_version
  FOR EACH ROW EXECUTE FUNCTION pcs_guard_scoring_version();
--> statement-breakpoint

-- policy_version --------------------------------------------------------------
CREATE OR REPLACE FUNCTION pcs_guard_policy_version() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('PUBLISHED', 'ARCHIVED') THEN
      RAISE EXCEPTION 'PCS_IMMUTABLE: cannot delete % policy_version %', OLD.status, OLD.id;
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'ARCHIVED' THEN
    RAISE EXCEPTION 'PCS_IMMUTABLE: policy_version % is archived', OLD.id;
  END IF;
  IF OLD.status = 'PUBLISHED' THEN
    IF NEW.status <> 'ARCHIVED'
       OR NEW.policy_configuration_id IS DISTINCT FROM OLD.policy_configuration_id
       OR NEW.version_number IS DISTINCT FROM OLD.version_number
       OR NEW.session_lifetime_seconds IS DISTINCT FROM OLD.session_lifetime_seconds
       OR NEW.questionnaire_time_limit_seconds IS DISTINCT FROM OLD.questionnaire_time_limit_seconds
       OR NEW.timer_mode IS DISTINCT FROM OLD.timer_mode
       OR NEW.allow_resume IS DISTINCT FROM OLD.allow_resume
       OR NEW.allow_multi_device IS DISTINCT FROM OLD.allow_multi_device
       OR NEW.retake_mode IS DISTINCT FROM OLD.retake_mode
       OR NEW.max_attempts IS DISTINCT FROM OLD.max_attempts
       OR NEW.cooldown_seconds IS DISTINCT FROM OLD.cooldown_seconds
       OR NEW.revision IS DISTINCT FROM OLD.revision
       OR NEW.effective_at IS DISTINCT FROM OLD.effective_at
       OR NEW.published_by IS DISTINCT FROM OLD.published_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'PCS_IMMUTABLE: policy_version % is published (only status->ARCHIVED permitted)', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER trg_guard_policy_version
  BEFORE UPDATE OR DELETE ON policy_version
  FOR EACH ROW EXECUTE FUNCTION pcs_guard_policy_version();
--> statement-breakpoint

-- Child content rows: frozen once their parent version is PUBLISHED/ARCHIVED ---
CREATE OR REPLACE FUNCTION pcs_guard_answer_option_version() RETURNS trigger AS $$
DECLARE parent_status text;
BEGIN
  SELECT status INTO parent_status FROM question_version
    WHERE id = COALESCE(NEW.question_version_id, OLD.question_version_id);
  IF parent_status IN ('PUBLISHED', 'ARCHIVED') THEN
    RAISE EXCEPTION 'PCS_IMMUTABLE: answer_option_version frozen (parent question_version is %)', parent_status;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER trg_guard_answer_option_version
  BEFORE INSERT OR UPDATE OR DELETE ON answer_option_version
  FOR EACH ROW EXECUTE FUNCTION pcs_guard_answer_option_version();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION pcs_guard_qvq() RETURNS trigger AS $$
DECLARE parent_status text;
BEGIN
  SELECT status INTO parent_status FROM questionnaire_version
    WHERE id = COALESCE(NEW.questionnaire_version_id, OLD.questionnaire_version_id);
  IF parent_status IN ('PUBLISHED', 'ARCHIVED') THEN
    RAISE EXCEPTION 'PCS_IMMUTABLE: questionnaire_version_question frozen (parent is %)', parent_status;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER trg_guard_qvq
  BEFORE INSERT OR UPDATE OR DELETE ON questionnaire_version_question
  FOR EACH ROW EXECUTE FUNCTION pcs_guard_qvq();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION pcs_guard_scoring_rule() RETURNS trigger AS $$
DECLARE parent_status text;
BEGIN
  SELECT status INTO parent_status FROM scoring_version
    WHERE id = COALESCE(NEW.scoring_version_id, OLD.scoring_version_id);
  IF parent_status IN ('PUBLISHED', 'ARCHIVED') THEN
    RAISE EXCEPTION 'PCS_IMMUTABLE: scoring_rule frozen (parent scoring_version is %)', parent_status;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER trg_guard_scoring_rule
  BEFORE INSERT OR UPDATE OR DELETE ON scoring_rule
  FOR EACH ROW EXECUTE FUNCTION pcs_guard_scoring_rule();
