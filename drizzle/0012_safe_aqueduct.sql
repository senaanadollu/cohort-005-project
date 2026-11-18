CREATE TABLE `pending_notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`subject_id` integer NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text NOT NULL,
	`sent_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pending_notifications_idempotency_key_unique` ON `pending_notifications` (`idempotency_key`);