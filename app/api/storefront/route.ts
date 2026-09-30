import { getStorefrontData } from "@/db/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getStorefrontData(), {
      headers: { "Cache-Control": "public, max-age=30" },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Não foi possível carregar a loja.";
    return Response.json({ error: message }, { status: 503 });
  }
}
