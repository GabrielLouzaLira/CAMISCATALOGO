import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
};

export const categories = sqliteTable(
  "categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("categories_slug_unique").on(table.slug),
    index("categories_active_order_idx").on(table.active, table.sortOrder),
  ],
);

export const products = sqliteTable(
  "products",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    categoryId: integer("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull().default(""),
    basePrice: integer("base_price").notNull(),
    personalizationEnabled: integer("personalization_enabled", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    personalizationFee: integer("personalization_fee").notNull().default(0),
    featured: integer("featured", { mode: "boolean" }).notNull().default(false),
    status: text("status", {
      enum: ["draft", "published", "archived"],
    })
      .notNull()
      .default("draft"),
    team: text("team"),
    season: text("season"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("products_slug_unique").on(table.slug),
    index("products_status_category_idx").on(table.status, table.categoryId),
    check("products_base_price_nonnegative", sql`${table.basePrice} >= 0`),
    check(
      "products_personalization_fee_nonnegative",
      sql`${table.personalizationFee} >= 0`,
    ),
  ],
);

export const productVariants = sqliteTable(
  "product_variants",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    size: text("size").notNull(),
    color: text("color").notNull(),
    sku: text("sku").notNull(),
    stock: integer("stock").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("product_variants_sku_unique").on(table.sku),
    index("product_variants_product_idx").on(table.productId, table.active),
    check("product_variants_stock_nonnegative", sql`${table.stock} >= 0`),
  ],
);

export const productImages = sqliteTable(
  "product_images",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
    altText: text("alt_text").notNull().default(""),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("product_images_object_key_unique").on(table.objectKey),
    index("product_images_product_order_idx").on(
      table.productId,
      table.sortOrder,
    ),
  ],
);

export const promotions = sqliteTable(
  "promotions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Promoção"),
    promotionalPrice: integer("promotional_price").notNull(),
    startsAt: text("starts_at"),
    endsAt: text("ends_at"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("promotions_product_unique").on(table.productId),
    index("promotions_active_period_idx").on(
      table.active,
      table.startsAt,
      table.endsAt,
    ),
    check(
      "promotions_price_nonnegative",
      sql`${table.promotionalPrice} >= 0`,
    ),
  ],
);

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    customerCity: text("customer_city").notNull(),
    deliveryMethod: text("delivery_method").notNull(),
    notes: text("notes").notNull().default(""),
    status: text("status", {
      enum: ["aguardando_confirmacao", "confirmado", "cancelado"],
    })
      .notNull()
      .default("aguardando_confirmacao"),
    paymentStatus: text("payment_status").notNull().default("nao_iniciado"),
    subtotal: integer("subtotal").notNull(),
    total: integer("total").notNull(),
    inventoryDeductedAt: text("inventory_deducted_at"),
    ...timestamps,
  },
  (table) => [
    index("orders_status_created_idx").on(table.status, table.createdAt),
    check("orders_subtotal_nonnegative", sql`${table.subtotal} >= 0`),
    check("orders_total_nonnegative", sql`${table.total} >= 0`),
  ],
);

export const orderItems = sqliteTable(
  "order_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: integer("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    variantId: integer("variant_id").references(() => productVariants.id, {
      onDelete: "set null",
    }),
    productName: text("product_name").notNull(),
    size: text("size").notNull(),
    color: text("color").notNull(),
    sku: text("sku").notNull(),
    customName: text("custom_name").notNull().default(""),
    customNumber: text("custom_number").notNull().default(""),
    quantity: integer("quantity").notNull(),
    unitPrice: integer("unit_price").notNull(),
    lineTotal: integer("line_total").notNull(),
    ...timestamps,
  },
  (table) => [
    index("order_items_order_idx").on(table.orderId),
    check("order_items_quantity_positive", sql`${table.quantity} > 0`),
    check("order_items_unit_price_nonnegative", sql`${table.unitPrice} >= 0`),
    check("order_items_line_total_nonnegative", sql`${table.lineTotal} >= 0`),
  ],
);

export const orderInventoryReservations = sqliteTable(
  "order_inventory_reservations",
  {
    orderId: text("order_id")
      .primaryKey()
      .references(() => orders.id, { onDelete: "cascade" }),
    reservedAt: text("reserved_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    expiresAt: text("expires_at").notNull(),
    releasedAt: text("released_at"),
    releaseReason: text("release_reason"),
  },
  (table) => [
    index("order_inventory_reservations_active_expiry_idx").on(table.expiresAt),
  ],
);

export const orderInventoryDeductions = sqliteTable(
  "order_inventory_deductions",
  {
    orderId: text("order_id")
      .primaryKey()
      .references(() => orders.id, { onDelete: "cascade" }),
    deductedAt: text("deducted_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
);

export const orderTerminalClaims = sqliteTable(
  "order_terminal_claims",
  {
    orderId: text("order_id")
      .primaryKey()
      .references(() => orders.id, { onDelete: "cascade" }),
    targetStatus: text("target_status", {
      enum: ["confirmado", "cancelado"],
    }).notNull(),
    claimedAt: text("claimed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check(
      "order_terminal_claims_status_valid",
      sql`${table.targetStatus} IN ('confirmado', 'cancelado')`,
    ),
  ],
);

export const stockMovements = sqliteTable(
  "stock_movements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    variantId: integer("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    orderId: text("order_id").references(() => orders.id, {
      onDelete: "set null",
    }),
    sourceKey: text("source_key").notNull(),
    reason: text("reason").notNull(),
    actor: text("actor").notNull(),
    stockBefore: integer("stock_before").notNull(),
    stockAfter: integer("stock_after").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("stock_movements_source_key_unique").on(table.sourceKey),
    index("stock_movements_variant_created_idx").on(
      table.variantId,
      table.createdAt,
    ),
    index("stock_movements_order_idx").on(table.orderId),
    check("stock_movements_before_nonnegative", sql`${table.stockBefore} >= 0`),
    check("stock_movements_after_nonnegative", sql`${table.stockAfter} >= 0`),
  ],
);

export const storeSettings = sqliteTable(
  "store_settings",
  {
    id: integer("id").primaryKey().default(1),
    whatsappNumber: text("whatsapp_number").notNull().default(""),
    storeName: text("store_name").notNull().default("Camisa 10"),
    operationalText: text("operational_text").notNull().default(""),
    ...timestamps,
  },
  (table) => [
    check("store_settings_singleton", sql`${table.id} = 1`),
  ],
);

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    details: text("details").notNull().default("{}"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("audit_log_entity_idx").on(table.entityType, table.entityId),
    index("audit_log_created_idx").on(table.createdAt),
  ],
);
