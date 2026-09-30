import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("a saída de produção contém as rotas da loja", async () => {
  await access(new URL("../dist/server/index.js", import.meta.url));
  const builtWorker = await readFile(
    new URL("../dist/server/index.js", import.meta.url),
    "utf8",
  );
  assert.match(builtWorker, /api\/admin\/catalog/);
  assert.match(builtWorker, /api\/orders/);
  assert.match(builtWorker, /api\/storefront/);
});

test("a renderização pública usa linguagem de loja real", async () => {
  const [page, storefront, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/storefront.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /Camisa 10 \| Camisetas para todos os estilos/);
  assert.match(storefront, /store\.heroTitle/);
  assert.match(storefront, /store\.heroSubtitle/);
  assert.match(storefront, /store\.storeName/);
  assert.match(storefront, /aria-label=\{`\$\{store\.storeName\} — início`\}/);
  assert.doesNotMatch(storefront, /<strong>CAMISA 10<\/strong>/);
  assert.match(page, /Camisetas para todos os estilos/);
  assert.match(page, /Vista o que representa você/);
  assert.match(storefront, /Novidades chegando/);
  assert.doesNotMatch(
    `${page}\n${storefront}\n${layout}`,
    /demonstração|demonstrativo|preços ilustrativos|catálogo esportivo/i,
  );
});

test("mantém pedidos persistentes e administração protegida", async () => {
  const [ordersRoute, adminAuth, admin, store] = await Promise.all([
    readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/admin-auth.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/admin/admin-dashboard.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../db/store.ts", import.meta.url), "utf8"),
  ]);
  assert.match(ordersRoute, /await createOrder/);
  assert.match(ordersRoute, /whatsappUrl/);
  assert.match(adminAuth, /requireAdminApi/);
  assert.match(adminAuth, /Autenticação necessária/);
  assert.match(adminAuth, /ADMIN_SESSION_SECRET/);
  assert.match(admin, /Confirmar pedido/);
  assert.match(admin, /Criar novo pedido com estes itens/);
  assert.match(admin, /Nova categoria/);
  assert.match(admin, /Novo produto/);
  assert.match(store, /order_inventory_deductions/);
  assert.match(store, /order_inventory_reservations/);
  assert.match(store, /order_reservation/);
  assert.match(store, /INSERT INTO order_terminal_claims/);
  assert.match(store, /inventory_deducted_at/);
});

test("mantém bindings, acessibilidade e responsividade", async () => {
  const [storefront, css, localConfig, schema] = await Promise.all([
    readFile(new URL("../app/storefront.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../wrangler.local.jsonc", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
  ]);
  assert.match(storefront, /sessionStorage\.getItem\("camisa10-cart"\)/);
  assert.match(storefront, /Forma de entrega/);
  assert.match(localConfig, /"binding": "DB"/);
  assert.match(localConfig, /"binding": "PRODUCT_IMAGES"/);
  assert.doesNotMatch(localConfig, /project_id|account_id/);
  assert.match(schema, /orderInventoryDeductions/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /@media \(max-width: 560px\)/);
  await access(new URL("../app/admin/login/page.tsx", import.meta.url));
  await access(new URL("../app/api/admin-auth/login/route.ts", import.meta.url));
});
