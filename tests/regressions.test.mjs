import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  aggregateOrderItems,
  quantityByVariant,
} from "../lib/order-input.ts";
import {
  MAX_IMAGE_BYTES,
  detectImage,
  validateUploadContentLength,
  validateImage,
} from "../lib/image-validation.ts";
import {
  deleteImageWithCompensation,
  putImageWithCompensation,
} from "../lib/image-storage.ts";
import {
  defaultStoreSettings,
  normalizeInstagramUrl,
  normalizeOperationalSettings,
  normalizeStoreSettingsRow,
} from "../lib/store-settings.ts";

test("agrega linhas idênticas antes de calcular estoque", () => {
  const aggregated = aggregateOrderItems([
    {
      variantId: 7,
      quantity: 2,
      customName: " Ana ",
      customNumber: "10",
    },
    {
      variantId: 7,
      quantity: 3,
      customName: "ana",
      customNumber: "10",
    },
    {
      variantId: 7,
      quantity: 1,
      customName: "Bia",
      customNumber: "9",
    },
  ]);
  assert.equal(aggregated.length, 2);
  assert.equal(aggregated[0].quantity, 5);
  assert.equal(quantityByVariant(aggregated).get(7), 6);
});

test("reconhece conteúdo real e rejeita MIME ou extensão divergentes", () => {
  const png = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  assert.deepEqual(detectImage(png), {
    contentType: "image/png",
    extension: "png",
  });
  assert.deepEqual(
    validateImage({
      bytes: png,
      fileName: "produto.png",
      claimedContentType: "image/png",
    }),
    { contentType: "image/png", extension: "png" },
  );
  assert.throws(
    () =>
      validateImage({
        bytes: png,
        fileName: "produto.jpg",
        claimedContentType: "image/jpeg",
      }),
    /não corresponde/,
  );
});

test("rejeita arquivo vazio, disfarçado e acima do limite", () => {
  assert.equal(MAX_IMAGE_BYTES, 10 * 1024 * 1024);
  assert.throws(
    () =>
      validateImage({
        bytes: new TextEncoder().encode("<script>alert(1)</script>"),
        fileName: "ataque.png",
        claimedContentType: "image/png",
      }),
    /não é uma imagem/,
  );
  assert.throws(
    () =>
      validateImage({
        bytes: new Uint8Array(MAX_IMAGE_BYTES + 1),
        fileName: "grande.png",
        claimedContentType: "image/png",
      }),
    /máximo/,
  );
});

test("rejeita upload sem tamanho antes do multipart", () => {
  assert.throws(() => validateUploadContentLength(null), /obrigatório/);
  assert.throws(() => validateUploadContentLength("0"), /obrigatório/);
  assert.throws(
    () => validateUploadContentLength(String(MAX_IMAGE_BYTES + 256 * 1024 + 1)),
    /excede/,
  );
  assert.equal(validateUploadContentLength("1024"), 1024);
});

test("compensa objeto quando a persistência no D1 falha", async () => {
  const objects = new Map();
  const bucket = {
    async put(key, value, metadata) {
      objects.set(key, { value, metadata });
    },
    async delete(key) {
      objects.delete(key);
    },
  };
  await assert.rejects(
    putImageWithCompensation({
      bucket,
      objectKey: "products/1/test.png",
      bytes: Uint8Array.from([1, 2, 3]),
      metadata: { httpMetadata: { contentType: "image/png" } },
      saveRecord: async () => {
        throw new Error("D1 indisponível");
      },
    }),
    /D1 indisponível/,
  );
  assert.equal(objects.size, 0);
});

test("restaura bytes e metadados quando delete no D1 falha", async () => {
  const originalMetadata = {
    httpMetadata: {
      contentType: "image/webp",
      cacheControl: "public, max-age=31536000, immutable",
    },
    customMetadata: { uploadedBy: "admin@local" },
  };
  const puts = [];
  const bucket = {
    async get() {
      return {
        httpMetadata: originalMetadata.httpMetadata,
        customMetadata: originalMetadata.customMetadata,
        async arrayBuffer() {
          return Uint8Array.from([9, 8, 7]).buffer;
        },
      };
    },
    async delete() {},
    async put(key, value, metadata) {
      puts.push({ key, value: [...new Uint8Array(value)], metadata });
    },
  };
  await assert.rejects(
    deleteImageWithCompensation({
      bucket,
      objectKey: "products/1/test.webp",
      contentType: "image/webp",
      deleteRecord: async () => {
        throw new Error("D1 indisponível");
      },
    }),
    /D1 indisponível/,
  );
  assert.equal(puts.length, 1);
  assert.deepEqual(puts[0], {
    key: "products/1/test.webp",
    value: [9, 8, 7],
    metadata: originalMetadata,
  });
});

