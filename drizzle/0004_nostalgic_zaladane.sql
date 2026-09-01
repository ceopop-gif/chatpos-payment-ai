CREATE TABLE `merchant_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `merchant_applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `merchant_sessions_application_expiry_idx` ON `merchant_sessions` (`application_id`,`expires_at`);--> statement-breakpoint
CREATE INDEX `merchant_sessions_expiry_idx` ON `merchant_sessions` (`expires_at`);