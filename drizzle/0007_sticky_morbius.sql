ALTER TABLE `agents` ADD `external_id` text;--> statement-breakpoint
ALTER TABLE `agents` ADD `source` text DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE `agents` ADD `synced_at` text;--> statement-breakpoint
CREATE UNIQUE INDEX `agents_external_id_unique` ON `agents` (`external_id`);