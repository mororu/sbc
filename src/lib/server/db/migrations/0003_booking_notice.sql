-- Story 1.8: bookings store the notice at booking and the last-told notice (canonical notice JSON,
-- AD-24); the setting row gains the admin contact address.
ALTER TABLE `booking` ADD `notice_at_booking` text;--> statement-breakpoint
ALTER TABLE `booking` ADD `last_told_notice` text;--> statement-breakpoint
ALTER TABLE `setting` ADD `admin_contact` text;--> statement-breakpoint
-- Added by hand below the generated DDL: keep both statements if this migration is ever regenerated.
-- 1. The admin contact seed. The address is a placeholder until the admins confirm theirs before
--    launch (Story 5.5); Epic 3 makes it editable. Filling only an empty value keeps it idempotent.
UPDATE `setting` SET `admin_contact` = 'platzhalter@sauna-luegisee.ch'
WHERE `id` = 1 AND (`admin_contact` IS NULL OR trim(`admin_contact`) = '');--> statement-breakpoint
-- 2. The notice at booking is never updated after insert (AD-24). A row without one (development
--    data from before this migration) may still get one set.
CREATE TRIGGER `booking_notice_at_booking_immutable`
BEFORE UPDATE OF `notice_at_booking` ON `booking`
WHEN OLD.`notice_at_booking` IS NOT NULL
BEGIN
	SELECT RAISE(ABORT, 'notice_at_booking is immutable');
END;
