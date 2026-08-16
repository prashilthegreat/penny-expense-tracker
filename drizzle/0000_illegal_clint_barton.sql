CREATE TABLE `expenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`merchant` text NOT NULL,
	`category` text NOT NULL,
	`amount` real NOT NULL,
	`expense_date` text NOT NULL,
	`note` text,
	`created_at` text NOT NULL
);
