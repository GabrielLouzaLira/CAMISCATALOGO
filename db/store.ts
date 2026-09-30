import { calculateOrderTotal, canTransitionOrder } from "@/lib/order-domain";
import {
  aggregateOrderItems,
  quantityByVariant,
  type RequestedOrderItem,
} from "@/lib/order-input";
import { effectivePrice } from "@/lib/pricing";
import type {
  AdminData,
  Category,
  OrderStatus,
  Product,
  ProductImage,
  ProductStatus,
  ProductVariant,
  Promotion,
  StoreOrder,
  StoreSettings,
  StorefrontData,
} from "@/lib/store-types";
import {
  defaultStoreSettings,
  normalizeOperationalSettings,
  normalizeStoreSettingsRow,
} from "@/lib/store-settings";
import {
  normalizeSalesMonth,
  salesMonthRange,
  salesTodayRange,
  type SalesDateRange,
} from "@/lib/sales-period";
import { getD1, ensureSchema } from "./runtime";

type ProductRow = {
  id: number;
  category_id: number | null;
  category_name: string | null;
  name: string;
  slug: string;
  description: string;
  base_price: number;
  personalization_enabled: number;
  personalization_fee: number;
  featured: number;
  status: ProductStatus;
  team: string | null;
  season: string | null;
};

type VariantRow = {
  id: number;
  product_id: number;
  size: string;
  color: string;
  sku: string;
  stock: number;
  active: number;
};

type ImageRow = {
  id: number;
  product_id: number;
  alt_text: string;
  sort_order: number;
};

type PromotionRow = {
  id: number;
  product_id: number;
  name: string;
  promotional_price: number;
  starts_at: string | null;
  ends_at: string | null;
  active: number;
};

type OrderVariantRow = {
  variant_id: number;
  product_id: number;
  size: string;
  color: string;
  sku: string;
  stock: number;
  variant_active: number;
  product_name: string;
  base_price: number;
  personalization_enabled: number;
  personalization_fee: number;
  status: ProductStatus;
  promotional_price: number | null;
  promotion_active: number | null;
  starts_at: string | null;
  ends_at: string | null;
};

const RESERVATION_DURATION_MS = 60 * 60 * 1000;

async function all<T>(
  database: D1Database,
  sql: string,
  ...bindings: unknown[]
): Promise<T[]> {
  const result = await database.prepare(sql).bind(...bindings).all<T>();
  return result.results;
}

export const normalizeSettings = normalizeOperationalSettings;

export async function getStoreSettings(): Promise<StoreSettings> {
  const database = getD1();
  await ensureSchema(database);
  const row = await database.prepare("SELECT store_name, whatsapp_number, operational_text FROM store_settings WHERE id = 1")
    .first<{ store_name: string; whatsapp_number: string; operational_text: string }>();
  if (!row) return { ...defaultStoreSettings };
  return normalizeStoreSettingsRow({
    storeName: row.store_name,
    whatsappNumber: row.whatsapp_number,
    operationalText: row.operational_text,
  });
}

export async function saveStoreSettings(input: StoreSettings, actor: string): Promise<void> {
  const database = getD1();
  await ensureSchema(database);
  const operationalText = JSON.stringify({
    instagramUrl: input.instagramUrl,
    city: input.city,
    deliveryOptions: input.deliveryOptions,
    heroEyebrow: input.heroEyebrow,
    heroTitle: input.heroTitle,
    heroSubtitle: input.heroSubtitle,
  });
  await database.batch([
    database.prepare(`UPDATE store_settings SET store_name = ?, whatsapp_number = ?, operational_text = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`)
      .bind(input.storeName, input.whatsappNumber, operationalText),
    database.prepare(`INSERT INTO audit_log (actor, action, entity_type, entity_id, details) VALUES (?, 'update', 'store_settings', '1', ?)`)
      .bind(actor, operationalText),
  ]);
}

function mapCategory(row: {
  id: number;
  name: string;
  slug: string;
  sort_order: number;
  active: number;
}): Category {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    sortOrder: row.sort_order,
    active: Boolean(row.active),
  };
}

async function loadProducts(
  database: D1Database,
  publicOnly: boolean,
): Promise<Product[]> {
  const where = publicOnly ? "WHERE p.status = 'published'" : "";
  const productRows = await all<ProductRow>(
    database,
    `SELECT p.*, c.name AS category_name
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     ${where}
     ORDER BY p.featured DESC, p.updated_at DESC, p.id DESC`,
  );
  if (!productRows.length) return [];

  const variantRows = await all<VariantRow>(
    database,
    `SELECT * FROM product_variants
     ${publicOnly ? "WHERE active = 1" : ""}
     ORDER BY product_id, size, color, id`,
  );
  const imageRows = await all<ImageRow>(
    database,
    `SELECT id, product_id, alt_text, sort_order
     FROM product_images ORDER BY product_id, sort_order, id`,
  );
  const promotionRows = await all<PromotionRow>(
    database,
    "SELECT * FROM promotions ORDER BY id DESC",
  );

  const variantsByProduct = new Map<number, ProductVariant[]>();
  for (const row of variantRows) {
    const items = variantsByProduct.get(row.product_id) ?? [];
    items.push({
      id: row.id,
      productId: row.product_id,
      size: row.size,
      color: row.color,
      sku: row.sku,
      stock: row.stock,
      active: Boolean(row.active),
    });
    variantsByProduct.set(row.product_id, items);
  }

  const imagesByProduct = new Map<number, ProductImage[]>();
  for (const row of imageRows) {
    const items = imagesByProduct.get(row.product_id) ?? [];
    items.push({
      id: row.id,
      productId: row.product_id,
      url: `/api/images/${row.id}`,
      altText: row.alt_text,
      sortOrder: row.sort_order,
    });
    imagesByProduct.set(row.product_id, items);
  }

  const promotionsByProduct = new Map<number, Promotion>();
  for (const row of promotionRows) {
    if (promotionsByProduct.has(row.product_id)) continue;
    promotionsByProduct.set(row.product_id, {
      id: row.id,
      productId: row.product_id,
      name: row.name,
      promotionalPrice: row.promotional_price,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      active: Boolean(row.active),
    });
  }

  return productRows.map((row) => {
    const variants = variantsByProduct.get(row.id) ?? [];
    const promotion = promotionsByProduct.get(row.id) ?? null;
    return {
      id: row.id,
      categoryId: row.category_id,
      categoryName: row.category_name,
      name: row.name,
      slug: row.slug,
      description: row.description,
      basePrice: row.base_price,
      effectivePrice: effectivePrice(row.base_price, promotion),
      personalizationEnabled: Boolean(row.personalization_enabled),
      personalizationFee: row.personalization_fee,
      featured: Boolean(row.featured),
      status: row.status,
      team: row.team,
      season: row.season,
      variants,
      images: imagesByProduct.get(row.id) ?? [],
      promotion,
      totalStock: variants
        .filter((variant) => variant.active)
        .reduce((sum, variant) => sum + variant.stock, 0),
    };
  });
}

