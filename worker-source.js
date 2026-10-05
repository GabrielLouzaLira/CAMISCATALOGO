const defaults = {
  settings: {
    storeName: "Camisa 10",
    whatsapp: "",
    email: "",
    instagram: "",
    catalogTitle: "Seu time. Sua camisa.",
    introText: "Veja os modelos em destaque ou filtre por esporte, grupo e time.",
    whatsappMessage: "Ola! Tenho interesse nesta camisa.\n\nTime: {time}\nModelo: {modelo}\nReferencia: {referencia}\nFoto: {link}",
    logo: "",
    initialCategoryId: "",
    initialGroup: "",
    catalogPageSize: 24,
    carouselAutoplay: false,
    carouselInterval: 6,
    carouselShowDots: true
  },
  categories: [
    { id: "futebol", number: "01", title: "Futebol", subtitle: "Clubes, selecoes e modelos retro", accent: "Esporte", order: 1, hidden: false },
    { id: "basquete", number: "02", title: "Basquete", subtitle: "Times e selecoes de basquete", accent: "Esporte", order: 2, hidden: false },
    { id: "volei", number: "03", title: "Volei", subtitle: "Clubes e selecoes de volei", accent: "Esporte", order: 3, hidden: false },
    { id: "nfl", number: "04", title: "NFL", subtitle: "Times de futebol americano", accent: "Esporte", order: 4, hidden: false }
  ]
};

const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const fail = (message, status = 400) => json({ error: message }, status);
const safeKey = name => String(name || "arquivo").replace(/[^a-z0-9._-]/gi, "-").slice(-90);
const parseStoredMedia = value => {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return value; }
};

const normalizedCollections = new Set(["categories", "teams", "products"]);
const tableFor = collection => `catalog_${collection}`;

async function runInChunks(env, statements, chunkSize = 50) {
  for (let index = 0; index < statements.length; index += chunkSize) await env.CATALOG_DB.batch(statements.slice(index, index + chunkSize));
}

async function ensureNormalizedStorage(env) {
  try {
    const completed = await env.CATALOG_DB.prepare("SELECT value FROM catalog_meta WHERE key = ?").bind("normalized-storage-v1").first();
    if (completed) return;
  } catch {
    // The normalized tables are created below only on the first request after deployment.
  }
  await env.CATALOG_DB.batch([
    env.CATALOG_DB.prepare("CREATE TABLE IF NOT EXISTS catalog_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)"),
    env.CATALOG_DB.prepare("CREATE TABLE IF NOT EXISTS catalog_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)"),
    env.CATALOG_DB.prepare("CREATE TABLE IF NOT EXISTS catalog_categories (id TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)"),
    env.CATALOG_DB.prepare("CREATE TABLE IF NOT EXISTS catalog_teams (id TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)"),
    env.CATALOG_DB.prepare("CREATE TABLE IF NOT EXISTS catalog_products (id TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)"),
    env.CATALOG_DB.prepare("CREATE INDEX IF NOT EXISTS idx_catalog_products_updated ON catalog_products(updated_at)")
  ]);
  const completed = await env.CATALOG_DB.prepare("SELECT value FROM catalog_meta WHERE key = ?").bind("normalized-storage-v1").first();
  if (completed) return;
  // The legacy table remains untouched as a recoverable source after migration.
  let legacyResults = [];
  const legacyTable = await env.CATALOG_DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='catalog_state'").first();
  if (legacyTable) {
    const legacy = await env.CATALOG_DB.prepare("SELECT key,value FROM catalog_state").all();
    legacyResults = legacy.results || [];
  }
  const values = Object.fromEntries(legacyResults.map(row => [row.key, JSON.parse(row.value)]));
  const now = Date.now();
  const settings = { ...defaults.settings, ...(values.settings || {}) };
  const collections = { categories: values.categories?.length ? values.categories : defaults.categories, teams: values.teams || [], products: values.products || [] };
  const statements = [env.CATALOG_DB.prepare("INSERT INTO catalog_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").bind("store", JSON.stringify(settings), now)];
  for (const collection of Object.keys(collections)) for (const record of collections[collection]) if (record?.id) statements.push(env.CATALOG_DB.prepare(`INSERT INTO ${tableFor(collection)}(id,value,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`).bind(record.id, JSON.stringify(record), now));
  await runInChunks(env, statements);
  await env.CATALOG_DB.prepare("INSERT INTO catalog_meta(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").bind("normalized-storage-v1", "complete", now).run();
}

