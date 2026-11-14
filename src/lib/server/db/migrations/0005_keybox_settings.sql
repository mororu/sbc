ALTER TABLE `setting` ADD `keybox_code` text;--> statement-breakpoint
ALTER TABLE `setting` ADD `keybox_instructions_de` text;--> statement-breakpoint
ALTER TABLE `setting` ADD `keybox_instructions_en` text;--> statement-breakpoint
CREATE UNIQUE INDEX `outbox_one_keybox` ON `outbox` (`booking_id`) WHERE "outbox"."kind" = 'keybox';