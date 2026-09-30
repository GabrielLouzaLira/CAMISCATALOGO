CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`details` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_log_entity_idx` ON `audit_log` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_log_created_idx` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `order_terminal_claims` (
	`order_id` text PRIMARY KEY NOT NULL,
	`target_status` text NOT NULL,
	`claimed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "order_terminal_claims_status_valid" CHECK("order_terminal_claims"."target_status" IN ('confirmado', 'cancelado'))
);
--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`variant_id` integer NOT NULL,
	`order_id` text,
	`source_key` text NOT NULL,
	`reason` text NOT NULL,
	`actor` text NOT NULL,
	`stock_before` integer NOT NULL,
	`stock_after` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "stock_movements_before_nonnegative" CHECK("stock_movements"."stock_before" >= 0),
	CONSTRAINT "stock_movements_after_nonnegative" CHECK("stock_movements"."stock_after" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stock_movements_source_key_unique` ON `stock_movements` (`source_key`);--> statement-breakpoint
CREATE INDEX `stock_movements_variant_created_idx` ON `stock_movements` (`variant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `stock_movements_order_idx` ON `stock_movements` (`order_id`);--> statement-breakpoint
CREATE TABLE `store_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`whatsapp_number` text DEFAULT '' NOT NULL,
	`store_name` text DEFAULT 'Camisa 10' NOT NULL,
	`operational_text` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "store_settings_singleton" CHECK("store_settings"."id" = 1)
);
--> statement-breakpoint
INSERT INTO `store_settings` (`id`) VALUES (1)
ON CONFLICT(`id`) DO NOTHING;
