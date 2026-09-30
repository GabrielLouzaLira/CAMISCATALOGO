import { savePromotion } from "@/db/store";
import { requireAdminApi } from "@/lib/admin-auth";
import {
  boolValue,
  intValue,
  optionalIsoDate,
  textValue,
} from "@/lib/validation";

async function save(request: Request) {
  const auth = await requireAdminApi(request);
  if (auth.error) return auth.error;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const startsAt = optionalIsoDate(body.startsAt, "Início");
    const endsAt = optionalIsoDate(body.endsAt, "Fim");
    if (startsAt && endsAt && new Date(startsAt) > new Date(endsAt)) {
      throw new Error("O fim da promoção deve ser posterior ao início.");
    }
    await savePromotion({
      productId: intValue(body.productId, "Produto", { min: 1 }),
      name:
        textValue(body.name, "Nome da promoção", { max: 100 }) || "Promoção",
      promotionalPrice: intValue(body.promotionalPrice, "Preço promocional", {
        min: 0,
      }),
      startsAt,
      endsAt,
      active: body.active === undefined ? true : boolValue(body.active),
    });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Dados inválidos." },
      { status: 400 },
    );
  }
}

export const POST = save;
export const PATCH = save;
