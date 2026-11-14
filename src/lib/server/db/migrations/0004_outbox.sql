CREATE TABLE `outbox` (
	`id` integer PRIMARY KEY NOT NULL,
	`booking_id` integer NOT NULL,
	`kind` text NOT NULL,
	`state` text NOT NULL,
	`due_at` text NOT NULL,
	`claimed_at` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`snapshot_notice` text,
	`snapshot_keybox_code` text,
	`snapshot_locale` text,
	`snapshot_urgent` integer,
	`reason` text,
	`outcome_at` text,
	FOREIGN KEY (`booking_id`) REFERENCES `booking`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "outbox_kind" CHECK("outbox"."kind" IN ('confirmation', 'keybox', 'heat_change')),
	CONSTRAINT "outbox_state" CHECK("outbox"."state" IN ('pending', 'in_flight', 'accepted', 'refused', 'transient_failure', 'expired', 'cancelled')),
	CONSTRAINT "outbox_attempts" CHECK("outbox"."attempts" >= 0),
	CONSTRAINT "outbox_snapshot_locale" CHECK("outbox"."snapshot_locale" IS NULL OR "outbox"."snapshot_locale" IN ('de', 'en')),
	CONSTRAINT "outbox_snapshot_urgent" CHECK("outbox"."snapshot_urgent" IS NULL OR "outbox"."snapshot_urgent" IN (0, 1)),
	CONSTRAINT "outbox_in_flight_claimed" CHECK("outbox"."state" <> 'in_flight' OR "outbox"."claimed_at" IS NOT NULL),
	CONSTRAINT "outbox_instants" CHECK("outbox"."due_at" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z' AND ("outbox"."claimed_at" IS NULL OR "outbox"."claimed_at" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z') AND ("outbox"."outcome_at" IS NULL OR "outbox"."outcome_at" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'))
);
--> statement-breakpoint
CREATE INDEX `outbox_state_due_at` ON `outbox` (`state`,`due_at`);--> statement-breakpoint
CREATE INDEX `outbox_booking_id` ON `outbox` (`booking_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `outbox_one_confirmation` ON `outbox` (`booking_id`) WHERE "outbox"."kind" = 'confirmation';--> statement-breakpoint
CREATE TABLE `worker_heartbeat` (
	`id` integer PRIMARY KEY NOT NULL,
	`beat_at` text NOT NULL,
	CONSTRAINT "worker_heartbeat_single_row" CHECK("worker_heartbeat"."id" = 1),
	CONSTRAINT "worker_heartbeat_instant" CHECK("worker_heartbeat"."beat_at" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z')
);
