CREATE TABLE `admin_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `admin_sessions_expiry_idx` ON `admin_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`phone` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agents_code_unique` ON `agents` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `agents_phone_unique` ON `agents` (`phone`);--> statement-breakpoint
CREATE INDEX `agents_status_created_idx` ON `agents` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `kyc_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`action` text NOT NULL,
	`previous_status` text NOT NULL,
	`next_status` text NOT NULL,
	`agent_id` text,
	`note` text DEFAULT '' NOT NULL,
	`reviewed_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `merchant_applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `kyc_reviews_application_created_idx` ON `kyc_reviews` (`application_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `kyc_reviews_agent_created_idx` ON `kyc_reviews` (`agent_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `merchant_applications` ADD `agent_id` text REFERENCES agents(id);--> statement-breakpoint
ALTER TABLE `merchant_applications` ADD `agent_reference` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `merchant_applications` ADD `kyc_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `merchant_applications` ADD `kyc_note` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `merchant_applications` ADD `approved_at` text;--> statement-breakpoint
ALTER TABLE `merchant_applications` ADD `approved_by` text;--> statement-breakpoint
CREATE INDEX `merchant_applications_agent_kyc_idx` ON `merchant_applications` (`agent_id`,`kyc_status`,`created_at`);--> statement-breakpoint
CREATE INDEX `merchant_applications_kyc_created_idx` ON `merchant_applications` (`kyc_status`,`created_at`);--> statement-breakpoint
ALTER TABLE `restaurant_tables` ADD `merchant_id` text;--> statement-breakpoint
CREATE INDEX `restaurant_tables_merchant_active_idx` ON `restaurant_tables` (`merchant_id`,`active`,`created_at`);