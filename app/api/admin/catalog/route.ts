import { getAdminData } from "@/db/store";
import { requireAdminApi } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (auth.error) return auth.error;
  try {
    return Response.json(await getAdminData(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Falha ao carregar o painel.",
      },
      { status: 500 },
    );
  }
}
