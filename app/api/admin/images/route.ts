import {
  addProductImage,
  getProductImage,
  removeProductImage,
  reorderProductImages,
} from "@/db/store";
import { getProductImagesBucket } from "@/db/runtime";
import { requireAdminApi } from "@/lib/admin-auth";
import {
  MAX_IMAGE_BYTES,
  validateUploadContentLength,
  validateImage,
} from "@/lib/image-validation";
import {
  deleteImageWithCompensation,
  putImageWithCompensation,
} from "@/lib/image-storage";
import { intValue, textValue } from "@/lib/validation";

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (auth.error) return auth.error;
  try {
    validateUploadContentLength(request.headers.get("content-length"));
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new Error("Selecione uma imagem.");
    if (!file.size || file.size > MAX_IMAGE_BYTES) {
      throw new Error("A imagem deve ter no máximo 10 MB.");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const detected = validateImage({
      bytes,
      fileName: file.name,
      claimedContentType: file.type,
    });
    const productId = intValue(formData.get("productId"), "Produto", { min: 1 });
    const altText = textValue(formData.get("altText"), "Texto alternativo", {
      max: 160,
    });
    const objectKey =
      `products/${productId}/${crypto.randomUUID()}.${detected.extension}`;
    const bucket = getProductImagesBucket();
    const imageId = await putImageWithCompensation({
      bucket,
      objectKey,
      bytes,
      metadata: {
        httpMetadata: {
          contentType: detected.contentType,
          cacheControl: "public, max-age=31536000, immutable",
        },
        customMetadata: {
          uploadedBy: auth.user.email,
        },
      },
      saveRecord: () =>
        addProductImage({
          productId,
          objectKey,
          altText,
          contentType: detected.contentType,
          sizeBytes: bytes.byteLength,
        }),
    });
    return Response.json(
      { image: { id: imageId, url: `/api/images/${imageId}` } },
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Falha no upload." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdminApi(request);
  if (auth.error) return auth.error;
  try {
    const url = new URL(request.url);
    const imageId = intValue(url.searchParams.get("id"), "Imagem", { min: 1 });
    const image = await getProductImage(imageId);
    if (!image) {
      return Response.json({ error: "Imagem não encontrada." }, { status: 404 });
    }
    const bucket = getProductImagesBucket();
    await deleteImageWithCompensation({
      bucket,
      objectKey: image.objectKey,
      contentType: image.contentType,
      deleteRecord: async () => {
        await removeProductImage(imageId);
      },
    });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Falha ao remover." },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApi(request);
  if (auth.error) return auth.error;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const productId = intValue(body.productId, "Produto", { min: 1 });
    if (!Array.isArray(body.imageIds) || body.imageIds.length > 30) {
      throw new Error("Ordem de imagens inválida.");
    }
    const imageIds = body.imageIds.map((id) =>
      intValue(id, "Imagem", { min: 1 }),
    );
    if (new Set(imageIds).size !== imageIds.length) {
      throw new Error("A ordem contém imagens repetidas.");
    }
    await reorderProductImages(productId, imageIds);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Falha ao ordenar." },
      { status: 400 },
    );
  }
}
