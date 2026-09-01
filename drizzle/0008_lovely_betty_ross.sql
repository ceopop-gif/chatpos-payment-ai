CREATE TABLE `merchant_menu_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`merchant_id` text NOT NULL,
	`name` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchant_applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_menu_categories_merchant_name_unique` ON `merchant_menu_categories` (`merchant_id`,`name`);--> statement-breakpoint
CREATE INDEX `merchant_menu_categories_merchant_position_idx` ON `merchant_menu_categories` (`merchant_id`,`position`);--> statement-breakpoint
CREATE TABLE `merchant_menu_products` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`local_product_id` integer NOT NULL,
	`name` text NOT NULL,
	`price_cents` integer NOT NULL,
	`category` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`image_key` text,
	`active` integer DEFAULT true NOT NULL,
	`moderation_status` text DEFAULT 'approved' NOT NULL,
	`risk_level` text DEFAULT 'safe' NOT NULL,
	`risk_category` text DEFAULT '' NOT NULL,
	`risk_reason` text DEFAULT '' NOT NULL,
	`matched_terms` text DEFAULT '[]' NOT NULL,
	`scanned_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchant_applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_menu_products_merchant_local_unique` ON `merchant_menu_products` (`merchant_id`,`local_product_id`);--> statement-breakpoint
CREATE INDEX `merchant_menu_products_merchant_active_idx` ON `merchant_menu_products` (`merchant_id`,`active`,`category`);--> statement-breakpoint
CREATE INDEX `merchant_menu_products_moderation_idx` ON `merchant_menu_products` (`moderation_status`,`risk_level`,`updated_at`);--> statement-breakpoint
CREATE TABLE `product_moderation_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`product_id` text NOT NULL,
	`severity` text NOT NULL,
	`category` text NOT NULL,
	`reason` text NOT NULL,
	`matched_terms` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`reviewed_by` text,
	`review_note` text DEFAULT '' NOT NULL,
	`reviewed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchant_applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `merchant_menu_products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `product_moderation_alerts_status_created_idx` ON `product_moderation_alerts` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `product_moderation_alerts_merchant_status_idx` ON `product_moderation_alerts` (`merchant_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `product_moderation_alerts_product_status_idx` ON `product_moderation_alerts` (`product_id`,`status`);