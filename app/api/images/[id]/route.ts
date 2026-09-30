import { getProductImage } from "@/db/store";
import { getProductImagesBucket } from "@/db/runtime";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const imageId = Number(id);
    if (!Number.isInteger(imageId) || imageId < 1) {
      return new Response("Imagem inválida.", { status: 400 });
    }
    const metadata = await getProductImage(imageId);
    if (!metadata) return new Response("Imagem não encontrada.", { status: 404 });
    const object = await getProductImagesBucket().get(metadata.objectKey);
    if (!object) return new Response("Imagem não encontrada.", { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Content-Type", metadata.contentType);
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.set("ETag", object.httpEtag);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Cross-Origin-Resource-Policy", "same-origin");
    headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
    return new Response(object.body, { headers });
  } catch {
    return new Response("Imagem indisponível.", { status: 503 });
  }
}