test("edição de produto não apaga e recria variações", async () => {
  const store = await readFile(
    new URL("../db/store.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    store,
    /DELETE FROM product_variants WHERE product_id/,
  );
  assert.match(store, /UPDATE product_variants SET size = \?/);
  assert.match(store, /UPDATE product_variants SET active = 0/);
  assert.match(store, /await database\.batch\(statements\)/);
});

test("transição usa claim terminal e chave única de ledger", async () => {
  const store = await readFile(
    new URL("../db/store.ts", import.meta.url),
    "utf8",
  );
  assert.match(store, /INSERT INTO order_terminal_claims/);
  assert.match(store, /order:\$\{orderId\}:variant:/);
  assert.match(store, /GROUP BY variant_id/);
});

test("rota de imagem envia cabeçalhos seguros", async () => {
  const route = await readFile(
    new URL("../app/api/images/[id]/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /X-Content-Type-Options/);
  assert.match(route, /nosniff/);
  assert.match(route, /Cross-Origin-Resource-Policy/);
});

test("modais têm nome acessível, Escape, trap e retorno de foco", async () => {
  const dashboard = await readFile(
    new URL("../app/admin/admin-dashboard.tsx", import.meta.url),
    "utf8",
  );
  assert.match(dashboard, /aria-labelledby=\{labelledBy\}/);
  assert.match(dashboard, /aria-label="Fechar categoria"/);
  assert.match(dashboard, /event\.key === "Escape"/);
  assert.match(dashboard, /event\.key !== "Tab"/);
  assert.match(dashboard, /previousFocus\.focus\(\)/);
  assert.match(dashboard, /data-autofocus/);
});

test("painel permite categorias novas, filtros e configurações persistentes", async () => {
  const [dashboard, storefront, store, settingsRoute] = await Promise.all([
    readFile(new URL("../app/admin/admin-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/storefront.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/store.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/settings/route.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(dashboard, /id:\s*0/);
  assert.match(dashboard, /categoryEditor\.id !== undefined/);
  assert.match(dashboard, /Buscar produto/);
  assert.match(dashboard, /Carregar mais produtos/);
  assert.match(dashboard, /Buscar pedido/);
  assert.match(dashboard, /Carregar mais pedidos/);
  assert.match(dashboard, /Personalização:/);
  assert.match(dashboard, /formatOrderDate/);
  assert.match(dashboard, /Resumo de caixa/);
  assert.match(dashboard, /Histórico de \{salesData \? formatSalesMonth\(salesData\.month\) : "vendas"\}/);
  assert.match(dashboard, /Peças vendidas hoje/);
  assert.match(dashboard, /Total líquido do mês/);
  assert.match(dashboard, /Ver mês anterior/);
  assert.match(dashboard, /Ver próximo mês/);
  assert.match(dashboard, /salesMonth/);
  assert.match(dashboard, /Confirmado em \{formatOrderDate\(order\.inventoryDeductedAt \?\? order\.createdAt\)\}/);
  assert.match(store, /datetime\(inventory_deducted_at\) >= datetime\(\?\)/);
  assert.match(store, /datetime\(o\.inventory_deducted_at\) >= datetime\(\?\)/);
  assert.doesNotMatch(store, /datetime\(COALESCE\(inventory_deducted_at, created_at\)\)/);
  assert.doesNotMatch(store, /datetime\(COALESCE\(o\.inventory_deducted_at, o\.created_at\)\)/);
  assert.match(store, /datetime\(r\.created_at\) >= datetime\(\?\)/);
  const salesRoute = await readFile(
    new URL("../app/api/admin/sales/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(salesRoute, /formato AAAA-MM/);
  assert.match(salesRoute, /status: 400/);
  assert.match(dashboard, /multiple/);
  assert.match(dashboard, /10 MB/);
  assert.match(dashboard, /imagePreviews/);
  assert.match(dashboard, /Configurações/);
  assert.match(dashboard, /cancelSettingsChanges/);
  assert.match(dashboard, /Cancelar alterações/);
  assert.match(dashboard, /Deseja realmente salvar as alterações das configurações\?/);
  assert.match(storefront, /store\.deliveryOptions/);
  assert.match(storefront, /store\.whatsappNumber/);
  assert.match(store, /getStoreSettings/);
  assert.match(store, /saveStoreSettings/);
  assert.match(settingsRoute, /requireAdminApi/);
  assert.match(settingsRoute, /normalizeInstagramUrl/);
});

test("seleção de imagens preserva o campo durante a criação das prévias", async () => {
  const dashboard = await readFile(
    new URL("../app/admin/admin-dashboard.tsx", import.meta.url),
    "utf8",
  );
  assert.match(dashboard, /const input = event\.currentTarget/);
  assert.match(dashboard, /Array\.from\(input\.files \?\? \[\]\)/);
  assert.match(dashboard, /input\.value = ""/);
  assert.doesNotMatch(dashboard, /event\.currentTarget\.value = ""/);
});

test("vitrine exibe imagens cadastradas sem depender do otimizador local", async () => {
  const storefront = await readFile(
    new URL("../app/storefront.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(storefront, /from "next\/image"/);
  assert.match(storefront, /<img\s+src=\{image\.url\}/);
  assert.match(storefront, /loading=\{priority \? "eager" : "lazy"\}/);
});

test("detalhe do produto mostra a foto inteira e permite navegar pela galeria", async () => {
  const storefront = await readFile(
    new URL("../app/storefront.tsx", import.meta.url),
    "utf8",
  );
  const styles = await readFile(
    new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(storefront, /const \[activeImageIndex, setActiveImageIndex\] = useState\(0\)/);
  assert.match(storefront, /aria-label="Foto anterior"/);
  assert.match(storefront, /aria-label="Próxima foto"/);
  assert.match(storefront, /aria-label=\{`Ampliar foto/);
  assert.match(storefront, /imageViewerOpen/);
  assert.match(storefront, /gallery-thumbnails/);
  assert.match(styles, /\.gallery-image-zoom > img[\s\S]*object-fit: contain/);
  assert.match(styles, /\.image-lightbox[\s\S]*position: fixed/);
});

test("imagem e nome do card abrem as opções do produto", async () => {
  const storefront = await readFile(
    new URL("../app/storefront.tsx", import.meta.url),
    "utf8",
  );
  assert.match(storefront, /className="product-visual-button"/);
  assert.match(storefront, /aria-label=\{`Ver opções de \$\{product\.name\}`\}/);
  assert.match(storefront, /className="product-title-button"/);
});

test("carrinho mantém a camiseta aberta ao adicionar e permite revê-la", async () => {
  const storefront = await readFile(
    new URL("../app/storefront.tsx", import.meta.url),
    "utf8",
  );
  assert.match(storefront, /function openCartItem\(item: CartItem\)/);
  assert.match(storefront, /openProduct\(product, item\.variantId, true\)/);
  assert.match(storefront, /className="cart-thumb cart-product-link"/);
  assert.match(storefront, /className="cart-product-name"/);
  assert.match(storefront, /Ver camiseta/);
  assert.match(storefront, /onClick=\{closeProduct\}/);
  assert.doesNotMatch(
    storefront.slice(storefront.indexOf("function addToCart"), storefront.indexOf("function updateQuantity")),
    /setActiveProduct\(null\)/,
  );
});

test("painel destaca estoque baixo e produtos esgotados na lista", async () => {
  const [dashboard, styles] = await Promise.all([
    readFile(new URL("../app/admin/admin-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(dashboard, /variant\.stock > 0 &&[\s\S]*variant\.stock <= 3/);
  assert.match(dashboard, /estoque baixo/i);
  assert.match(dashboard, /esgotado/i);
  assert.match(styles, /\.stock-alert\.low/);
  assert.match(styles, /\.stock-alert\.sold-out/);
});

test("alertas de estoque consideram cada variação ativa, e não só o total do produto", async () => {
  const [dashboard, store] = await Promise.all([
    readFile(new URL("../app/admin/admin-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/store.ts", import.meta.url), "utf8"),
  ]);
  assert.match(dashboard, /const stockAttention = useMemo/);
  assert.match(dashboard, /variant\.active && variant\.stock <= 3/);
  assert.match(dashboard, /Variações esgotadas/);
  assert.match(dashboard, /Variações com estoque baixo/);
  assert.match(dashboard, /variants\.slice\(0, 2\)/);
  assert.match(dashboard, /\+ \{variants\.length - 2\} variações/);
  assert.match(store, /const activeVariants = allProducts/);
  assert.match(store, /variant\.stock === 0/);
  assert.match(store, /variant\.stock > 0 && variant\.stock <= 3/);
});

test("painel exibe imagens diretamente, indica fotos extras e permite ampliar", async () => {
  const [dashboard, styles] = await Promise.all([
    readFile(new URL("../app/admin/admin-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(dashboard, /from "next\/image"/);
  assert.match(dashboard, /src=\{product\.images\[0\]\.url\}/);
  assert.match(dashboard, /admin-image-count/);
  assert.match(dashboard, /setExpandedImage/);
  assert.match(dashboard, /className="admin-image-preview"/);
  assert.match(styles, /\.admin-image-preview/);
});

test("alerta de estoque abre a edição do produto correspondente", async () => {
  const dashboard = await readFile(
    new URL("../app/admin/admin-dashboard.tsx", import.meta.url),
    "utf8",
  );
  assert.match(dashboard, /className="stock-attention-actions"/);
  assert.match(dashboard, /setEditor\(productToDraft\(product\)\)/);
});

test("painel permite ativar ou inativar cada variação de produto", async () => {
  const dashboard = await readFile(
    new URL("../app/admin/admin-dashboard.tsx", import.meta.url),
    "utf8",
  );
  assert.match(dashboard, /Variação ativa/);
  assert.match(dashboard, /checked=\{variant\.active\}/);
  assert.match(dashboard, /updateVariant\(index, \{ active: event\.target\.checked \}\)/);
  assert.match(dashboard, /Remover da loja/);
});

test("busca administrativa inclui SKU de todas as variações", async () => {
  const dashboard = await readFile(
    new URL("../app/admin/admin-dashboard.tsx", import.meta.url),
    "utf8",
  );
  assert.match(dashboard, /product\.variants\.map\(\(variant\) => variant\.sku\)\.join\(" "\)/);
});

test("configurações legadas preservam campos válidos e normalizam apenas texto operacional", () => {
  const legacy = normalizeStoreSettingsRow({
    storeName: "Loja da Ana",
    whatsappNumber: "5511999999999",
    operationalText: "texto legado inválido",
  });
  assert.equal(legacy.storeName, "Loja da Ana");
  assert.equal(legacy.whatsappNumber, "5511999999999");
  assert.equal(legacy.instagramUrl, defaultStoreSettings.instagramUrl);

  const persisted = normalizeStoreSettingsRow({
    storeName: "Loja da Ana",
    whatsappNumber: "5511999999999",
    operationalText: JSON.stringify({
      instagramUrl: "https://instagram.com/loja.ana/",
      city: "Presidente Prudente-SP",
      deliveryOptions: ["Retirada", "Motoboy"],
    }),
  });
  assert.equal(persisted.instagramUrl, "https://www.instagram.com/loja.ana/");
  assert.equal(persisted.city, "Presidente Prudente-SP");
  assert.deepEqual(persisted.deliveryOptions, ["Retirada", "Motoboy"]);
});

test("Instagram aceita somente HTTPS do domínio seguro e é normalizado", () => {
  assert.equal(
    normalizeInstagramUrl("https://instagram.com/camisa10/"),
    "https://www.instagram.com/camisa10/",
  );
  for (const url of [
    "javascript:alert(1)",
    "http://www.instagram.com/camisa10/",
    "https://instagram.com.evil.test/camisa10/",
    "https://example.com/camisa10/",
  ]) {
    assert.equal(normalizeInstagramUrl(url), null);
  }
});

test("Instagram pode ficar vazio sem restaurar um link padrão", () => {
  const settings = normalizeOperationalSettings(
    JSON.stringify({ instagramUrl: "" }),
  );
  assert.equal(settings.instagramUrl, "");
});
