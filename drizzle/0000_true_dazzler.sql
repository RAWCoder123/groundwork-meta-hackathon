CREATE TABLE `auto_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`status` text NOT NULL,
	`next_run_at` text NOT NULL,
	`lease_token` text,
	`lease_until` integer,
	`state_json` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auto_jobs_due` ON `auto_jobs` (`status`,`next_run_at`);--> statement-breakpoint
CREATE INDEX `auto_jobs_project` ON `auto_jobs` (`project_id`);--> statement-breakpoint
CREATE TABLE `auto_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`state_json` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auto_preferences_owner` ON `auto_preferences` (`owner_id`);--> statement-breakpoint
CREATE TABLE `auto_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`version` integer NOT NULL,
	`state_json` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auto_projects_owner` ON `auto_projects` (`owner_id`);--> statement-breakpoint
CREATE TABLE `auto_receipts` (
	`key` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`call_id` text NOT NULL,
	`state_json` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auto_receipts_job` ON `auto_receipts` (`job_id`);