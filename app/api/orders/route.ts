import { createOrder, getStoreSettings } from "@/db/store";
import { formatMoney } from "@/lib/pricing";
import { intValue, textValue } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length || items.length > 30) {
      throw new Error("Adicione ao menos um item ao pedido.");
    }
    const order = await createOrder({
      customerName: textValue(body.customerName, "Nome", {
        required: true,
        max: 120,
      }),
      customerPhone: textValue(body.customerPhone, "Telefone", {
        required: true,
        max: 30,
      }),
      customerCity: textValue(body.customerCity, "Cidade", {
        required: true,
        max: 120,
      }),
      deliveryMethod: textValue(body.deliveryMethod, "Forma de entrega", {
        required: true,
        max: 100,
      }),
      notes: textValue(body.notes, "Observações", { max: 500 }),
      items: items.map((raw) => {
        const item = raw as Record<string, unknown>;
        return {
          variantId: intValue(item.variantId, "Variação", { min: 1 }),
          quantity: intValue(item.quantity, "Quantidade", { min: 1, max: 20 }),
          customName: textValue(item.customName, "Nome personalizado", {
            max: 30,
          }),
          customNumber: textValue(item.customNumber, "Número personalizado", {
            max: 4,
          }),
        };
      }),
    });

    const settings = await getStoreSettings();
    const lines = [
      "Olá! Fiz um pedido pelo site da Camisa 10.",
      "",
      `Pedido: ${order.id}`,
      `Cliente: ${order.customerName}`,
      `Telefone: ${order.customerPhone}`,
      `Cidade: ${order.customerCity}`,
      `Entrega: ${order.deliveryMethod}`,
      "",
      ...order.items.flatMap((item, index) => [
        `${index + 1}. ${item.productName}`,
        `   ${item.size} · ${item.color} · ${item.quantity} un.`,
        item.customName || item.customNumber
          ? `   Personalização: ${item.customName || "sem nome"} / ${item.customNumber || "sem número"}`
          : "   Sem personalização",
        `   ${formatMoney(item.lineTotal)}`,
      ]),
      "",
      `Total: ${formatMoney(order.total)}`,
      order.notes ? `Observações: ${order.notes}` : "",
      "",
      "Aguardando confirmação da loja.",
    ].filter(Boolean);
    const whatsappUrl = `https://wa.me/${settings.whatsappNumber}?text=${encodeURIComponent(lines.join("\n"))}`;
    return Response.json({ order, whatsappUrl }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível criar o pedido.",
      },
      { status: 400 },
    );
  }
}
