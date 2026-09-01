CREATE TABLE `merchant_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`application_number` text NOT NULL,
	`client_request_id` text NOT NULL,
	`phone` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`address` text NOT NULL,
	`latitude` real,
	`longitude` real,
	`location_accuracy_m` real,
	`map_url` text DEFAULT '' NOT NULL,
	`business_description` text NOT NULL,
	`consent` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_applications_number_unique` ON `merchant_applications` (`application_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_applications_request_unique` ON `merchant_applications` (`client_request_id`);--> statement-breakpoint
CREATE INDEX `merchant_applications_phone_created_idx` ON `merchant_applications` (`phone`,`created_at`);--> statement-breakpoint
CREATE INDEX `merchant_applications_status_created_idx` ON `merchant_applications` (`status`,`created_at`);