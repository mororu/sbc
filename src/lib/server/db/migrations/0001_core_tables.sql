CREATE TABLE `block` (
	`id` integer PRIMARY KEY NOT NULL,
	`start_at` text NOT NULL,
	`end_at` text NOT NULL,
	`reason` text NOT NULL,
	CONSTRAINT "block_reason" CHECK("block"."reason" IN ('cleaning', 'maintenance', 'private_use')),
	CONSTRAINT "block_instants" CHECK("block"."start_at" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z' AND "block"."end_at" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'),
	CONSTRAINT "block_range" CHECK("block"."start_at" < "block"."end_at")
);
--> statement-breakpoint
CREATE INDEX `block_start_at` ON `block` (`start_at`);--> statement-breakpoint
CREATE TABLE `booking` (
	`id` integer PRIMARY KEY NOT NULL,
	`start_at` text NOT NULL,
	`duration_min` integer NOT NULL,
	`changeover_min` integer NOT NULL,
	`created_at` text NOT NULL,
	`season_id` integer NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`season_id`) REFERENCES `season`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "booking_duration" CHECK("booking"."duration_min" IN (60, 90, 120, 150, 180)),
	CONSTRAINT "booking_changeover" CHECK("booking"."changeover_min" BETWEEN 0 AND 60),
	CONSTRAINT "booking_instants" CHECK("booking"."start_at" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z' AND "booking"."created_at" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z' AND ("booking"."deleted_at" IS NULL OR "booking"."deleted_at" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'))
);
--> statement-breakpoint
CREATE INDEX `booking_start_at` ON `booking` (`start_at`);--> statement-breakpoint
CREATE TABLE `season` (
	`id` integer PRIMARY KEY NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	CONSTRAINT "season_date_format" CHECK("season"."start_date" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]' AND "season"."end_date" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
	CONSTRAINT "season_dates" CHECK("season"."start_date" <= "season"."end_date")
);
--> statement-breakpoint
CREATE TABLE `setting` (
	`id` integer PRIMARY KEY NOT NULL,
	`changeover_min` integer NOT NULL,
	`preheat_min_min` integer NOT NULL,
	`preheat_max_min` integer NOT NULL,
	`horizon_days` integer NOT NULL,
	`open_minute` integer NOT NULL,
	`close_minute` integer NOT NULL,
	CONSTRAINT "setting_single_row" CHECK("setting"."id" = 1),
	CONSTRAINT "setting_changeover" CHECK("setting"."changeover_min" BETWEEN 0 AND 60),
	CONSTRAINT "setting_preheat" CHECK("setting"."preheat_min_min" BETWEEN 15 AND 90 AND "setting"."preheat_max_min" BETWEEN 15 AND 90 AND "setting"."preheat_min_min" <= "setting"."preheat_max_min"),
	CONSTRAINT "setting_horizon" CHECK("setting"."horizon_days" BETWEEN 1 AND 60),
	CONSTRAINT "setting_hours" CHECK("setting"."open_minute" >= 0 AND "setting"."open_minute" < "setting"."close_minute" AND "setting"."close_minute" <= 1440)
);
--> statement-breakpoint
-- Seeded defaults (Story 1.3), added by hand below the generated DDL: keep them if this migration
-- is ever regenerated. Operating hours and season dates are placeholders until the admins confirm
-- them (PRD OQ2). INSERT OR IGNORE keeps the seed idempotent.
INSERT OR IGNORE INTO `setting` (`id`, `changeover_min`, `preheat_min_min`, `preheat_max_min`, `horizon_days`, `open_minute`, `close_minute`)
VALUES (1, 15, 30, 40, 14, 600, 1320);
--> statement-breakpoint
INSERT OR IGNORE INTO `season` (`id`, `start_date`, `end_date`) VALUES (1, '2027-01-09', '2027-04-30');
