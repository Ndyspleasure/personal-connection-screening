CREATE TABLE "access_code" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_kind_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"label" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"expires_at" timestamp with time zone,
	"max_uses" integer,
	"use_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_code_kind_hash_unique" UNIQUE("session_kind_id","code_hash"),
	CONSTRAINT "access_code_status_check" CHECK ("access_code"."status" IN ('ACTIVE', 'DISABLED', 'REVOKED')),
	CONSTRAINT "access_code_use_count_check" CHECK ("access_code"."use_count" >= 0),
	CONSTRAINT "access_code_max_uses_check" CHECK ("access_code"."max_uses" IS NULL OR "access_code"."max_uses" > 0)
);
--> statement-breakpoint
CREATE TABLE "session_kind" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"tagline" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"requires_access_code" boolean DEFAULT false NOT NULL,
	"questionnaire_id" uuid NOT NULL,
	"accent" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_kind_key_unique" UNIQUE("key"),
	CONSTRAINT "session_kind_status_check" CHECK ("session_kind"."status" IN ('ACTIVE', 'HIDDEN'))
);
--> statement-breakpoint
ALTER TABLE "attempt" ADD COLUMN "session_kind_id" uuid;--> statement-breakpoint
ALTER TABLE "access_code" ADD CONSTRAINT "access_code_session_kind_id_session_kind_id_fk" FOREIGN KEY ("session_kind_id") REFERENCES "public"."session_kind"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_kind" ADD CONSTRAINT "session_kind_questionnaire_id_questionnaire_id_fk" FOREIGN KEY ("questionnaire_id") REFERENCES "public"."questionnaire"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_code_hash_idx" ON "access_code" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "access_code_kind_idx" ON "access_code" USING btree ("session_kind_id");--> statement-breakpoint
CREATE INDEX "session_kind_order_idx" ON "session_kind" USING btree ("display_order");--> statement-breakpoint
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_session_kind_id_session_kind_id_fk" FOREIGN KEY ("session_kind_id") REFERENCES "public"."session_kind"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempt_session_kind_idx" ON "attempt" USING btree ("session_kind_id");