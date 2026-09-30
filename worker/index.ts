/** Cloudflare Worker entry point for the Camisa 10 storefront. */
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  PRODUCT_IMAGES: R2Bucket;
  ADMIN_EMAIL_ALLOWLIST?: string;
  NEXT_PUBLIC_STORE_WHATSAPP?: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return handler.fetch(request, env, ctx);
  },
};

export default worker;
