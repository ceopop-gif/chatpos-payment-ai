CREATE TABLE `payment_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`client_request_id` text NOT NULL,
	`method` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`context` text DEFAULT '' NOT NULL,
	`source` text DEFAULT 'merchant_app' NOT NULL,
	`status` text DEFAULT 'success' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchant_applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_transactions_request_unique` ON `payment_transactions` (`client_request_id`);--> statement-breakpoint
CREATE INDEX `payment_transactions_merchant_created_idx` ON `payment_transactions` (`merchant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `payment_transactions_method_created_idx` ON `payment_transactions` (`method`,`created_at`);--> statement-breakpoint
CREATE INDEX `payment_transactions_status_created_idx` ON `payment_transactions` (`status`,`created_at`);