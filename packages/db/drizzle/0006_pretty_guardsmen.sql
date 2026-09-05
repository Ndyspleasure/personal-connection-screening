CREATE TABLE "evaluation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"questionnaire_version_id" uuid NOT NULL,
	"scoring_version_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"passing_score" integer NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"status" text DEFAULT 'COMPLETED' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_submission_id_unique" UNIQUE("submission_id")
);
--> statement-breakpoint
CREATE TABLE "result" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_ref" text NOT NULL,
	"submission_id" uuid NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"result_type" text NOT NULL,
	"score" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "result_public_ref_unique" UNIQUE("public_ref"),
	CONSTRAINT "result_submission_id_unique" UNIQUE("submission_id"),
	CONSTRAINT "result_evaluation_id_unique" UNIQUE("evaluation_id")
);
--> statement-breakpoint
CREATE TABLE "submission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_ref" text NOT NULL,
	"attempt_id" uuid NOT NULL,
	"status" text DEFAULT 'SUBMITTING' NOT NULL,
	"idempotency_key" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submission_public_ref_unique" UNIQUE("public_ref"),
	CONSTRAINT "submission_attempt_idempotency_unique" UNIQUE("attempt_id","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_ref" text NOT NULL,
	"result_id" uuid NOT NULL,
	"status" text DEFAULT 'VALID' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "verification_public_ref_unique" UNIQUE("public_ref"),
	CONSTRAINT "verification_result_id_unique" UNIQUE("result_id")
);
--> statement-breakpoint
ALTER TABLE "evaluation" ADD CONSTRAINT "evaluation_submission_id_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submission"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result" ADD CONSTRAINT "result_submission_id_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submission"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result" ADD CONSTRAINT "result_evaluation_id_evaluation_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."evaluation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission" ADD CONSTRAINT "submission_attempt_id_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempt"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification" ADD CONSTRAINT "verification_result_id_result_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."result"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "submission_attempt_status_idx" ON "submission" USING btree ("attempt_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "submission_one_final_per_attempt" ON "submission" USING btree ("attempt_id") WHERE "submission"."status" = 'COMPLETED';