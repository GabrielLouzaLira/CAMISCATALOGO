ALTER TABLE order_items ADD COLUMN returned_quantity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN restocked_quantity INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE order_returns (
  id TEXT PRIMARY KEY NOT NULL,
  order_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE order_return_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  return_id TEXT NOT NULL,
  order_item_id INTEGER NOT NULL,
  variant_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  restock_quantity INTEGER NOT NULL CHECK(restock_quantity >= 0 AND restock_quantity <= quantity),
  FOREIGN KEY (return_id) REFERENCES order_returns(id) ON DELETE CASCADE,
  FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE RESTRICT,
  FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX order_return_items_order_item_idx ON order_return_items(order_item_id);
