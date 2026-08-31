CREATE TABLE `menu_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `menu_categories_name_unique` ON `menu_categories` (`name`);--> statement-breakpoint
CREATE TABLE `menu_products` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`price_cents` integer NOT NULL,
	`category` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`image_key` text,
	`active` integer DEFAULT true NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `menu_products_active_category_idx` ON `menu_products` (`active`,`category`);--> statement-breakpoint
CREATE TABLE `restaurant_tables` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`token` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `restaurant_tables_token_unique` ON `restaurant_tables` (`token`);--> statement-breakpoint
CREATE INDEX `restaurant_tables_active_idx` ON `restaurant_tables` (`active`,`created_at`);--> statement-breakpoint
CREATE TABLE `table_order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`product_id` integer,
	`product_name` text NOT NULL,
	`price_cents` integer NOT NULL,
	`quantity` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `table_orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `table_order_items_order_idx` ON `table_order_items` (`order_id`);--> statement-breakpoint
CREATE TABLE `table_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_number` text NOT NULL,
	`table_id` integer NOT NULL,
	`client_request_id` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`total_cents` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`table_id`) REFERENCES `restaurant_tables`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `table_orders_number_unique` ON `table_orders` (`order_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `table_orders_client_request_unique` ON `table_orders` (`client_request_id`);--> statement-breakpoint
CREATE INDEX `table_orders_status_created_idx` ON `table_orders` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `table_orders_table_status_idx` ON `table_orders` (`table_id`,`status`);