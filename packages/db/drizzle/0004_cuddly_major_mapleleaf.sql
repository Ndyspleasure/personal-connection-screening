CREATE TABLE "answer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"question_version_id" uuid NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"selected_option_version_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"text_value" text,
	"numeric_value" integer,
	"boolean_value" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "answer_attempt_question_version_unique" UNIQUE("attempt_id","question_version_id"),
	CONSTRAINT "answer_has_some_value" CHECK (jsonb_array_length("answer"."selected_option_version_ids") > 0
        OR "answer"."text_value" IS NOT NULL
        OR "answer"."numeric_value" IS NOT NULL
        OR "answer"."boolean_value" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "attempt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_ref" text NOT NULL,
	"candidate_context_id" uuid,
	"questionnaire_version_id" uuid NOT NULL,
	"scoring_version_id" uuid NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"policy_snapshot" jsonb NOT NULL,
	"status" text DEFAULT 'CREATED' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"questionnaire_started_at" timestamp with time zone,
	"questionnaire_deadline" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attempt_public_ref_unique" UNIQUE("public_ref")
);
--> statement-breakpoint
CREATE TABLE "candidate_context" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_ref" text NOT NULL,
	"name" text,
	"contact" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidate_context_public_ref_unique" UNIQUE("public_ref")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_ref" text NOT NULL,
	"attempt_id" uuid NOT NULL,
	"token_fingerprint" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "session_public_ref_unique" UNIQUE("public_ref"),
	CONSTRAINT "session_token_fingerprint_unique" UNIQUE("token_fingerprint")
);
--> statement-breakpoint
ALTER TABLE "answer" ADD CONSTRAINT "answer_attempt_id_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempt"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer" ADD CONSTRAINT "answer_question_version_id_question_version_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_candidate_context_id_candidate_context_id_fk" FOREIGN KEY ("candidate_context_id") REFERENCES "public"."candidate_context"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_questionnaire_version_id_questionnaire_version_id_fk" FOREIGN KEY ("questionnaire_version_id") REFERENCES "public"."questionnaire_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_scoring_version_id_scoring_version_id_fk" FOREIGN KEY ("scoring_version_id") REFERENCES "public"."scoring_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_policy_version_id_policy_version_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."policy_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_attempt_id_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempt"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "answer_attempt_idx" ON "answer" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "attempt_questionnaire_version_idx" ON "attempt" USING btree ("questionnaire_version_id");--> statement-breakpoint
CREATE INDEX "attempt_candidate_idx" ON "attempt" USING btree ("candidate_context_id");--> statement-breakpoint
CREATE INDEX "session_attempt_idx" ON "session" USING btree ("attempt_id");