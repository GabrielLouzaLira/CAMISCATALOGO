import { saveProduct } from "@/db/store";
import type { ProductStatus } from "@/lib/store-types";
import { requireAdminApi } from "@/lib/admin-auth";
import {
  boolValue,
  intValue,
  slugify,
  textValue,
} from "@/lib/validation";

const statuses = new Set<ProductStatus>(["draft", "published", "archived"]);

async function save(request: Request) {
  const auth = await requireAdminApi(request);
  if (auth.error) return auth.error;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const id =
      body.id === undefined
        ? undefined
        : intValue(body.id, "Produto", { min: 1 });
    const name = textValue(body.name, "Nome", { required: true, max: 140 });
    const status = textValue(body.status ?? "draft", "Status") as ProductStatus;
    if (!statuses.has(status)) throw new Error("Status de produto inválido.");
    const rawVariants = Array.isArray(body.variants) ? body.variants : [];
    if (!rawVariants.length || rawVariants.length > 100) {
      throw new Error("Cadastre ao menos uma variação.");
    }
    const variants = rawVariants.map((raw) => {
      const variant = raw as Record<string, unknown>;
      const variantId =
        variant.id === undefined
          ? undefined
          : intValue(variant.id, "Variação", { min: 1 });
      return {
        id: variantId,
        expectedStock:
          variantId === undefined
            ? undefined
            : intValue(variant.expectedStock, "Estoque original", {
                min: 0,
                max: 1_000_000,
              }),
        size: textValue(variant.size, "Tamanho", {
          required: true,
          max: 30,
        }),
        color: textValue(variant.color, "Cor", {
          required: true,
          max: 60,
        }),
        sku: textValue(variant.sku, "SKU", {
          required: true,
          max: 80,
        }).toUpperCase(),
        stock: intValue(variant.stock, "Estoque", { min: 0, max: 1_000_000 }),
        active:
          variant.active === undefined ? true : boolValue(variant.active),
      };
    });
    if (new Set(variants.map((variant) => variant.sku)).size !== variants.length) {
      throw new Error("Os SKUs das variações devem ser únicos.");
    }
    const persistedIds = variants.flatMap((variant) =>
      variant.id === undefined ? [] : [variant.id],
    );
    if (new Set(persistedIds).size !== persistedIds.length) {
      throw new Error("A lista contém identificadores de variação repetidos.");
    }
    const productId = await saveProduct({
      id,
      categoryId:
        body.categoryId === null || body.categoryId === ""
          ? null
          : intValue(body.categoryId, "Categoria", { min: 1 }),
      name,
      slug: textValue(body.slug, "Slug", { max: 80 }) || slugify(name),
      description: textValue(body.description, "Descrição", { max: 2_000 }),
      basePrice: intValue(body.basePrice, "Preço", { min: 0 }),
      personalizationEnabled: boolValue(body.personalizationEnabled),
      personalizationFee: intValue(
        body.personalizationFee ?? 0,
        "Valor da personalização",
        { min: 0 },
      ),
      featured: boolValue(body.featured),
      status,
      team: textValue(body.team, "Time", { max: 100 }) || null,
      season: textValue(body.season, "Temporada", { max: 50 }) || null,
      variants,
      actor: auth.user.email,
    });
    return Response.json({ ok: true, productId }, { status: id ? 200 : 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Dados de produto inválidos.";
    const friendly = message.includes("UNIQUE constraint failed")
      ? "Já existe uma categoria, produto ou SKU com esse identificador."
      : message;
    return Response.json({ error: friendly }, { status: 400 });
  }
}

export const POST = save;
export const PATCH = save;