export async function getStorefrontData(): Promise<StorefrontData> {
  const database = getD1();
  await ensureSchema(database);
  await releaseExpiredReservations(database);
  const categoryRows = await all<{
    id: number;
    name: string;
    slug: string;
    sort_order: number;
    active: number;
  }>(
    database,
    `SELECT * FROM categories WHERE active = 1
     ORDER BY sort_order, name`,
  );
  return {
    categories: categoryRows.map(mapCategory),
    products: await loadProducts(database, true),
    settings: await getStoreSettings(),
  };
}

export async function getAdminData(): Promise<AdminData> {
  const database = getD1();
  await ensureSchema(database);
  await releaseExpiredReservations(database);
  const categoryRows = await all<{
    id: number;
    name: string;
    slug: string;
    sort_order: number;
    active: number;
  }>(database, "SELECT * FROM categories ORDER BY sort_order, name");
  const allProducts = await loadProducts(database, false);
  const orders = await getOrders(database);
  const pendingOrderCount = await database
    .prepare("SELECT COUNT(*) AS count FROM orders WHERE status = 'aguardando_confirmacao'")
    .first<{ count: number }>();
  const allCategories = categoryRows.map(mapCategory);
  const publicProducts = allProducts.filter(
    (product) => product.status === "published",
  );
  const activeVariants = allProducts
    .filter((product) => product.status !== "archived")
    .flatMap((product) => product.variants.filter((variant) => variant.active));
  return {
    categories: allCategories.filter((category) => category.active),
    products: publicProducts,
    allCategories,
    allProducts,
    settings: await getStoreSettings(),
    orders,
    metrics: {
      products: allProducts.filter((product) => product.status !== "archived")
        .length,
      pendingOrders: pendingOrderCount?.count ?? 0,
      soldOut: activeVariants.filter((variant) => variant.stock === 0).length,
      lowStock: activeVariants.filter(
        (variant) => variant.stock > 0 && variant.stock <= 3,
      ).length,
    },
  };
}

