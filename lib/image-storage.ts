type StoredImageMetadata = {
  httpMetadata?: R2HTTPMetadata;
  customMetadata?: Record<string, string>;
};

export async function putImageWithCompensation<T>(input: {
  bucket: R2Bucket;
  objectKey: string;
  bytes: Uint8Array;
  metadata: StoredImageMetadata;
  saveRecord: () => Promise<T>;
}): Promise<T> {
  await input.bucket.put(input.objectKey, input.bytes, input.metadata);
  try {
    return await input.saveRecord();
  } catch (databaseError) {
    try {
      await input.bucket.delete(input.objectKey);
    } catch (storageError) {
      throw new AggregateError(
        [databaseError, storageError],
        "Falha no banco e não foi possível compensar o objeto enviado.",
      );
    }
    throw databaseError;
  }
}

export async function deleteImageWithCompensation(input: {
  bucket: R2Bucket;
  objectKey: string;
  contentType: string;
  deleteRecord: () => Promise<void>;
}): Promise<void> {
  const stored = await input.bucket.get(input.objectKey);
  const bytes = stored ? await stored.arrayBuffer() : null;
  const metadata: StoredImageMetadata = stored
    ? {
        httpMetadata: {
          ...stored.httpMetadata,
          contentType: stored.httpMetadata?.contentType ?? input.contentType,
        },
        customMetadata: stored.customMetadata,
      }
    : {};
  await input.bucket.delete(input.objectKey);
  try {
    await input.deleteRecord();
  } catch (databaseError) {
    if (bytes) {
      try {
        await input.bucket.put(input.objectKey, bytes, metadata);
      } catch (storageError) {
        throw new AggregateError(
          [databaseError, storageError],
          "Falha no banco e não foi possível restaurar o objeto removido.",
        );
      }
    }
    throw databaseError;
  }
}
