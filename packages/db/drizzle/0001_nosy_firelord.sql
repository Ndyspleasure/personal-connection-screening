CREATE TABLE "answer_option" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stable_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "answer_option_stable_key_unique" UNIQUE("stable_key")
);
--> statement-breakpoint
CREATE TABLE "answer_option_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"option_id" uuid NOT NULL,
	"question_version_id" uuid NOT NULL,
	"value" text NOT NULL,
	"label" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "answer_option_version_position_unique" UNIQUE("question_version_id","position")
);
--> statement-breakpoint
CREATE TABLE "question" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stable_key" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_stable_key_unique" UNIQUE("stable_key")
);
--> statement-breakpoint
CREATE TABLE "question_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"type" text NOT NULL,
	"text" text NOT NULL,
	"description" text,
	"required" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_version_number_unique" UNIQUE("question_id","version_number")
);
--> statement-breakpoint
CREATE TABLE "questionnaire" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"current_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "questionnaire_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "questionnaire_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"questionnaire_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"scoring_version_id" uuid,
	"published_at" timestamp with time zone,
	"published_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "questionnaire_version_number_unique" UNIQUE("questionnaire_id","version_number")
);
--> statement-breakpoint
CREATE TABLE "questionnaire_version_question" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"questionnaire_version_id" uuid NOT NULL,
	"question_version_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "qvq_position_unique" UNIQUE("questionnaire_version_id","position"),
	CONSTRAINT "qvq_membership_unique" UNIQUE("questionnaire_version_id","question_version_id")
);
--> statement-breakpoint
CREATE TABLE "scoring_configuration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scoring_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scoring_version_id" uuid NOT NULL,
	"option_version_id" uuid,
	"question_version_id" uuid,
	"points" integer DEFAULT 0 NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"rule_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scoring_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scoring_configuration_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"formula_type" text DEFAULT 'weighted_sum' NOT NULL,
	"passing_rule" text DEFAULT 'gte' NOT NULL,
	"passing_score" integer NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scoring_version_number_unique" UNIQUE("scoring_configuration_id","version_number")
);
--> statement-breakpoint
CREATE TABLE "policy_configuration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"policy_type" text DEFAULT 'session' NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_version" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"policy_configuration_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"session_lifetime_seconds" integer DEFAULT 86400 NOT NULL,
	"questionnaire_time_limit_seconds" integer DEFAULT 1800,
	"timer_mode" text DEFAULT 'absolute' NOT NULL,
	"allow_resume" boolean DEFAULT true NOT NULL,
	"allow_multi_device" boolean DEFAULT true NOT NULL,
	"retake_mode" text DEFAULT 'ON_NEW_VERSION' NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"cooldown_seconds" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"effective_at" timestamp with time zone,
	"published_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "policy_version_number_unique" UNIQUE("policy_configuration_id","version_number")
);
--> statement-breakpoint
ALTER TABLE "answer_option_version" ADD CONSTRAINT "answer_option_version_option_id_answer_option_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."answer_option"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_option_version" ADD CONSTRAINT "answer_option_version_question_version_id_question_version_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_version" ADD CONSTRAINT "question_version_question_id_question_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."question"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_version" ADD CONSTRAINT "questionnaire_version_questionnaire_id_questionnaire_id_fk" FOREIGN KEY ("questionnaire_id") REFERENCES "public"."questionnaire"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_version_question" ADD CONSTRAINT "questionnaire_version_question_questionnaire_version_id_questionnaire_version_id_fk" FOREIGN KEY ("questionnaire_version_id") REFERENCES "public"."questionnaire_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_version_question" ADD CONSTRAINT "questionnaire_version_question_question_version_id_question_version_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_rule" ADD CONSTRAINT "scoring_rule_scoring_version_id_scoring_version_id_fk" FOREIGN KEY ("scoring_version_id") REFERENCES "public"."scoring_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_rule" ADD CONSTRAINT "scoring_rule_option_version_id_answer_option_version_id_fk" FOREIGN KEY ("option_version_id") REFERENCES "public"."answer_option_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_rule" ADD CONSTRAINT "scoring_rule_question_version_id_question_version_id_fk" FOREIGN KEY ("question_version_id") REFERENCES "public"."question_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scoring_version" ADD CONSTRAINT "scoring_version_scoring_configuration_id_scoring_configuration_id_fk" FOREIGN KEY ("scoring_configuration_id") REFERENCES "public"."scoring_configuration"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_version" ADD CONSTRAINT "policy_version_policy_configuration_id_policy_configuration_id_fk" FOREIGN KEY ("policy_configuration_id") REFERENCES "public"."policy_configuration"("id") ON DELETE no action ON UPDATE no action;