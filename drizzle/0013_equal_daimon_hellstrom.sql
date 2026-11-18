ALTER TABLE `pending_notifications` ADD `attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `pending_notifications` ADD `first_attempt_at` text;--> statement-breakpoint
ALTER TABLE `pending_notifications` ADD `next_attempt_at` text;--> statement-breakpoint
ALTER TABLE `pending_notifications` ADD `trigger` text;--> statement-breakpoint
ALTER TABLE `pending_notifications` ADD `failed_at` text;