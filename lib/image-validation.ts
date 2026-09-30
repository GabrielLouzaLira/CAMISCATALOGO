export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_MULTIPART_OVERHEAD_BYTES = 256 * 1024;

type SupportedImage = {
  contentType: "image/jpeg" | "image/png" | "image/webp" | "image/avif";
  extension: "jpg" | "png" | "webp" | "avif";
};

const extensionByMime = new Map<string, string[]>([
  ["image/jpeg", ["jpg", "jpeg"]],
  ["image/png", ["png"]],
  ["image/webp", ["webp"]],
  ["image/avif", ["avif"]],
]);

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

export function detectImage(bytes: Uint8Array): SupportedImage | null {
  if (
    bytes.length >= 3 &&
    startsWith(bytes, [0xff, 0xd8, 0xff])
  ) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }
  if (
    bytes.length >= 8 &&
    startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  ) {
    return { contentType: "image/png", extension: "png" };
  }
  if (
    bytes.length >= 12 &&
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return { contentType: "image/webp", extension: "webp" };
  }
  if (bytes.length >= 12) {
    const box = String.fromCharCode(...bytes.slice(4, 12));
    if (box === "ftypavif" || box === "ftypavis") {
      return { contentType: "image/avif", extension: "avif" };
    }
  }
  return null;
}

export function validateImage(input: {
  bytes: Uint8Array;
  fileName: string;
  claimedContentType: string;
}): SupportedImage {
  if (!input.bytes.length || input.bytes.length > MAX_IMAGE_BYTES) {
    throw new Error("A imagem deve ter no máximo 10 MB.");
  }
  const detected = detectImage(input.bytes);
  if (!detected) {
    throw new Error("O conteúdo do arquivo não é uma imagem permitida.");
  }
  const extension = input.fileName.split(".").pop()?.toLowerCase() ?? "";
  const acceptedExtensions = extensionByMime.get(detected.contentType) ?? [];
  if (!acceptedExtensions.includes(extension)) {
    throw new Error("A extensão não corresponde ao conteúdo da imagem.");
  }
  if (input.claimedContentType.toLowerCase() !== detected.contentType) {
    throw new Error("O tipo informado não corresponde ao conteúdo da imagem.");
  }
  return detected;
}

export function validateUploadContentLength(value: string | null): number {
  const contentLength = Number(value);
  if (
    !value ||
    !Number.isSafeInteger(contentLength) ||
    contentLength <= 0
  ) {
    throw new Error("O tamanho da requisição de imagem é obrigatório.");
  }
  if (contentLength > MAX_IMAGE_BYTES + MAX_MULTIPART_OVERHEAD_BYTES) {
    throw new Error("A requisição de imagem excede o limite permitido.");
  }
  return contentLength;
}
