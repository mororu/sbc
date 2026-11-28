CREATE TABLE `admin_session` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	CONSTRAINT "admin_session_instants" CHECK("admin_session"."created_at" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z' AND "admin_session"."expires_at" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z')
);
--> statement-breakpoint
ALTER TABLE `booking` ADD `reply_done_at` text;--> statement-breakpoint
ALTER TABLE `setting` ADD `admin_password_hash` text;