export async function saveCategory(input: {
  id?: number;
  name: string;
  slug: string;
  sortOrder: number;
  active: boolean;
}): Promise<void> {
  const database = getD1();
  await ensureSchema(database);
  if (input.id) {
    await database
      .prepare(
        `UPDATE categories
         SET name = ?, slug = ?, sort_order = ?, active = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(
        input.name,
        input.slug,
        input.sortOrder,
        Number(input.active),
        input.id,
      )
      .run();
    return;
  }
  await database
    .prepare(
      `INSERT INTO categories (name, slug, sort_order, active)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(input.name, input.slug, input.sortOrder, Number(input.active))
    .run();
}

export async function saveProduct(input: {
  id?: number;
  categoryId: number | null;
  name: string;
  slug: string;
  description: string;
  basePrice: number;
  personalizationEnabled: boolean;
  personalizationFee: number;
  featured: boolean;
  status: ProductStatus;
  team: string | null;
  season: string | null;
  variants: Array<{
    id?: number;
    expectedStock?: number;
    size: string;
    color: string;
    sku: string;
    stock: number;
    active: boolean;
  }>;
  actor: string;
}): Promise<number> {
  const database = getD1();
  await ensureSchema(database);
  if (!input.id) {
    if (input.variants.some((variant) => variant.id !== undefined)) {
      throw new Error("Um produto novo não pode reutilizar variações.");
    }
    const statements = [
      database
        .prepare(
          `INSERT INTO products (
            category_id, name, slug, description, base_price,
            personalization_enabled, personalization_fee, featured, status,
            team, season
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          input.categoryId,
          input.name,
          input.slug,
          input.description,
          input.basePrice,
          Number(input.personalizationEnabled),
          input.personalizationFee,
          Number(input.featured),
          input.status,
          input.team,
          input.season,
        ),
      ...input.variants.flatMap((variant) => {
        const sourceKey = `product-create:${crypto.randomUUID()}`;
        return [
          database
            .prepare(
              `INSERT INTO product_variants
               (product_id, size, color, sku, stock, active)
               SELECT id, ?, ?, ?, ?, ? FROM products WHERE slug = ?`,
            )
            .bind(
              variant.size,
              variant.color,
              variant.sku,
              variant.stock,
              Number(variant.active),
              input.slug,
            ),
          database
            .prepare(
              `INSERT INTO stock_movements (
                variant_id, source_key, reason, actor, stock_before, stock_after
              )
              SELECT id, ?, 'product_create', ?, 0, stock
              FROM product_variants WHERE sku = ?`,
            )
            .bind(sourceKey, input.actor, variant.sku),
        ];
      }),
      database
        .prepare(
          `INSERT INTO audit_log (
            actor, action, entity_type, entity_id, details
          )
          SELECT ?, 'create', 'product', CAST(id AS TEXT), ?
          FROM products WHERE slug = ?`,
        )
        .bind(input.actor, JSON.stringify({ slug: input.slug }), input.slug),
    ];
    await database.batch(statements);
    const created = await database
      .prepare("SELECT id FROM products WHERE slug = ?")
      .bind(input.slug)
      .first<{ id: number }>();
    if (!created) throw new Error("Não foi possível criar o produto.");
    return created.id;
  }

  const productId = input.id;
  const product = await database
    .prepare("SELECT id FROM products WHERE id = ?")
    .bind(productId)
    .first<{ id: number }>();
  if (!product) throw new Error("Produto não encontrado.");
  const existing = await all<VariantRow>(
    database,
    "SELECT * FROM product_variants WHERE product_id = ? ORDER BY id",
    productId,
  );
  const existingById = new Map(existing.map((variant) => [variant.id, variant]));
  const requestedIds = new Set<number>();
  for (const variant of input.variants) {
    if (variant.id === undefined) continue;
    if (requestedIds.has(variant.id)) {
      throw new Error("A lista contém variações repetidas.");
    }
    requestedIds.add(variant.id);
    if (!existingById.has(variant.id)) {
      throw new Error("Uma variação não pertence a este produto.");
    }
    if (variant.expectedStock === undefined) {
      throw new Error("O estoque original da variação é obrigatório.");
    }
  }

  const statements: D1PreparedStatement[] = [
    database
      .prepare(
        `UPDATE products SET category_id = ?, name = ?, slug = ?,
         description = ?, base_price = ?, personalization_enabled = ?,
         personalization_fee = ?, featured = ?, status = ?, team = ?,
         season = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      )
      .bind(
        input.categoryId,
        input.name,
        input.slug,
        input.description,
        input.basePrice,
        Number(input.personalizationEnabled),
        input.personalizationFee,
        Number(input.featured),
        input.status,
        input.team,
        input.season,
        productId,
      ),
  ];

  for (const variant of input.variants) {
    if (variant.id === undefined) {
      statements.push(
        database
          .prepare(
            `INSERT INTO product_variants
             (product_id, size, color, sku, stock, active)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            productId,
            variant.size,
            variant.color,
            variant.sku,
            variant.stock,
            Number(variant.active),
          ),
        database
          .prepare(
            `INSERT INTO stock_movements (
              variant_id, source_key, reason, actor, stock_before, stock_after
            )
            SELECT id, ?, 'variant_create', ?, 0, stock
            FROM product_variants WHERE sku = ?`,
          )
          .bind(
            `product-edit:${productId}:${crypto.randomUUID()}`,
            input.actor,
            variant.sku,
          ),
      );
      continue;
    }
    const before = existingById.get(variant.id);
    if (!before) throw new Error("Variação inválida.");
    statements.push(
      database
        .prepare(
          `UPDATE product_variants SET size = ?, color = ?, sku = ?,
           stock = CASE WHEN stock = ? THEN ? ELSE -1 END,
           active = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND product_id = ?`,
        )
        .bind(
          variant.size,
          variant.color,
          variant.sku,
          variant.expectedStock,
          variant.stock,
          Number(variant.active),
          variant.id,
          productId,
        ),
    );
    if (before.stock !== variant.stock) {
      statements.push(
        database
          .prepare(
            `INSERT INTO stock_movements (
              variant_id, source_key, reason, actor, stock_before, stock_after
            ) VALUES (?, ?, 'admin_adjustment', ?, ?, ?)`,
          )
          .bind(
            variant.id,
            `product-edit:${productId}:${variant.id}:${crypto.randomUUID()}`,
            input.actor,
            variant.expectedStock,
            variant.stock,
          ),
      );
    }
  }

  for (const variant of existing) {
    if (requestedIds.has(variant.id)) continue;
    statements.push(
      database
        .prepare(
          `UPDATE product_variants SET active = 0,
           updated_at = CURRENT_TIMESTAMP WHERE id = ? AND product_id = ?`,
        )
        .bind(variant.id, productId),
    );
  }
  statements.push(
    database
      .prepare(
        `INSERT INTO audit_log (
          actor, action, entity_type, entity_id, details
        ) VALUES (?, 'update', 'product', ?, ?)`,
      )
      .bind(
        input.actor,
        String(productId),
        JSON.stringify({ slug: input.slug, variantCount: input.variants.length }),
      ),
  );
  try {
    await database.batch(statements);
  } catch (error) {
    const current = await all<{ id: number; stock: number }>(
      database,
      "SELECT id, stock FROM product_variants WHERE product_id = ?",
      productId,
    );
    const currentById = new Map(current.map((row) => [row.id, row.stock]));
    const conflict = input.variants.find(
      (variant) =>
        variant.id !== undefined &&
        currentById.get(variant.id) !== variant.expectedStock,
    );
    if (conflict) {
      throw new Error(
        `O estoque do SKU ${conflict.sku} mudou enquanto você editava. Recarregue o produto e tente novamente.`,
      );
    }
    throw error;
  }
  return productId;
}

export async function savePromotion(input: {
  productId: number;
  name: string;
  promotionalPrice: number;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
}): Promise<void> {
  const database = getD1();
  await ensureSchema(database);
  await database
    .prepare(
      `INSERT INTO promotions
       (product_id, name, promotional_price, starts_at, ends_at, active)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(product_id) DO UPDATE SET
         name = excluded.name,
         promotional_price = excluded.promotional_price,
         starts_at = excluded.starts_at,
         ends_at = excluded.ends_at,
         active = excluded.active,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      input.productId,
      input.name,
      input.promotionalPrice,
      input.startsAt,
      input.endsAt,
      Number(input.active),
    )
    .run();
}

export async function addProductImage(input: {
  productId: number;
  objectKey: string;
  altText: string;
  contentType: string;
  sizeBytes: number;
}): Promise<number> {
  const database = getD1();
  await ensureSchema(database);
  const order = await database
    .prepare(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM product_images WHERE product_id = ?",
    )
    .bind(input.productId)
    .first<{ next_order: number }>();
  const row = await database
    .prepare(
      `INSERT INTO product_images
       (product_id, object_key, alt_text, content_type, size_bytes, sort_order)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(
      input.productId,
      input.objectKey,
      input.altText,
      input.contentType,
      input.sizeBytes,
      order?.next_order ?? 0,
    )
    .first<{ id: number }>();
  if (!row) throw new Error("Não foi possível salvar a imagem.");
  return row.id;
}

export async function getProductImage(
  imageId: number,
): Promise<{ objectKey: string; contentType: string } | null> {
  const database = getD1();
  await ensureSchema(database);
  const row = await database
    .prepare(
      "SELECT object_key, content_type FROM product_images WHERE id = ?",
    )
    .bind(imageId)
    .first<{ object_key: string; content_type: string }>();
  return row
    ? { objectKey: row.object_key, contentType: row.content_type }
    : null;
}

export async function removeProductImage(
  imageId: number,
): Promise<{ objectKey: string } | null> {
  const database = getD1();
  await ensureSchema(database);
  const row = await database
    .prepare("SELECT object_key FROM product_images WHERE id = ?")
    .bind(imageId)
    .first<{ object_key: string }>();
  if (!row) return null;
  await database
    .prepare("DELETE FROM product_images WHERE id = ?")
    .bind(imageId)
    .run();
  return { objectKey: row.object_key };
}

export async function reorderProductImages(
  productId: number,
  imageIds: number[],
): Promise<void> {
  const database = getD1();
  await ensureSchema(database);
  const current = await all<{ id: number }>(
    database,
    "SELECT id FROM product_images WHERE product_id = ? ORDER BY sort_order, id",
    productId,
  );
  const currentIds = current.map((row) => row.id).sort((a, b) => a - b);
  const requestedIds = [...imageIds].sort((a, b) => a - b);
  if (
    currentIds.length !== requestedIds.length ||
    currentIds.some((id, index) => id !== requestedIds[index])
  ) {
    throw new Error("A ordem enviada não corresponde às imagens do produto.");
  }
  await database.batch(
    imageIds.map((imageId, sortOrder) =>
      database
        .prepare(
          `UPDATE product_images SET sort_order = ?,
           updated_at = CURRENT_TIMESTAMP WHERE id = ? AND product_id = ?`,
        )
        .bind(sortOrder, imageId, productId),
    ),
  );
}

type OrderPageInput = {
  search?: string;
  status?: OrderStatus;
  offset?: number;
  limit?: number;
  confirmedFrom?: string;
  confirmedTo?: string;
  orderByConfirmation?: boolean;
};

type OrderPage = { orders: StoreOrder[]; hasMore: boolean };

function mapOrders(
  orderRows: Array<{
    id: string; customer_name: string; customer_phone: string; customer_city: string;
    delivery_method: string; notes: string; status: OrderStatus; payment_status: string;
    subtotal: number; total: number; inventory_deducted_at: string | null;
    reservation_expires_at: string | null; created_at: string;
  }>,
  itemRows: Array<{
    id: number; order_id: string; product_name: string; size: string; color: string;
    sku: string; custom_name: string; custom_number: string; quantity: number;
    returned_quantity: number; restocked_quantity: number;
    unit_price: number; line_total: number;
  }>,
): StoreOrder[] {
  return orderRows.map((row) => ({
    id: row.id, customerName: row.customer_name, customerPhone: row.customer_phone,
    customerCity: row.customer_city, deliveryMethod: row.delivery_method, notes: row.notes,
    status: row.status, paymentStatus: row.payment_status, subtotal: row.subtotal,
    total: row.total, inventoryDeductedAt: row.inventory_deducted_at,
    reservationExpiresAt: row.reservation_expires_at, createdAt: row.created_at,
    items: itemRows.filter((item) => item.order_id === row.id).map((item) => ({
      id: item.id, productName: item.product_name, size: item.size, color: item.color,
      sku: item.sku, customName: item.custom_name, customNumber: item.custom_number,
      quantity: item.quantity, returnedQuantity: item.returned_quantity ?? 0,
      restockedQuantity: item.restocked_quantity ?? 0, unitPrice: item.unit_price, lineTotal: item.line_total,
    })),
  }));
}

async function queryOrders(
  database: D1Database,
  input: OrderPageInput,
): Promise<OrderPage> {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const offset = Math.max(input.offset ?? 0, 0);
  const clauses: string[] = [];
  const bindings: unknown[] = [];
  if (input.status) {
    clauses.push("status = ?");
    bindings.push(input.status);
  }
  if (input.confirmedFrom && input.confirmedTo) {
    clauses.push(
      "datetime(inventory_deducted_at) >= datetime(?) AND datetime(inventory_deducted_at) < datetime(?)",
    );
    bindings.push(input.confirmedFrom, input.confirmedTo);
  }
  const search = input.search?.trim().slice(0, 120) ?? "";
  if (search) {
    const phone = search.replace(/\D/g, "");
    clauses.push(`(
      lower(customer_name) LIKE lower(?) OR lower(id) LIKE lower(?) OR
      replace(replace(replace(replace(customer_phone, ' ', ''), '-', ''), '(', ''), ')', '') LIKE ?
    )`);
    bindings.push(`%${search}%`, `%${search}%`, `%${phone || search}%`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const orderRows = await all<{
    id: string;
    customer_name: string;
    customer_phone: string;
    customer_city: string;
    delivery_method: string;
    notes: string;
    status: OrderStatus;
    payment_status: string;
    subtotal: number;
    total: number;
    inventory_deducted_at: string | null;
    reservation_expires_at: string | null;
    created_at: string;
  }>(
    database,
    `SELECT o.*, r.expires_at AS reservation_expires_at
     FROM orders o
     LEFT JOIN order_inventory_reservations r
       ON r.order_id = o.id AND r.released_at IS NULL
     ${where} ORDER BY ${
      input.orderByConfirmation
        ? "datetime(o.inventory_deducted_at) DESC"
        : "o.created_at DESC"
    } LIMIT ? OFFSET ?`,
    ...bindings,
    limit + 1,
    offset,
  );
  const hasMore = orderRows.length > limit;
  const pageRows = orderRows.slice(0, limit);
  if (!pageRows.length) return { orders: [], hasMore: false };
  const placeholders = pageRows.map(() => "?").join(", ");
  const itemRows = await all<{
    id: number;
    order_id: string;
    product_name: string;
    size: string;
    color: string;
    sku: string;
    custom_name: string;
    custom_number: string;
    quantity: number;
    returned_quantity: number;
    restocked_quantity: number;
    unit_price: number;
    line_total: number;
  }>(database, `SELECT * FROM order_items WHERE order_id IN (${placeholders}) ORDER BY id`, ...pageRows.map((row) => row.id));
  return { orders: mapOrders(pageRows, itemRows), hasMore };
}

async function getOrders(database: D1Database): Promise<StoreOrder[]> {
  return (await queryOrders(database, { limit: 200 })).orders;
}

export async function getOrdersPage(input: OrderPageInput): Promise<OrderPage> {
  const database = getD1();
  await ensureSchema(database);
  await releaseExpiredReservations(database);
  return queryOrders(database, input);
}

type SalesTotals = { pieces: number; total: number };

async function getNetSalesTotals(
  database: D1Database,
  range: SalesDateRange,
): Promise<SalesTotals> {
  const [sales, returns] = await Promise.all([
    database
      .prepare(
        `SELECT
           COALESCE(SUM(oi.quantity), 0) AS pieces,
           COALESCE(SUM(oi.line_total), 0) AS total
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         WHERE o.status = 'confirmado'
           AND datetime(o.inventory_deducted_at) >= datetime(?)
           AND datetime(o.inventory_deducted_at) < datetime(?)`,
      )
      .bind(range.start, range.end)
      .first<{ pieces: number; total: number }>(),
    database
      .prepare(
        `SELECT
           COALESCE(SUM(ri.quantity), 0) AS pieces,
           COALESCE(SUM(ri.quantity * oi.unit_price), 0) AS total
         FROM order_returns r
         JOIN order_return_items ri ON ri.return_id = r.id
         JOIN order_items oi ON oi.id = ri.order_item_id
         WHERE datetime(r.created_at) >= datetime(?)
           AND datetime(r.created_at) < datetime(?)`,
      )
      .bind(range.start, range.end)
      .first<{ pieces: number; total: number }>(),
  ]);
  return {
    pieces: (sales?.pieces ?? 0) - (returns?.pieces ?? 0),
    total: (sales?.total ?? 0) - (returns?.total ?? 0),
  };
}

export async function getSalesData(requestedMonth?: string | null): Promise<{
  month: string;
  currentMonth: string;
  today: SalesTotals;
  monthSummary: SalesTotals;
  orders: StoreOrder[];
  hasMore: boolean;
}> {
  const database = getD1();
  await ensureSchema(database);
  await releaseExpiredReservations(database);
  const currentMonth = normalizeSalesMonth(null);
  const month = normalizeSalesMonth(requestedMonth);
  const monthRange = salesMonthRange(month);
  const [today, monthSummary, history] = await Promise.all([
    getNetSalesTotals(database, salesTodayRange()),
    getNetSalesTotals(database, monthRange),
    queryOrders(database, {
      status: "confirmado",
      confirmedFrom: monthRange.start,
      confirmedTo: monthRange.end,
      orderByConfirmation: true,
      limit: 50,
    }),
  ]);
  return {
    month,
    currentMonth,
    today,
    monthSummary,
    orders: history.orders,
    hasMore: history.hasMore,
  };
}

async function expireOrderReservation(
  database: D1Database,
  orderId: string,
  now: string,
): Promise<boolean> {
  const reservation = await database
    .prepare(
      `SELECT r.expires_at, o.status
       FROM order_inventory_reservations r
       JOIN orders o ON o.id = r.order_id
       WHERE r.order_id = ? AND r.released_at IS NULL`,
    )
    .bind(orderId)
    .first<{ expires_at: string; status: OrderStatus }>();
  if (
    !reservation ||
    reservation.status !== "aguardando_confirmacao" ||
    new Date(reservation.expires_at).getTime() > new Date(now).getTime()
  ) {
    return false;
  }

  const items = await all<{ variant_id: number; quantity: number }>(
    database,
    `SELECT variant_id, SUM(quantity) AS quantity FROM order_items
     WHERE order_id = ? AND variant_id IS NOT NULL
     GROUP BY variant_id`,
    orderId,
  );
  const statements: D1PreparedStatement[] = [
    database
      .prepare(
        `INSERT INTO order_terminal_claims
         (order_id, target_status, claimed_at) VALUES (?, 'cancelado', ?)`,
      )
      .bind(orderId, now),
  ];
  for (const item of items) {
    statements.push(
      database
        .prepare(
          `INSERT INTO stock_movements (
            variant_id, order_id, source_key, reason, actor,
            stock_before, stock_after
          )
          SELECT id, ?, ?, 'order_reservation_expired', 'system', stock, stock + ?
          FROM product_variants WHERE id = ?`,
        )
        .bind(
          orderId,
          `order:${orderId}:variant:${item.variant_id}:reservation-expired`,
          item.quantity,
          item.variant_id,
        ),
      database
        .prepare(
          `UPDATE product_variants
           SET stock = stock + ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        )
        .bind(item.quantity, item.variant_id),
    );
  }
  statements.push(
    database
      .prepare(
        `UPDATE order_inventory_reservations
         SET released_at = ?, release_reason = 'expired'
         WHERE order_id = ? AND released_at IS NULL`,
      )
      .bind(now, orderId),
    database
      .prepare(
        `UPDATE orders SET status = 'cancelado', updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'aguardando_confirmacao'`,
      )
      .bind(orderId),
    database
      .prepare(
        `INSERT INTO audit_log (actor, action, entity_type, entity_id, details)
         VALUES ('system', 'order_reservation_expired', 'order', ?, ?)` ,
      )
      .bind(orderId, JSON.stringify({ expiresAt: reservation.expires_at })),
  );
  try {
    await database.batch(statements);
    return true;
  } catch (error) {
    const refreshed = await database
      .prepare("SELECT status FROM orders WHERE id = ?")
      .bind(orderId)
      .first<{ status: OrderStatus }>();
    if (refreshed?.status === "cancelado") return true;
    throw error;
  }
}

async function releaseExpiredReservations(database: D1Database): Promise<void> {
  const now = new Date().toISOString();
  const rows = await all<{ order_id: string }>(
    database,
    `SELECT r.order_id
     FROM order_inventory_reservations r
     JOIN orders o ON o.id = r.order_id
     WHERE r.released_at IS NULL
       AND o.status = 'aguardando_confirmacao'
       AND datetime(r.expires_at) <= datetime(?)`,
    now,
  );
  for (const row of rows) {
    await expireOrderReservation(database, row.order_id, now);
  }
}

export async function createOrder(input: {
  customerName: string;
  customerPhone: string;
  customerCity: string;
  deliveryMethod: string;
  notes: string;
  items: RequestedOrderItem[];
  actor?: string;
}): Promise<StoreOrder> {
  const database = getD1();
  await ensureSchema(database);
  await releaseExpiredReservations(database);
  const requestedItems = aggregateOrderItems(input.items);
  const quantities = quantityByVariant(requestedItems);
  const variants = new Map<number, OrderVariantRow>();
  for (const [variantId, requestedQuantity] of quantities) {
    if (requestedQuantity > 100) {
      throw new Error("A quantidade total de uma variação é inválida.");
    }
    const row = await database
      .prepare(
        `SELECT v.id AS variant_id, v.product_id, v.size, v.color, v.sku,
          v.stock, v.active AS variant_active, p.name AS product_name,
          p.base_price, p.personalization_enabled, p.personalization_fee,
          p.status, pr.promotional_price, pr.active AS promotion_active,
          pr.starts_at, pr.ends_at
         FROM product_variants v
         JOIN products p ON p.id = v.product_id
         LEFT JOIN promotions pr ON pr.product_id = p.id
         WHERE v.id = ?`,
      )
      .bind(variantId)
      .first<OrderVariantRow>();
    if (!row || row.status !== "published" || !row.variant_active) {
      throw new Error("Um dos produtos não está mais disponível.");
    }
    if (requestedQuantity > row.stock) {
      throw new Error(
        `Estoque insuficiente para ${row.product_name} (${row.size}/${row.color}).`,
      );
    }
    variants.set(variantId, row);
  }

  const snapshotItems = [];
  for (const requested of requestedItems) {
    const row = variants.get(requested.variantId);
    if (!row) throw new Error("Uma variação do pedido é inválida.");
    const customized = Boolean(requested.customName || requested.customNumber);
    if (customized && !row.personalization_enabled) {
      throw new Error(`${row.product_name} não aceita personalização.`);
    }
    const promotion =
      row.promotional_price === null
        ? null
        : {
            promotionalPrice: row.promotional_price,
            active: Boolean(row.promotion_active),
            startsAt: row.starts_at,
            endsAt: row.ends_at,
          };
    const unitPrice =
      effectivePrice(row.base_price, promotion) +
      (customized ? row.personalization_fee : 0);
    snapshotItems.push({
      productId: row.product_id,
      variantId: row.variant_id,
      productName: row.product_name,
      size: row.size,
      color: row.color,
      sku: row.sku,
      customName: requested.customName,
      customNumber: requested.customNumber,
      quantity: requested.quantity,
      unitPrice,
      lineTotal: unitPrice * requested.quantity,
    });
  }

  const total = calculateOrderTotal(snapshotItems);
  const date = new Date();
  const reservedAt = date.toISOString();
  const reservationExpiresAt = new Date(
    date.getTime() + RESERVATION_DURATION_MS,
  ).toISOString();
  const datePart = date.toISOString().slice(0, 10).replaceAll("-", "");
  const id = `C10-${datePart}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const statements = [
    database
      .prepare(
        `INSERT INTO orders (
          id, customer_name, customer_phone, customer_city, delivery_method,
          notes, status, subtotal, total
        ) VALUES (?, ?, ?, ?, ?, ?, 'aguardando_confirmacao', ?, ?)`,
      )
      .bind(
        id,
        input.customerName,
        input.customerPhone,
        input.customerCity,
        input.deliveryMethod,
        input.notes,
        total,
        total,
      ),
    ...snapshotItems.map((item) =>
      database
        .prepare(
          `INSERT INTO order_items (
            order_id, product_id, variant_id, product_name, size, color, sku,
            custom_name, custom_number, quantity, unit_price, line_total
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          item.productId,
          item.variantId,
          item.productName,
          item.size,
          item.color,
          item.sku,
          item.customName,
          item.customNumber,
          item.quantity,
          item.unitPrice,
          item.lineTotal,
        ),
    ),
    database
      .prepare(
        `INSERT INTO order_inventory_reservations (
          order_id, reserved_at, expires_at
        ) VALUES (?, ?, ?)`,
      )
      .bind(id, reservedAt, reservationExpiresAt),
    ...Array.from(quantities.entries()).flatMap(([variantId, quantity]) => [
      database
        .prepare(
          `INSERT INTO stock_movements (
            variant_id, order_id, source_key, reason, actor,
            stock_before, stock_after
          )
          SELECT id, ?, ?, 'order_reservation', ?, stock, stock - ?
          FROM product_variants WHERE id = ?`,
        )
        .bind(
          id,
          `order:${id}:variant:${variantId}:reservation`,
          input.actor ?? "customer_order",
          quantity,
          variantId,
        ),
      database
        .prepare(
          `UPDATE product_variants
           SET stock = stock - ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        )
        .bind(quantity, variantId),
    ]),
  ];
  try {
    await database.batch(statements);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("CHECK constraint")) {
      throw new Error("Estoque insuficiente para finalizar este pedido.");
    }
    throw error;
  }
  return {
    id,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    customerCity: input.customerCity,
    deliveryMethod: input.deliveryMethod,
    notes: input.notes,
    status: "aguardando_confirmacao",
    paymentStatus: "nao_iniciado",
    subtotal: total,
    total,
    inventoryDeductedAt: null,
    reservationExpiresAt,
    createdAt: date.toISOString(),
    items: snapshotItems.map((item, index) => ({
      id: index + 1,
      ...item,
      returnedQuantity: 0,
      restockedQuantity: 0,
    })),
  };
}

export async function transitionOrder(
  orderId: string,
  nextStatus: OrderStatus,
  actor: string,
): Promise<{ status: OrderStatus; inventoryDeducted: boolean }> {
  const database = getD1();
  await ensureSchema(database);
  await releaseExpiredReservations(database);
  const order = await database
    .prepare(
      "SELECT status, inventory_deducted_at FROM orders WHERE id = ?",
    )
    .bind(orderId)
    .first<{ status: OrderStatus; inventory_deducted_at: string | null }>();
  if (!order) throw new Error("Pedido não encontrado.");
  if (order.status === nextStatus) {
    return {
      status: order.status,
      inventoryDeducted: Boolean(order.inventory_deducted_at),
    };
  }
  if (!canTransitionOrder(order.status, nextStatus)) {
    throw new Error("Essa mudança de status não é permitida.");
  }

  const reservation = await database
    .prepare(
      `SELECT released_at FROM order_inventory_reservations WHERE order_id = ?`,
    )
    .bind(orderId)
    .first<{ released_at: string | null }>();
  const hasActiveReservation = Boolean(reservation && !reservation.released_at);

  const items = await all<{ variant_id: number; quantity: number }>(
    database,
    `SELECT variant_id, SUM(quantity) AS quantity FROM order_items
     WHERE order_id = ? AND variant_id IS NOT NULL
     GROUP BY variant_id`,
    orderId,
  );
  if (nextStatus === "confirmado" && !items.length) {
    throw new Error("O pedido não possui itens válidos.");
  }
  const deductedAt = new Date().toISOString();
  try {
    const statements: D1PreparedStatement[] = [
      database
        .prepare(
          `INSERT INTO order_terminal_claims
           (order_id, target_status, claimed_at) VALUES (?, ?, ?)`,
        )
        .bind(orderId, nextStatus, deductedAt),
    ];
    if (nextStatus === "confirmado") {
      statements.push(
        database
          .prepare(
            `INSERT INTO order_inventory_deductions (order_id, deducted_at)
             VALUES (?, ?)`,
          )
          .bind(orderId, deductedAt),
      );
      if (hasActiveReservation) {
        statements.push(
          database
            .prepare(
              `UPDATE order_inventory_reservations
               SET released_at = ?, release_reason = 'confirmed'
               WHERE order_id = ? AND released_at IS NULL`,
            )
            .bind(deductedAt, orderId),
        );
      } else {
        for (const item of items) {
          statements.push(
            database
              .prepare(
                `INSERT INTO stock_movements (
                  variant_id, order_id, source_key, reason, actor,
                  stock_before, stock_after
                )
                SELECT id, ?, ?, 'order_confirmation', ?, stock, stock - ?
                FROM product_variants WHERE id = ?`,
              )
              .bind(
                orderId,
                `order:${orderId}:variant:${item.variant_id}`,
                actor,
                item.quantity,
                item.variant_id,
              ),
            database
              .prepare(
                `UPDATE product_variants
                 SET stock = stock - ?, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
              )
              .bind(item.quantity, item.variant_id),
          );
        }
      }
    }
    if (nextStatus === "cancelado" && hasActiveReservation) {
      for (const item of items) {
        statements.push(
          database
            .prepare(
              `INSERT INTO stock_movements (
                variant_id, order_id, source_key, reason, actor,
                stock_before, stock_after
              )
              SELECT id, ?, ?, 'order_cancellation', ?, stock, stock + ?
              FROM product_variants WHERE id = ?`,
            )
            .bind(
              orderId,
              `order:${orderId}:variant:${item.variant_id}:cancellation`,
              actor,
              item.quantity,
              item.variant_id,
            ),
          database
            .prepare(
              `UPDATE product_variants
               SET stock = stock + ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`,
            )
            .bind(item.quantity, item.variant_id),
        );
      }
      statements.push(
        database
          .prepare(
            `UPDATE order_inventory_reservations
             SET released_at = ?, release_reason = 'cancelled'
             WHERE order_id = ? AND released_at IS NULL`,
          )
          .bind(deductedAt, orderId),
      );
    }
    statements.push(
      database
        .prepare(
          `UPDATE orders SET status = ?,
           inventory_deducted_at = CASE WHEN ? = 'confirmado' THEN ? ELSE NULL END,
           updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND status = 'aguardando_confirmacao'`,
        )
        .bind(nextStatus, nextStatus, deductedAt, orderId),
      database
        .prepare(
          `INSERT INTO audit_log (
            actor, action, entity_type, entity_id, details
          ) VALUES (?, 'order_transition', 'order', ?, ?)`,
        )
        .bind(
          actor,
          orderId,
          JSON.stringify({ nextStatus, reserved: hasActiveReservation }),
        ),
    );
    await database.batch(statements);
  } catch (error) {
    const refreshed = await database
      .prepare(
        "SELECT status, inventory_deducted_at FROM orders WHERE id = ?",
      )
      .bind(orderId)
      .first<{ status: OrderStatus; inventory_deducted_at: string | null }>();
    if (refreshed?.status === nextStatus) {
      return {
        status: nextStatus,
        inventoryDeducted: Boolean(refreshed.inventory_deducted_at),
      };
    }
    if (
      refreshed?.status === "confirmado" ||
      refreshed?.status === "cancelado"
    ) {
      throw new Error("O pedido já recebeu outra decisão.");
    }
    const message = error instanceof Error ? error.message : "";
    if (message.includes("CHECK constraint")) {
      throw new Error("Estoque insuficiente para confirmar este pedido.");
    }
    throw error;
  }
  return {
    status: nextStatus,
    inventoryDeducted: nextStatus === "confirmado",
  };
}