async function ensureColumn(env, table, name, definition) {
  const result = await env.CATALOG_DB.prepare(`PRAGMA table_info(${table})`).all();
  const columns = new Set((result.results || []).map(column => column.name));
  if (!columns.has(name)) {
    try { await env.CATALOG_DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`).run(); }
    catch (error) {
      const latest = await env.CATALOG_DB.prepare(`PRAGMA table_info(${table})`).all();
      if (!(latest.results || []).some(column => column.name === name)) throw error;
    }
  }
}

async function ensureQueryStorage(env) {
  const completed = await env.CATALOG_DB.prepare("SELECT value FROM catalog_meta WHERE key = ?").bind("query-storage-v2").first();
  if (completed) return;
  await ensureColumn(env, "catalog_products", "team_id", "TEXT");
  await ensureColumn(env, "catalog_products", "order_value", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(env, "catalog_products", "featured", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(env, "catalog_products", "featured_order", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(env, "catalog_products", "search_text", "TEXT NOT NULL DEFAULT ''");
  await ensureColumn(env, "catalog_teams", "category_id", "TEXT");
  await ensureColumn(env, "catalog_teams", "group_name", "TEXT NOT NULL DEFAULT ''");
  await ensureColumn(env, "catalog_teams", "order_value", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(env, "catalog_teams", "hidden", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(env, "catalog_teams", "featured", "INTEGER NOT NULL DEFAULT 0");
  await env.CATALOG_DB.batch([
    env.CATALOG_DB.prepare("UPDATE catalog_products SET team_id=json_extract(value,'$.teamKey'), order_value=COALESCE(json_extract(value,'$.order'),0), featured=CASE WHEN json_extract(value,'$.featured') IN (1,'true') THEN 1 ELSE 0 END, featured_order=COALESCE(json_extract(value,'$.featuredOrder'),0), search_text=LOWER(COALESCE(json_extract(value,'$.name'),'') || ' ' || COALESCE(json_extract(value,'$.reference'),'') || ' ' || COALESCE(json_extract(value,'$.teamName'),''))"),
    env.CATALOG_DB.prepare("UPDATE catalog_teams SET category_id=json_extract(value,'$.categoryId'), group_name=COALESCE(json_extract(value,'$.group'),''), order_value=COALESCE(json_extract(value,'$.order'),0), hidden=CASE WHEN json_extract(value,'$.hidden') IN (1,'true') THEN 1 ELSE 0 END, featured=CASE WHEN json_extract(value,'$.featured') IN (1,'true') THEN 1 ELSE 0 END"),
    env.CATALOG_DB.prepare("CREATE INDEX IF NOT EXISTS idx_catalog_products_team_order ON catalog_products(team_id,order_value,updated_at)"),
    env.CATALOG_DB.prepare("CREATE INDEX IF NOT EXISTS idx_catalog_products_featured ON catalog_products(featured,featured_order,updated_at)"),
    env.CATALOG_DB.prepare("CREATE INDEX IF NOT EXISTS idx_catalog_teams_scope ON catalog_teams(category_id,group_name,hidden,featured,order_value)")
  ]);
  await env.CATALOG_DB.prepare("INSERT INTO catalog_meta(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").bind("query-storage-v2", "complete", Date.now()).run();
}

async function ensureStorage(env) {
  await ensureNormalizedStorage(env);
  await ensureQueryStorage(env);
}

async function readCollection(env, collection) {
  const result = await env.CATALOG_DB.prepare(`SELECT value FROM ${tableFor(collection)} ORDER BY updated_at ASC`).all();
  return (result.results || []).map(row => JSON.parse(row.value));
}

async function readState(env) {
  await ensureStorage(env);
  const [settingsRow, categories, teams, products] = await Promise.all([
    env.CATALOG_DB.prepare("SELECT value FROM catalog_settings WHERE key = ?").bind("store").first(),
    readCollection(env, "categories"), readCollection(env, "teams"), readCollection(env, "products")
  ]);
  return { settings: { ...defaults.settings, ...(settingsRow ? JSON.parse(settingsRow.value) : {}) }, categories: categories.length ? categories : defaults.categories, teams, products };
}

async function save(env, collection, value) {
  await ensureStorage(env);
  const now = Date.now();
  if (collection === "settings") {
    await env.CATALOG_DB.prepare("INSERT INTO catalog_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").bind("store", JSON.stringify(value), now).run();
    return;
  }
  if (!normalizedCollections.has(collection) || !value?.id) throw new Error("Colecao ou registro invalido.");
  if (collection === "products") {
    const searchText = [value.name, value.reference, value.teamName].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
    await env.CATALOG_DB.prepare("INSERT INTO catalog_products(id,value,updated_at,team_id,order_value,featured,featured_order,search_text) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, team_id=excluded.team_id, order_value=excluded.order_value, featured=excluded.featured, featured_order=excluded.featured_order, search_text=excluded.search_text")
      .bind(value.id, JSON.stringify(value), now, value.teamKey || null, Number(value.order) || 0, value.featured ? 1 : 0, Number(value.featuredOrder) || 0, searchText).run();
    return;
  }
  if (collection === "teams") {
    await env.CATALOG_DB.prepare("INSERT INTO catalog_teams(id,value,updated_at,category_id,group_name,order_value,hidden,featured) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, category_id=excluded.category_id, group_name=excluded.group_name, order_value=excluded.order_value, hidden=excluded.hidden, featured=excluded.featured")
      .bind(value.id, JSON.stringify(value), now, value.categoryId || null, value.group || "", Number(value.order) || 0, value.hidden ? 1 : 0, value.featured ? 1 : 0).run();
    return;
  }
  await env.CATALOG_DB.prepare(`INSERT INTO ${tableFor(collection)}(id,value,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`).bind(value.id, JSON.stringify(value), now).run();
}

async function remove(env, collection, id) {
  await ensureStorage(env);
  if (!normalizedCollections.has(collection)) throw new Error("Colecao invalida.");
  await env.CATALOG_DB.prepare(`DELETE FROM ${tableFor(collection)} WHERE id = ?`).bind(id).run();
}

async function readRecord(env, collection, id) {
  await ensureStorage(env);
  if (!normalizedCollections.has(collection)) return null;
  const row = await env.CATALOG_DB.prepare(`SELECT value FROM ${tableFor(collection)} WHERE id = ?`).bind(id).first();
  return row ? JSON.parse(row.value) : null;
}

async function readBootstrap(env) {
  await ensureStorage(env);
  const [settingsRow, categories, teams] = await Promise.all([
    env.CATALOG_DB.prepare("SELECT value FROM catalog_settings WHERE key = ?").bind("store").first(),
    readCollection(env, "categories"),
    env.CATALOG_DB.prepare("SELECT t.value, (SELECT json_extract(p.value,'$.images[0]') FROM catalog_products p WHERE p.team_id = t.id ORDER BY p.order_value ASC, p.updated_at ASC LIMIT 1) AS fallback_image FROM catalog_teams t JOIN catalog_categories c ON c.id = t.category_id WHERE t.hidden = 0 AND COALESCE(json_extract(c.value,'$.hidden'),0) NOT IN (1,'true') ORDER BY t.featured DESC, t.order_value ASC, t.updated_at ASC").all()
  ]);
  return {
    settings: { ...defaults.settings, ...(settingsRow ? JSON.parse(settingsRow.value) : {}) },
    categories: (categories.length ? categories : defaults.categories).filter(category => !category.hidden),
    teams: (teams.results || []).map(row => ({ ...JSON.parse(row.value), fallbackImage: parseStoredMedia(row.fallback_image) }))
  };
}

async function readProductsPage(env, url) {
  await ensureStorage(env);
  const limit = Math.min(48, Math.max(1, Math.floor(Number(url.searchParams.get("limit"))) || 24));
  const offsetValue = Number(url.searchParams.get("offset"));
  const offset = Number.isFinite(offsetValue) ? Math.max(0, Math.floor(offsetValue)) : 0;
  const teamId = url.searchParams.get("teamId") || "";
  const categoryId = url.searchParams.get("categoryId") || "";
  const group = url.searchParams.get("group") || "";
  const featuredOnly = url.searchParams.get("featured") === "1";
  const productId = url.searchParams.get("id") || "";
  const query = String(url.searchParams.get("query") || "").trim().toLocaleLowerCase("pt-BR");
  const conditions = ["t.hidden = 0", "COALESCE(json_extract(c.value,'$.hidden'),0) NOT IN (1,'true')"];
  const values = [];
  if (productId) { conditions.push("p.id = ?"); values.push(productId); }
  if (teamId) { conditions.push("p.team_id = ?"); values.push(teamId); }
  if (categoryId) { conditions.push("t.category_id = ?"); values.push(categoryId); }
  if (group) { conditions.push("t.group_name = ?"); values.push(group); }
  for (const [parameter, field] of [["league", "league"], ["kind", "kind"]]) {
    const value = url.searchParams.get(parameter);
    if (value) { conditions.push("json_extract(t.value, '$." + field + "') = ?"); values.push(value); }
  }
  const variant = url.searchParams.get("variant");
  if (variant) { conditions.push("EXISTS (SELECT 1 FROM json_each(p.value, '$.tags') WHERE value = ?)"); values.push(variant); }
  if (featuredOnly) conditions.push("p.featured = 1");
  if (query) { conditions.push("p.search_text LIKE ?"); values.push(`%${query}%`); }
  const order = featuredOnly
    ? "p.featured_order ASC, p.order_value ASC, p.updated_at ASC"
    : "p.featured DESC, p.order_value ASC, p.updated_at DESC";
  const sql = `SELECT p.value FROM catalog_products p JOIN catalog_teams t ON t.id = p.team_id JOIN catalog_categories c ON c.id = t.category_id WHERE ${conditions.join(" AND ")} ORDER BY ${order} LIMIT ? OFFSET ?`;
  const result = await env.CATALOG_DB.prepare(sql).bind(...values, limit + 1, offset).all();
  const rows = result.results || [];
  return {
    items: rows.slice(0, limit).map(row => JSON.parse(row.value)),
    hasMore: rows.length > limit,
    nextOffset: rows.length > limit ? offset + limit : null
  };
}

const sessionCookieName = "camisa10_admin";

function constantTimeEqual(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index++) difference |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  return difference === 0;
}

function cookieValue(request, name) {
  const prefix = name + "=";
  return String(request.headers.get("cookie") || "").split(";").map(part => part.trim()).find(part => part.startsWith(prefix))?.slice(prefix.length) || "";
}

async function sessionToken(env) {
  const bytes = new TextEncoder().encode("camisa10-admin-session:" + env.ADMIN_PASSWORD);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return btoa(String.fromCharCode(...digest)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function isAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const password = request.headers.get("x-admin-password");
  if (password && constantTimeEqual(password, env.ADMIN_PASSWORD)) return true;
  const cookie = cookieValue(request, sessionCookieName);
  return Boolean(cookie) && constantTimeEqual(cookie, await sessionToken(env));
}

function filesOf(product) {
  return [...(product.images || []), product.video, product.pdf].filter(Boolean);
}

function mediaOfRecord(collection, record) {
  if (!record) return [];
  if (collection === "products") return filesOf(record);
  if (collection === "teams") return [record.showcaseImage, record.logoImage].filter(Boolean);
  return [];
}

async function removeUnusedMedia(env, collection, oldRecord, newRecord) {
  const retained = new Set(mediaOfRecord(collection, newRecord).map(file => file.objectKey).filter(Boolean));
  for (const file of mediaOfRecord(collection, oldRecord)) if (file.objectKey && !retained.has(file.objectKey)) await env.CATALOG_MEDIA.delete(file.objectKey);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/catalog" && request.method === "GET") {
      try { return json(await readState(env)); }
      catch { return fail("Banco ainda nao foi vinculado ao Worker.", 503); }
    }

    if (path === "/api/catalog/bootstrap" && request.method === "GET") {
      try { return json(await readBootstrap(env)); }
      catch { return fail("Nao foi possivel carregar a organizacao do catalogo.", 503); }
    }

    if (path === "/api/catalog/products" && request.method === "GET") {
      try { return json(await readProductsPage(env, url)); }
      catch { return fail("Nao foi possivel carregar as camisetas.", 503); }
    }

    if (path.startsWith("/media/") && request.method === "GET") {
      let key;
      try { key = decodeURIComponent(path.slice(7)); } catch { return fail("Endereco invalido", 400); }
      let object = await env.CATALOG_MEDIA.get(key);
      if (!object && (key.startsWith("yupoo/") || key.startsWith("brands/"))) {
        // Only registered source images may be copied. Never proxy arbitrary URLs.
        let source;
        try { source = await env.CATALOG_DB.prepare("SELECT source_url FROM catalog_import_media WHERE object_key = ?").bind(key).first(); }
        catch { return new Response("Imagem nao cadastrada", { status: 404 }); }
        if (!source) return new Response("Imagem nao cadastrada", { status: 404 });
        const origin = new URL(source.source_url);
        const validSource = key.startsWith("yupoo/") ? origin.hostname === "photo.yupoo.com" && ["/minkang/", "/05941188/", "/guoshuzhen7788/"].some(prefix => origin.pathname.startsWith(prefix)) : ["a.espncdn.com", "thumb.wikimedia.org", "upload.wikimedia.org"].includes(origin.hostname);
        if (origin.protocol !== "https:" || !validSource) return fail("Origem invalida", 400);
        try {
          const upstream = await fetch(origin.href, { headers: { "Referer": origin.pathname.startsWith("/guoshuzhen7788/") ? "https://guoshuzhen7788.x.yupoo.com/" : origin.pathname.startsWith("/05941188/") ? "https://05941188.x.yupoo.com/" : "https://minkang.x.yupoo.com/", "User-Agent": "Mozilla/5.0" }, redirect: "manual", signal: AbortSignal.timeout(15000) });
          const type = (upstream.headers.get("content-type") || "").split(";")[0];
          if (!upstream.ok || !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(type)) return new Response("Foto temporariamente indisponivel", {status:502,headers:{"cache-control":"no-store"}});
          const max = 8 * 1024 * 1024;
          if (Number(upstream.headers.get("content-length")) > max) return fail("Imagem muito grande", 413);
          const reader = upstream.body.getReader(); const chunks = []; let size = 0;
          while (true) { const {done,value} = await reader.read(); if (done) break; size += value.length; if (size > max) { await reader.cancel(); return fail("Imagem muito grande",413); } chunks.push(value); }
          const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
          await env.CATALOG_MEDIA.put(key, bytes, {httpMetadata:{contentType:type}});
          return new Response(bytes, {headers:{"content-type":type,"cache-control":"public,max-age=31536000,immutable","x-content-type-options":"nosniff"}});
        } catch { return new Response("Foto temporariamente indisponivel. Tente novamente.", {status:502,headers:{"cache-control":"no-store"}}); }
      }
      return object
        ? new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType || "application/octet-stream", "cache-control": "public,max-age=31536000,immutable", "x-content-type-options":"nosniff" } })
        : new Response("Nao encontrado", { status: 404 });
    }

    if (path.startsWith("/api/admin/")) {
      if (path === "/api/admin/session" && request.method === "POST") {
        if (!env.ADMIN_PASSWORD || !constantTimeEqual(request.headers.get("x-admin-password"), env.ADMIN_PASSWORD)) return fail("Senha administrativa invalida ou nao configurada.", 401);
        const response = json({ ok: true });
        response.headers.set("set-cookie", `${sessionCookieName}=${await sessionToken(env)}; Path=/; HttpOnly; Secure; SameSite=Strict`);
        return response;
      }
      if (path === "/api/admin/session" && request.method === "DELETE") {
        const response = json({ ok: true });
        response.headers.set("set-cookie", `${sessionCookieName}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
        return response;
      }
      if (!(await isAdmin(request, env))) return fail("Senha administrativa invalida ou sessao encerrada.", 401);
      if (path === "/api/admin/session" && request.method === "GET") return json({ ok: true });
      if (path === "/api/admin/state" && request.method === "GET") {
        try { return json(await readState(env)); }
        catch { return fail("Nao foi possivel carregar os dados administrativos.", 503); }
      }

      if (path === "/api/admin/upload" && request.method === "POST") {
        const file = (await request.formData()).get("file");
        if (!(file instanceof File)) return fail("Arquivo ausente.");
        const allowed = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "application/pdf"];
        if (!allowed.includes(file.type)) return fail("Formato nao permitido.");
        const limit = file.type.startsWith("video/") ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
        if (file.size > limit) return fail("Arquivo maior que o limite.");
        const objectKey = `uploads/${crypto.randomUUID()}-${safeKey(file.name)}`;
        await env.CATALOG_MEDIA.put(objectKey, file.stream(), { httpMetadata: { contentType: file.type } });
        return json({ name: file.name, objectKey, url: `/media/${encodeURIComponent(objectKey)}` });
      }

      const match = path.match(/^\/api\/admin\/(settings|categories|teams|products)(?:\/([^/]+))?$/);
      if (!match) return fail("Rota nao encontrada.", 404);
      const [, collection, encodedId] = match;

      if (request.method === "PUT") {
        const value = await request.json();
        if (collection === "settings") {
          await save(env, collection, { ...defaults.settings, ...value });
          return json({ ok: true });
        }
        const previous = await readRecord(env, collection, value.id);
        await save(env, collection, value);
        if ((collection === "products" || collection === "teams") && previous) await removeUnusedMedia(env, collection, previous, value);
        return json({ ok: true, value });
      }

      if (collection === "categories" && request.method === "POST") {
        const categories = await request.json();
        if (!Array.isArray(categories)) return fail("Categorias invalidas.");
        await runInChunks(env, categories.filter(category => category?.id).map(category => env.CATALOG_DB.prepare("INSERT INTO catalog_categories(id,value,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").bind(category.id, JSON.stringify(category), Date.now())));
        return json({ ok: true });
      }

      if (encodedId && request.method === "DELETE") {
        const id = decodeURIComponent(encodedId);
        const record = await readRecord(env, collection, id);
        if (!record) return fail("Registro nao encontrado.", 404);
        for (const file of mediaOfRecord(collection, record)) if (file.objectKey) await env.CATALOG_MEDIA.delete(file.objectKey);
        await remove(env, collection, id);
        return json({ ok: true });
      }

      return fail("Metodo nao permitido.", 405);
    }

    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) return asset;
    return path.includes(".") ? asset : env.ASSETS.fetch(new Request(new URL("/index.html", url), request));
  }
};
