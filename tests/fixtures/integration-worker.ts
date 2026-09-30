import { ensureSchema, getD1 } from "../../db/runtime";
import {
  createOrder,
  getSalesData,
  recreateCancelledOrder,
  saveCategory,
  saveProduct,
  transitionOrder,
} from "../../db/store";

async function body(request: Request): Promise<Record<string, unknown>> {
  return (await request.json()) as Record<string, unknown>;
}

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/health") return Response.json({ ok: true });
  const database = getD1();
  await ensureSchema(database);

  if (request.method === "POST" && url.pathname === "/category") {
    const input = await body(request);
    await saveCategory(input as Parameters<typeof saveCategory>[0]);
    return Response.json({ ok: true });
  }
  if (request.method === "POST" && url.pathname === "/product") {
    const input = await body(request);
    const productId = await saveProduct({
      ...(input as Parameters<typeof saveProduct>[0]),
      actor: "integration@local",
    });
    return Response.json({ productId });
  }
  if (request.method === "POST" && url.pathname === "/order") {
    const input = await body(request);
    return Response.json(
      await createOrder(input as Parameters<typeof createOrder>[0]),
    );
  }
  if (request.method === "POST" && url.pathname === "/transition") {
    const input = await body(request);
    return Response.json(
      await transitionOrder(
        String(input.orderId),
        input.status as "confirmado" | "cancelado",
        "integration@local",
      ),
    );
  }
  if (request.method === "POST" && url.pathname === "/recreate") {
    const input = await body(request);
    return Response.json(
      await recreateCancelledOrder(String(input.orderId), "integration@local"),
    );
  }
  if (request.method === "GET" && url.pathname === "/sales") {
    return Response.json(
      await getSalesData(url.searchParams.get("month")),
    );
  }
  if (request.method === "GET" && url.pathname === "/state") {
    const variantId = Number(url.searchParams.get("variantId"));
    const orderId = url.searchParams.get("orderId");
    const productId = Number(url.searchParams.get("productId"));
    const variant = Number.isInteger(variantId)
      ? await database
          .prepare(
            `SELECT id, product_id, sku, stock, active
             FROM product_variants WHERE id = ?`,
          )
          .bind(variantId)
          .first()
      : null;
    const order = orderId
      ? await database
          .prepare(
            `SELECT id, status, inventory_deducted_at
             FROM orders WHERE id = ?`,
          )
          .bind(orderId)
          .first()
      : null;
    const product = Number.isInteger(productId)
      ? await database
          .prepare("SELECT id, name, slug FROM products WHERE id = ?")
          .bind(productId)
          .first()
      : null;
    const productVariants = Number.isInteger(productId)
      ? (
          await database
            .prepare(
              `SELECT id, product_id, sku, stock, active
               FROM product_variants WHERE product_id = ? ORDER BY id`,
            )
            .bind(productId)
            .all()
        ).results
      : [];
    const movements = Number.isInteger(variantId)
      ? (
          await database
            .prepare(
              `SELECT reason, stock_before, stock_after, order_id
               FROM stock_movements WHERE variant_id = ? ORDER BY id`,
            )
            .bind(variantId)
            .all()
        ).results
      : [];
    return Response.json({
      variant,
      order,
      product,
      productVariants,
      movements,
    });
  }
  return new Response("Not found", { status: 404 });
}

const integrationWorker = {
  async fetch(request: Request): Promise<Response> {
    try {
      return await handle(request);
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Falha" },
        { status: 400 },
      );
    }
  },
};

export default integrationWorker;