export async function recreateCancelledOrder(
  orderId: string,
  actor: string,
): Promise<StoreOrder> {
  const database = getD1();
  await ensureSchema(database);
  await releaseExpiredReservations(database);
  const order = await database
    .prepare(
      `SELECT customer_name, customer_phone, customer_city, delivery_method, notes, status
       FROM orders WHERE id = ?`,
    )
    .bind(orderId)
    .first<{
      customer_name: string;
      customer_phone: string;
      customer_city: string;
      delivery_method: string;
      notes: string;
      status: OrderStatus;
    }>();
  if (!order) throw new Error("Pedido não encontrado.");
  if (order.status !== "cancelado") {
    throw new Error("Apenas pedidos cancelados podem ser recriados.");
  }
  const items = await all<{
    variant_id: number | null;
    quantity: number;
    custom_name: string;
    custom_number: string;
  }>(
    database,
    `SELECT variant_id, quantity, custom_name, custom_number
     FROM order_items WHERE order_id = ? ORDER BY id`,
    orderId,
  );
  if (!items.length || items.some((item) => item.variant_id === null)) {
    throw new Error("Este pedido possui uma variação que não está mais disponível.");
  }
  return createOrder({
    customerName: order.customer_name,
    customerPhone: order.customer_phone,
    customerCity: order.customer_city,
    deliveryMethod: order.delivery_method,
    notes: order.notes,
    items: items.map((item) => ({
      variantId: item.variant_id!,
      quantity: item.quantity,
      customName: item.custom_name,
      customNumber: item.custom_number,
    })),
    actor,
  });
}

