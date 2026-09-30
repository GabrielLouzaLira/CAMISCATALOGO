import { saveStoreSettings } from "@/db/store";
import { requireAdminApi } from "@/lib/admin-auth";
import { normalizeInstagramUrl } from "@/lib/store-settings";
import { textValue } from "@/lib/validation";

export async function PATCH(request: Request) {
  const auth = await requireAdminApi(request);
  if (auth.error) return auth.error;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const deliveryOptions = Array.isArray(body.deliveryOptions)
      ? body.deliveryOptions.map((item) =>
          textValue(item, "Opção de entrega", { required: true, max: 80 }),
        )
      : [];
    if (!deliveryOptions.length || deliveryOptions.length > 8) {
      throw new Error("Informe entre uma e oito opções de entrega.");
    }
    const whatsappNumber = textValue(body.whatsappNumber, "WhatsApp", {
      required: true,
      max: 20,
    }).replace(/\D/g, "");
    if (whatsappNumber.length < 10) {
      throw new Error("Informe um número de WhatsApp válido.");
    }
    const instagramValue = textValue(body.instagramUrl, "Instagram", {
      required: false,
      max: 240,
    });
    const instagramUrl = instagramValue
      ? normalizeInstagramUrl(instagramValue) ?? ""
      : "";
    if (instagramValue && !instagramUrl) {
      throw new Error("Informe uma URL HTTPS válida do Instagram.");
    }
    await saveStoreSettings(
      {
        storeName: textValue(body.storeName, "Nome da loja", {
          required: true,
          max: 80,
        }),
        whatsappNumber,
        instagramUrl,
        city: textValue(body.city, "Cidade", { required: true, max: 100 }),
        deliveryOptions,
        heroEyebrow: textValue(body.heroEyebrow, "Texto superior", {
          required: true,
          max: 120,
        }),
        heroTitle: textValue(body.heroTitle, "Título principal", {
          required: true,
          max: 160,
        }),
        heroSubtitle: textValue(body.heroSubtitle, "Subtítulo", {
          required: true,
          max: 180,
        }),
      },
      auth.user.email,
    );
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível salvar as configurações.",
      },
      { status: 400 },
    );
  }
}
