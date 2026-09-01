ALTER TABLE `table_orders` ADD `session_id` text;--> statement-breakpoint
CREATE INDEX `table_orders_table_session_idx` ON `table_orders` (`table_id`,`session_id`,`created_at`);