export async function registerOrderReturn(input: {
  orderId: string;
  actor: string;
  items: Array<{ orderItemId: number; quantity: number; restock: boolean }>;
}): Promise<void> {
  const database = getD1();
  await ensureSchema(database);
  const order = await database.prepare("SELECT status FROM orders WHERE id = ?").bind(input.orderId).first<{ status: OrderStatus }>();
  if (!order || order.status !== "confirmado") throw new Error("A devolução só pode ser registrada em pedido confirmado.");
  const returned = input.items.filter((item) => item.quantity > 0);
  if (!returned.length) throw new Error("Informe ao menos uma peça para devolução.");
  const rows = await all<{ id: number; variant_id: number; quantity: number; returned_quantity: number }>(database, "SELECT id, variant_id, quantity, returned_quantity FROM order_items WHERE order_id = ?", input.orderId);
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const item of returned) {
    const row = byId.get(item.orderItemId);
    if (!row || item.quantity > row.quantity - row.returned_quantity) throw new Error("A quantidade devolvida é maior que a quantidade vendida.");
  }
  const returnId = `RET-${crypto.randomUUID()}`;
  const statements: D1PreparedStatement[] = [database.prepare("INSERT INTO order_returns (id, order_id, actor) VALUES (?, ?, ?)").bind(returnId, input.orderId, input.actor)];
  for (const item of returned) {
    const row = byId.get(item.orderItemId)!;
    const restockQuantity = item.restock ? item.quantity : 0;
    statements.push(
      database.prepare("INSERT INTO order_return_items (return_id, order_item_id, variant_id, quantity, restock_quantity) VALUES (?, ?, ?, ?, ?)").bind(returnId, row.id, row.variant_id, item.quantity, restockQuantity),
      database.prepare("UPDATE order_items SET returned_quantity = returned_quantity + ?, restocked_quantity = restocked_quantity + ? WHERE id = ? AND returned_quantity + ? <= quantity").bind(item.quantity, restockQuantity, row.id, item.quantity),
    );
    if (restockQuantity) statements.push(
      database.prepare("INSERT INTO stock_movements (variant_id, order_id, source_key, reason, actor, stock_before, stock_after) SELECT id, ?, ?, 'order_return', ?, stock, stock + ? FROM product_variants WHERE id = ?").bind(input.orderId, `return:${returnId}:${row.id}`, input.actor, restockQuantity, row.variant_id),
      database.prepare("UPDATE product_variants SET stock = stock + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(restockQuantity, row.variant_id),
    );
  }
  await database.batch(statements);
}
