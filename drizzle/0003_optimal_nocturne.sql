ALTER TABLE `merchant_applications` ADD `username` text;--> statement-breakpoint
ALTER TABLE `merchant_applications` ADD `password_hash` text;--> statement-breakpoint
ALTER TABLE `merchant_applications` ADD `password_salt` text;--> statement-breakpoint
ALTER TABLE `merchant_applications` ADD `password_iterations` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_applications_username_unique` ON `merchant_applications` (`username`);