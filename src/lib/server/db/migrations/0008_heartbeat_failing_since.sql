PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_worker_heartbeat` (
	`id` integer PRIMARY KEY NOT NULL,
	`beat_at` text NOT NULL,
	`failing_since` text,
	CONSTRAINT "worker_heartbeat_single_row" CHECK("__new_worker_heartbeat"."id" = 1),
	CONSTRAINT "worker_heartbeat_instant" CHECK("__new_worker_heartbeat"."beat_at" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z'),
	CONSTRAINT "worker_heartbeat_failing_since" CHECK("__new_worker_heartbeat"."failing_since" IS NULL OR "__new_worker_heartbeat"."failing_since" GLOB '[0-9][0-9][0-9][0-9]-[01][0-9]-[0-3][0-9]T[0-2][0-9]:[0-5][0-9]:[0-5][0-9]Z')
);
--> statement-breakpoint
INSERT INTO `__new_worker_heartbeat`("id", "beat_at") SELECT "id", "beat_at" FROM `worker_heartbeat`;--> statement-breakpoint
DROP TABLE `worker_heartbeat`;--> statement-breakpoint
ALTER TABLE `__new_worker_heartbeat` RENAME TO `worker_heartbeat`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
