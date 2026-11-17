CREATE TABLE "model_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"tag" text NOT NULL,
	"wrapped_dek" text NOT NULL,
	"dek_iv" text NOT NULL,
	"dek_tag" text NOT NULL,
	"kek_id" text NOT NULL,
	"last4" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"request_text" text NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"spec" jsonb NOT NULL,
	"spec_hash" text NOT NULL,
	"provider" text NOT NULL,
	"mode" text NOT NULL,
	"usage" jsonb NOT NULL,
	"workflow_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "model_credentials" ADD CONSTRAINT "model_credentials_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_drafts" ADD CONSTRAINT "plan_drafts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "model_credentials_workspace_provider_idx" ON "model_credentials" USING btree ("workspace_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_drafts_idempotency_idx" ON "plan_drafts" USING btree ("workspace_id","created_by","idempotency_key");--> statement-breakpoint
CREATE INDEX "plan_drafts_workspace_idx" ON "plan_drafts" USING btree ("workspace_id","created_at");