import { env } from "cloudflare:workers";

type RuntimeBindings = {
  DB?: D1Database;
  PRODUCT_IMAGES?: R2Bucket;
  ADMIN_LOGIN?: string;
  ADMIN_PASSWORD?: string;
  ADMIN_SESSION_SECRET?: string;
  NEXT_PUBLIC_STORE_WHATSAPP?: string;
};

export function getRuntimeBindings(): RuntimeBindings {
  return env as unknown as RuntimeBindings;
}

export function getD1(): D1Database {
  const database = getRuntimeBindings().DB;
  if (!database) {
    throw new Error(
      "O binding D1 local `DB` não está disponível. Use os comandos documentados do painel independente.",
    );
  }
  return database;
}

export function getProductImagesBucket(): R2Bucket {
  const bucket = getRuntimeBindings().PRODUCT_IMAGES;
  if (!bucket) {
    throw new Error(
      "O binding R2 local `PRODUCT_IMAGES` não está disponível. Use os comandos documentados do painel independente.",
    );
  }
  return bucket;
}

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS categories_active_order_idx
    ON categories (active, sort_order)`,
  `CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    base_price INTEGER NOT NULL CHECK (base_price >= 0),
    personalization_enabled INTEGER NOT NULL DEFAULT 0,
    personalization_fee INTEGER NOT NULL DEFAULT 0 CHECK (personalization_fee >= 0),
    featured INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft'
      CHECK (status IN ('draft', 'published', 'archived')),
    team TEXT,
    season TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS products_status_category_idx
    ON products (status, category_id)`,
  `CREATE TABLE IF NOT EXISTS product_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    size TEXT NOT NULL,
    color TEXT NOT NULL,
    sku TEXT NOT NULL UNIQUE,
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS product_variants_product_idx
    ON product_variants (product_id, active)`,
  `CREATE TABLE IF NOT EXISTS product_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    object_key TEXT NOT NULL UNIQUE,
    alt_text TEXT NOT NULL DEFAULT '',
    content_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS product_images_product_order_idx
    ON product_images (product_id, sort_order)`,
  `CREATE TABLE IF NOT EXISTS promotions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Promoção',
    promotional_price INTEGER NOT NULL CHECK (promotional_price >= 0),
    starts_at TEXT,
    ends_at TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS promotions_active_period_idx
    ON promotions (active, starts_at, ends_at)`,
  `CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_city TEXT NOT NULL,
    delivery_method TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'aguardando_confirmacao'
      CHECK (status IN ('aguardando_confirmacao', 'confirmado', 'cancelado')),
    payment_status TEXT NOT NULL DEFAULT 'nao_iniciado',
    subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
    total INTEGER NOT NULL CHECK (total >= 0),
    inventory_deducted_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS orders_status_created_idx
    ON orders (status, created_at)`,
  `CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    variant_id INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    size TEXT NOT NULL,
    color TEXT NOT NULL,
    sku TEXT NOT NULL,
    custom_name TEXT NOT NULL DEFAULT '',
    custom_number TEXT NOT NULL DEFAULT '',
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
    line_total INTEGER NOT NULL CHECK (line_total >= 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items (order_id)`,
  `CREATE TABLE IF NOT EXISTS order_inventory_reservations (
    order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
    reserved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL,
    released_at TEXT,
    release_reason TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS order_inventory_reservations_active_expiry_idx
    ON order_inventory_reservations (expires_at)
    WHERE released_at IS NULL`,
  `CREATE TABLE IF NOT EXISTS order_inventory_deductions (
    order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
    deducted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS order_terminal_claims (
    order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
    target_status TEXT NOT NULL
      CHECK (target_status IN ('confirmado', 'cancelado')),
    claimed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    variant_id INTEGER NOT NULL
      REFERENCES product_variants(id) ON DELETE RESTRICT,
    order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
    source_key TEXT NOT NULL UNIQUE,
    reason TEXT NOT NULL,
    actor TEXT NOT NULL,
    stock_before INTEGER NOT NULL CHECK (stock_before >= 0),
    stock_after INTEGER NOT NULL CHECK (stock_after >= 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS stock_movements_variant_created_idx
    ON stock_movements (variant_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS stock_movements_order_idx
    ON stock_movements (order_id)`,
  `CREATE TABLE IF NOT EXISTS store_settings (
    id INTEGER PRIMARY KEY NOT NULL DEFAULT 1 CHECK (id = 1),
    whatsapp_number TEXT NOT NULL DEFAULT '',
    store_name TEXT NOT NULL DEFAULT 'Camisa 10',
    operational_text TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `INSERT INTO store_settings (id) VALUES (1)
    ON CONFLICT(id) DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX IF NOT EXISTS audit_log_entity_idx
    ON audit_log (entity_type, entity_id)`,
  `CREATE INDEX IF NOT EXISTS audit_log_created_idx
    ON audit_log (created_at)`,
] as const;

let initializedDatabase: D1Database | null = null;
let initialization: Promise<void> | null = null;

export async function ensureSchema(database = getD1()): Promise<void> {
  if (initializedDatabase === database && initialization) return initialization;
  initializedDatabase = database;
  initialization = database
    .batch(schemaStatements.map((statement) => database.prepare(statement)))
    .then(() => undefined)
    .catch((error) => {
      initializedDatabase = null;
      initialization = null;
      throw error;
    });
  return initialization;
}
