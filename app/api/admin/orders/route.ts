import {
  getOrdersPage,
  recreateCancelledOrder,
  registerOrderReturn,
  transitionOrder,
} from "@/db/store";
import { requireAdminApi } from "@/lib/admin-auth";
import type { OrderStatus } from "@/lib/store-types";
import { textValue } from "@/lib/validation";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (auth.error) return auth.error;
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const offset = Number(url.searchParams.get("offset") ?? "0");
    if (status && !["aguardando_confirmacao", "confirmado", "cancelado"].includes(status)) {
      throw new Error("Status inválido.");
    }
    return Response.json(await getOrdersPage({
      search: url.searchParams.get("search") ?? "",
      status: status as OrderStatus | null ?? undefined,
      offset: Number.isSafeInteger(offset) && offset >= 0 ? offset : 0,
      limit: 20,
    }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha ao carregar pedidos." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApi(request);
  if (auth.error) return auth.error;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.action === "recreate") {
      return Response.json(
        await recreateCancelledOrder(
          textValue(body.orderId, "Pedido", { required: true, max: 50 }),
          auth.user.email,
        ),
        { status: 201 },
      );
    }
    if (body.action === "return") {
      const items = Array.isArray(body.items) ? body.items : [];
      await registerOrderReturn({
        orderId: textValue(body.orderId, "Pedido", { required: true, max: 50 }),
        actor: auth.user.email,
        items: items.map((raw) => {
          const item = raw as Record<string, unknown>;
          return {
            orderItemId: Number(item.orderItemId),
            quantity: Number(item.quantity),
            restock: Boolean(item.restock),
          };
        }),
      });
      return Response.json({ ok: true });
    }
    const orderId = textValue(body.orderId, "Pedido", {
      required: true,
      max: 50,
    });
    const status = textValue(body.status, "Status") as OrderStatus;
    if (status !== "confirmado" && status !== "cancelado") {
      throw new Error("Status inválido.");
    }
    return Response.json(
      await transitionOrder(orderId, status, auth.user.email),
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Falha no pedido." },
      { status: 400 },
    );
  }
}
