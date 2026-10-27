CREATE TABLE "AssistantInboundEvent" (
	"id" text PRIMARY KEY NOT NULL,
	"waMessageId" text NOT NULL,
	"waId" text NOT NULL,
	"phoneNumberId" text NOT NULL,
	"messageType" text NOT NULL,
	"payload" jsonb,
	"status" text DEFAULT 'RECEIVED' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"sentAt" timestamp (3) NOT NULL,
	"receivedAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "AssistantInboundEvent_status_check" CHECK ("AssistantInboundEvent"."status" IN ('RECEIVED', 'PROCESSING', 'DONE', 'FAILED', 'DEAD'))
);
--> statement-breakpoint
CREATE TABLE "AssistantLoad" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"status" text DEFAULT 'ANALYZED' NOT NULL,
	"facts" jsonb NOT NULL,
	"lane" text,
	"grossRate" numeric(12, 2),
	"totalMiles" numeric(10, 1) NOT NULL,
	"contribution" numeric(12, 2),
	"contributionPerMile" numeric(10, 4),
	"rating" text,
	"score" integer,
	"decision" text,
	"offers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "AssistantLoad_status_check" CHECK ("AssistantLoad"."status" IN ('ANALYZED', 'SAVED'))
);
--> statement-breakpoint
CREATE TABLE "AssistantOutboundMessage" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"waMessageId" text,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"errorCode" integer,
	"errorTitle" text,
	"length" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "AssistantOutboundMessage_status_check" CHECK ("AssistantOutboundMessage"."status" IN ('SENT', 'DELIVERED', 'READ', 'FAILED', 'WINDOW_CLOSED'))
);
--> statement-breakpoint
CREATE TABLE "AssistantProcessingLease" (
	"waId" text PRIMARY KEY NOT NULL,
	"holder" text NOT NULL,
	"leaseUntil" timestamp (3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AssistantUsage" (
	"userId" text NOT NULL,
	"day" date NOT NULL,
	"messagesIn" integer DEFAULT 0 NOT NULL,
	"messagesOut" integer DEFAULT 0 NOT NULL,
	"aiCalls" integer DEFAULT 0 NOT NULL,
	"aiInputTokens" integer DEFAULT 0 NOT NULL,
	"aiOutputTokens" integer DEFAULT 0 NOT NULL,
	"transcriptions" integer DEFAULT 0 NOT NULL,
	"audioSeconds" integer DEFAULT 0 NOT NULL,
	"costMicros" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "AssistantUsage_pkey" PRIMARY KEY("userId","day")
);
--> statement-breakpoint
CREATE TABLE "AssistantUser" (
	"id" text PRIMARY KEY NOT NULL,
	"waId" text NOT NULL,
	"displayName" text,
	"profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"conversation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"lastInboundAt" timestamp (3),
	"createdAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp (3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "AssistantLoad" ADD CONSTRAINT "AssistantLoad_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."AssistantUser"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "AssistantOutboundMessage" ADD CONSTRAINT "AssistantOutboundMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."AssistantUser"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "AssistantUsage" ADD CONSTRAINT "AssistantUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."AssistantUser"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "AssistantInboundEvent_waMessageId_key" ON "AssistantInboundEvent" USING btree ("waMessageId");--> statement-breakpoint
CREATE INDEX "AssistantInboundEvent_waId_status_idx" ON "AssistantInboundEvent" USING btree ("waId","status","sentAt");--> statement-breakpoint
CREATE INDEX "AssistantInboundEvent_status_receivedAt_idx" ON "AssistantInboundEvent" USING btree ("status","receivedAt");--> statement-breakpoint
CREATE INDEX "AssistantLoad_userId_createdAt_idx" ON "AssistantLoad" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "AssistantOutboundMessage_waMessageId_key" ON "AssistantOutboundMessage" USING btree ("waMessageId");--> statement-breakpoint
CREATE INDEX "AssistantOutboundMessage_userId_createdAt_idx" ON "AssistantOutboundMessage" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "AssistantUser_waId_key" ON "AssistantUser" USING btree ("waId");