import { getSalesData } from "@/db/store";
import { requireAdminApi } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (auth.error) return auth.error;
  try {
    const month = new URL(request.url).searchParams.get("month");
    return Response.json(await getSalesData(month), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Mes invalido.") {
      return Response.json(
        { error: "Mês inválido. Use o formato AAAA-MM." },
        { status: 400 },
      );
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Falha ao carregar vendas." },
      { status: 500 },
    );
  }
}
