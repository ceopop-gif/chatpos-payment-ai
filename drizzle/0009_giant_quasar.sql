CREATE TABLE `membership_charge_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`charge_type` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`due_date` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`payment_source` text DEFAULT 'merchant_balance' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`paid_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchant_applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_charge_merchant_type_due_unique` ON `membership_charge_ledger` (`merchant_id`,`charge_type`,`due_date`);--> statement-breakpoint
CREATE INDEX `membership_charge_merchant_status_due_idx` ON `membership_charge_ledger` (`merchant_id`,`status`,`due_date`);--> statement-breakpoint
CREATE INDEX `membership_charge_status_due_idx` ON `membership_charge_ledger` (`status`,`due_date`);--> statement-breakpoint
CREATE TABLE `merchant_financial_accounts` (
	`merchant_id` text PRIMARY KEY NOT NULL,
	`available_balance_cents` integer DEFAULT 0 NOT NULL,
	`total_transaction_fees_cents` integer DEFAULT 0 NOT NULL,
	`total_service_fees_cents` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchant_applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `merchant_memberships` (
	`merchant_id` text PRIMARY KEY NOT NULL,
	`plan_code` text DEFAULT 'subscriber' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`activation_fee_cents` integer DEFAULT 29000 NOT NULL,
	`daily_fee_cents` integer DEFAULT 1000 NOT NULL,
	`promptpay_quota_cents` integer DEFAULT 3000000 NOT NULL,
	`promptpay_used_cents` integer DEFAULT 0 NOT NULL,
	`current_cycle_start` text NOT NULL,
	`current_cycle_end` text NOT NULL,
	`last_daily_charge_date` text NOT NULL,
	`outstanding_cents` integer DEFAULT 0 NOT NULL,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`cancelled_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchant_applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `merchant_memberships_status_cycle_idx` ON `merchant_memberships` (`status`,`current_cycle_end`);--> statement-breakpoint
ALTER TABLE `payment_transactions` ADD `fee_rate_bps` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `payment_transactions` ADD `fee_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `payment_transactions` ADD `net_amount_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `payment_transactions` ADD `membership_plan` text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE `payment_transactions` ADD `free_quota_applied_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `payment_transactions` ADD `quota_cycle_started_at` text;