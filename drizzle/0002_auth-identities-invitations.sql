CREATE SCHEMA "onroad_auth";
--> statement-breakpoint
CREATE TABLE "onroad_auth"."Identity" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"provider" text NOT NULL,
	"subject" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onroad_auth"."Invitation" (
	"tokenHash" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "onroad_auth"."Identity" ADD CONSTRAINT "Identity_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "onroad_auth"."Invitation" ADD CONSTRAINT "Invitation_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "Identity_provider_subject_key" ON "onroad_auth"."Identity" USING btree ("provider","subject");--> statement-breakpoint
CREATE UNIQUE INDEX "Identity_user_provider_key" ON "onroad_auth"."Identity" USING btree ("userId","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "Invitation_user_key" ON "onroad_auth"."Invitation" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "Invitation_expiry_idx" ON "onroad_auth"."Invitation" USING btree ("expiresAt");
--> statement-breakpoint
REVOKE ALL ON SCHEMA "onroad_auth" FROM PUBLIC;
