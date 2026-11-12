-- Story 1.7: booking gains party size, locale, contact data, public id and submit token.
-- Edited by hand after generation: the copy below fills the new NOT NULL columns of rows that
-- predate this migration (development data only; nothing is live yet) with party size 1, locale
-- 'de', no contact data and random 128-bit hex ids. Keep this if the migration is regenerated.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_booking` (
	`id` integer PRIMARY KEY NOT NULL,
	`start_at` text NOT NULL,
	`duration_min` integer NOT NULL,
	`changeover_min` integer NOT NULL,
	`created_at` text NOT NULL,
	`season_id` integer NOT NULL,
	`deleted_at` text,
	`party_size` integer NOT NULL,
	`locale` text NOT NULL,
	`name` text,
	`email` text,
	`mobile` text,
	`public_id` text NOT NULL,
	`submit_token` text NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `season`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "booking_duration" CHECK("__new_booking"."duration_min" IN (60, 90, 120, 150, 180)),
	CONSTRAINT "booking_changeover" CHECK("__new_booking"."changeover_min" BETWEEN 0 AND 60),
	CONSTRAINT "booking_party_size" CHECK("__new_booking"."party_size" BETWEEN 1 AND 6),
	CONSTRAINT "booking_locale" CHECK("__new_booking"."locale" IN ('de', 'en')),
	CONSTRAINT "booking_instants" CHECK("__new_booking"."start_at" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z' AND "__new_booking"."created_at" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z' AND ("__new_booking"."deleted_at" IS NULL OR "__new_booking"."deleted_at" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'))
);
--> statement-breakpoint
INSERT INTO `__new_booking`("id", "start_at", "duration_min", "changeover_min", "created_at", "season_id", "deleted_at", "party_size", "locale", "name", "email", "mobile", "public_id", "submit_token") SELECT "id", "start_at", "duration_min", "changeover_min", "created_at", "season_id", "deleted_at", 1, 'de', NULL, NULL, NULL, lower(hex(randomblob(16))), lower(hex(randomblob(16))) FROM `booking`;--> statement-breakpoint
DROP TABLE `booking`;--> statement-breakpoint
ALTER TABLE `__new_booking` RENAME TO `booking`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `booking_start_at` ON `booking` (`start_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `booking_public_id` ON `booking` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `booking_submit_token` ON `booking` (`submit_token`);