CREATE TABLE `analytics_booking` (
	`id` integer PRIMARY KEY NOT NULL,
	`booking_id` integer NOT NULL,
	`season_id` integer NOT NULL,
	`date` text NOT NULL,
	`hhmm` text NOT NULL,
	`weekday` integer NOT NULL,
	`iso_week` integer NOT NULL,
	`duration_min` integer NOT NULL,
	`party_size` integer NOT NULL,
	`heat` text NOT NULL,
	`changeover_min` integer NOT NULL,
	`start_kind` integer NOT NULL,
	`guest_key` text,
	FOREIGN KEY (`booking_id`) REFERENCES `booking`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`season_id`) REFERENCES `season`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "analytics_booking_date" CHECK("analytics_booking"."date" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
	CONSTRAINT "analytics_booking_hhmm" CHECK("analytics_booking"."hhmm" GLOB '[0-2][0-9]:[0-5][0-9]'),
	CONSTRAINT "analytics_booking_weekday" CHECK("analytics_booking"."weekday" BETWEEN 1 AND 7 AND "analytics_booking"."iso_week" BETWEEN 1 AND 53),
	CONSTRAINT "analytics_booking_heat" CHECK("analytics_booking"."heat" IN ('hot', 'cold')),
	CONSTRAINT "analytics_booking_start_kind" CHECK("analytics_booking"."start_kind" IN (1, 2, 3)),
	CONSTRAINT "analytics_booking_guest_key" CHECK("analytics_booking"."guest_key" IS NULL OR (length("analytics_booking"."guest_key") = 64 AND "analytics_booking"."guest_key" NOT GLOB '*[^0-9a-f]*'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `analytics_booking_booking_id` ON `analytics_booking` (`booking_id`);--> statement-breakpoint
CREATE INDEX `analytics_booking_season_id` ON `analytics_booking` (`season_id`);--> statement-breakpoint
CREATE TABLE `analytics_day` (
	`id` integer PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`season_id` integer NOT NULL,
	`open_minute` integer NOT NULL,
	`close_minute` integer NOT NULL,
	`blocks` text NOT NULL,
	`unbooked` text NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `season`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "analytics_day_date_format" CHECK("analytics_day"."date" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]'),
	CONSTRAINT "analytics_day_json" CHECK(json_valid("analytics_day"."blocks") AND json_valid("analytics_day"."unbooked"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `analytics_day_date` ON `analytics_day` (`date`);--> statement-breakpoint
CREATE INDEX `analytics_day_season_id` ON `analytics_day` (`season_id`);