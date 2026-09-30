import { saveCategory } from "@/db/store";
import { requireAdminApi } from "@/lib/admin-auth";
import {
  boolValue,
  intValue,
  slugify,
  textValue,
} from "@/lib/validation";

async function save(request: Request) {
  const auth = await requireAdminApi(request);
  if (auth.error) return auth.error;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const id =
      body.id === undefined
        ? undefined
        : intValue(body.id, "Categoria", { min: 1 });
    const name = textValue(body.name, "Nome", { required: true, max: 80 });
    await saveCategory({
      id,
      name,
      slug: textValue(body.slug, "Slug", { max: 80 }) || slugify(name),
      sortOrder: intValue(body.sortOrder ?? 0, "Ordem", {
        min: 0,
        max: 10_000,
      }),
      active: body.active === undefined ? true : boolValue(body.active),
    });
    return Response.json({ ok: true }, { status: id ? 200 : 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Dados inválidos." },
      { status: 400 },
    );
  }
}

export const POST = save;
export const PATCH = save;
