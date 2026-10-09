import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import vm from "node:vm";

const source = await readFile(new URL("../worker-source.js", import.meta.url), "utf8");
const { default: worker } = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
const sql = new DatabaseSync(":memory:");
const db = {
  prepare(query) {
    return {
      args: [],
      bind(...args) { this.args = args; return this; },
      async first() { return sql.prepare(query).get(...this.args) || null; },
      async all() { return { results: sql.prepare(query).all(...this.args) }; },
      async run() { sql.prepare(query).run(...this.args); return { success: true }; }
    };
  },
  async batch(statements) {
    sql.exec("BEGIN");
    try { const results = []; for (const statement of statements) results.push(await statement.run()); sql.exec("COMMIT"); return results; }
    catch (error) { sql.exec("ROLLBACK"); throw error; }
  }
};
const env = { CATALOG_DB: db, ADMIN_PASSWORD: "local-test", CATALOG_MEDIA: { async delete() {} } };
async function request(path, method = "GET", body, authorized = false, extraHeaders = {}) {
  return worker.fetch(new Request("http://local.test" + path, {
    method, headers: { "content-type": "application/json", ...(authorized ? { "x-admin-password": "local-test" } : {}), ...extraHeaders },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  }), env);
}
async function put(collection, value) {
  const response = await request("/api/admin/" + collection, "PUT", value, true);
  assert.equal(response.status, 200);
}

assert.equal((await request("/api/catalog/bootstrap")).status, 200, "fresh database initializes");
await put("teams", { id: "a", categoryId: "futebol", name: "Equipe A", group: "Liga", hidden: false });
await put("teams", { id: "b", categoryId: "basquete", name: "Equipe B", group: "NBA", hidden: false });
for (let index = 0; index < 53; index++) {
  await put("products", { id: "p" + index, teamKey: "a", name: "Camisa " + index, order: index, images: [{ url: "/media/test.jpg" }] });
}
await put("products", { id: "basket", teamKey: "b", name: "Regata", images: [] });
const first = await (await request("/api/catalog/products?teamId=a&limit=48")).json();
const second = await (await request("/api/catalog/products?teamId=a&limit=48&offset=48")).json();
assert.equal(first.items.length, 48);
assert.equal(first.hasMore, true);
assert.equal(second.items.length, 5);
assert.equal(second.hasMore, false);
assert.equal(new Set([...first.items, ...second.items].map(item => item.id)).size, 53);
assert.equal((await (await request("/api/catalog/products?categoryId=basquete&group=NBA")).json()).items[0].id, "basket");
await put("categories", { id: "basquete", title: "Basquete", hidden: true });
assert.equal((await (await request("/api/catalog/products?teamId=b")).json()).items.length, 0);
assert.equal((await (await request("/api/catalog/bootstrap")).json()).teams.some(team => team.id === "b"), false);
assert.equal((await request("/api/admin/state")).status, 401);
assert.equal((await request("/api/admin/state", "GET", undefined, true)).status, 200);
const login = await request("/api/admin/session", "POST", undefined, true);
assert.equal(login.status, 200);
const setCookie = login.headers.get("set-cookie");
assert.match(setCookie, /^camisa10_admin=[^;]+; Path=\/; HttpOnly; Secure; SameSite=Strict$/);
const sessionCookie = setCookie.split(";")[0];
assert.equal((await request("/api/admin/session", "GET", undefined, false, { cookie: sessionCookie })).status, 200);
assert.equal((await request("/api/admin/state", "GET", undefined, false, { cookie: sessionCookie })).status, 200);
const logout = await request("/api/admin/session", "DELETE", undefined, false, { cookie: sessionCookie });
assert.equal(logout.status, 200);
assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
// Re-run query migration against existing records and preserve complete JSON media.
sql.prepare("DELETE FROM catalog_meta WHERE key=?").run("query-storage-v2");
const before = sql.prepare("SELECT value FROM catalog_products WHERE id='p0'").get().value;
assert.equal((await request("/api/catalog/bootstrap")).status, 200);
assert.equal(sql.prepare("SELECT value FROM catalog_products WHERE id='p0'").get().value, before);
assert.equal(sql.prepare("SELECT COUNT(*) AS count FROM catalog_products").get().count, 54);

// Execute UI logic with a minimal DOM and controlled responses to test races.
const app = (await readFile(new URL("../app-v3.js", import.meta.url), "utf8")).split('document.addEventListener("click"')[0];
const nodes = new Map();
const context = vm.createContext({
  document: { activeElement: null, addEventListener() {}, querySelector(selector) {
    if (selector === "#team-search") return null;
    if (!nodes.has(selector)) nodes.set(selector, { open: false, innerHTML: "", textContent: "", value: "" });
    return nodes.get(selector);
  }, querySelectorAll() { return []; } },
  window: { scrollTo() {} }, setTimeout, clearTimeout, URLSearchParams, console
});
vm.runInContext(await readFile(new URL('../pricing.js', import.meta.url), 'utf8'), context);
vm.runInContext(app, context);
await vm.runInContext(`
  (async () => {
    data = { settings: {}, categories: [{id:"futebol",title:"Futebol"}], teams: [
      {id:"a",categoryId:"futebol",name:"A",group:"Liga"},
      {id:"b",categoryId:"futebol",name:"B",group:"Liga"}
    ] };
    const pending = [];
    fetchProducts = params => new Promise(resolve => pending.push({params,resolve}));
    const firstLoad = openTeamProducts("a");
    const secondLoad = openTeamProducts("b");
    pending[1].resolve({items:[{id:"b1"}],hasMore:true});
    await secondLoad;
    pending[0].resolve({items:[{id:"a1"}],hasMore:false});
    await firstLoad;
    if (view.teamId !== "b" || view.items[0].id !== "b1") throw Error("stale team response replaced current team");
    const more = openTeamProducts("b", true);
    if (pending[2].params.offset !== 1) throw Error("pagination offset is incorrect");
    pending[2].resolve({items:[{id:"b2"}],hasMore:false});
    await more;
    if (view.items.length !== 2) throw Error("pagination failed to append");
    view = {name:"search",query:"old",items:[]};
    const oldSearch = performSearch("old");
    view.query = "new";
    const newSearch = performSearch("new");
    pending[4].resolve({items:[{id:"new"}]}); await newSearch;
    pending[3].resolve({items:[{id:"old"}]}); await oldSearch;
    if (view.items[0].id !== "new") throw Error("stale search response replaced results");
    discovery = {categoryId:"futebol",group:"Liga",teamId:"a",items:[],loading:false};
    const rendered = renderDiscovery();
    if (!rendered.includes("crest-roster") || !rendered.includes('data-team="a"') || !rendered.includes("VER CAMISAS DA EQUIPE")) throw Error("team selection and confirmation missing");
    data.teams = Array.from({length:25},(_,i)=>({id:'club'+i,name:'Clube '+i,categoryId:'futebol',group:'Brasil',kind:'clubes',league:'Clubes'}));
    data.teams.push({id:'nation',name:'Brasil',categoryId:'futebol',group:'Brasil',kind:'selecoes',league:'Seleções'});
    productCovers={coverTest:'/front.jpg'};
    const coverProduct={id:'coverTest',images:[{url:'/back.jpg'},{url:'/front.jpg'},{url:'/detail.jpg'}]};
    mergeProducts([coverProduct]);
    if (coverProduct.images[0].url!=='/front.jpg' || coverProduct.images.length!==3) throw Error('cover selection must preserve the complete gallery');
    mergeProducts([coverProduct]);
    if (coverProduct.images[1].url!=='/back.jpg') throw Error('cover ordering must be stable');
    teamBranding = {club24:{image:'/media/brands/crest.png'}};
    discovery = {categoryId:'futebol',group:'Brasil',kind:'clubes',teamId:'club24',items:[],loading:false};
    const secondRoster = renderDiscovery();
    if (!secondRoster.includes('data-discovery-team="club24"') || secondRoster.includes('data-discovery-team="club0"') || secondRoster.includes('data-discovery-team="nation"')) throw Error('roster pagination or club isolation failed');
    if (!secondRoster.includes('/media/brands/crest.png')) throw Error('crest missing from team selection');
    discovery.kind='selecoes'; discovery.teamId='nation';
    discovery.group='';
    data.teams.push({id:'argentina',name:'Argentina',categoryId:'futebol',group:'Argentina',kind:'selecoes',league:'Seleções'});
    const nationalRoster=renderDiscovery();
    if (!nationalRoster.includes('data-discovery-team="argentina"') || nationalRoster.includes('aria-label="Equipes de Brasil"') || nationalRoster.includes('aria-label="Equipes de Argentina"') || !nationalRoster.includes('<label hidden>PAÍS')) throw Error('national teams must share one roster without country filter');
    if (!nationalRoster.includes('data-discovery-team="nation"') || nationalRoster.includes('data-discovery-team="club24"')) throw Error('national team isolation failed');
  })()
`, context);
await put('teams', {id:'filters', name:'Clube',categoryId:'futebol',group:'Brasil',league:'Liga nacional',kind:'clubes'});
await put('products', {id:'filtered',teamKey:'filters',name:'Kit infantil',tags:['kit','infantil'],images:[]});
assert.equal((await (await request('/api/catalog/products?group=Brasil&league=Liga%20nacional&kind=clubes&variant=infantil')).json()).items[0].id,'filtered');
assert.equal((await (await request('/api/catalog/products?group=Brasil&league=Outra')).json()).items.length,0);
assert.equal((await (await request('/api/catalog/products?group=Brasil&variant=feminino')).json()).items.length,0);
await put('products', {id:'training-filter',teamKey:'filters',name:'Kit treino',tags:['kit','treino','kit-treino'],images:[]});
assert.equal((await (await request('/api/catalog/products?variant=kit-treino')).json()).items[0].id,'training-filter');
sql.exec('CREATE TABLE catalog_import_media(object_key TEXT PRIMARY KEY, source_url TEXT NOT NULL)');
sql.prepare('INSERT INTO catalog_import_media VALUES(?,?)').run('yupoo/test.jpg','https://photo.yupoo.com/minkang/test/big.jpg');
sql.prepare('INSERT INTO catalog_import_media VALUES(?,?)').run('yupoo/nfl.jpg','https://photo.yupoo.com/guoshuzhen7788/test/big.jpeg');
sql.prepare('INSERT INTO catalog_import_media VALUES(?,?)').run('yupoo/training.jpg','https://photo.yupoo.com/dongshanstore/test/big.jpg');
sql.prepare('INSERT INTO catalog_import_media VALUES(?,?)').run('yupoo/shorts.jpg','https://photo.yupoo.com/16620059194/test/big.jpg');
sql.prepare('INSERT INTO catalog_import_media VALUES(?,?)').run('yupoo/nba.jpg','https://photo.yupoo.com/05941188/test/big.jpg');
sql.prepare('INSERT INTO catalog_import_media VALUES(?,?)').run('yupoo/other-supplier.jpg','https://photo.yupoo.com/other/test/big.jpg');
sql.prepare('INSERT INTO catalog_import_media VALUES(?,?)').run('yupoo/blocked.jpg','https://other.example/image.jpg');
sql.prepare('INSERT INTO catalog_import_media VALUES(?,?)').run('brands/crest.png','https://a.espncdn.com/i/teamlogos/soccer/500/819.png');
sql.prepare('INSERT INTO catalog_import_media VALUES(?,?)').run('brands/blocked.png','https://photo.yupoo.com/minkang/test.jpg');
const nativeFetch = globalThis.fetch; let fetches = 0; const cached = new Map();
env.CATALOG_MEDIA = {async get(key) {return cached.get(key)}, async put(key, bytes, metadata) {cached.set(key,{body:bytes,...metadata})}};
try {
  globalThis.fetch = async () => {fetches++; return new Response(new Uint8Array([255,216,255]),{headers:{'content-type':'image/jpeg'}})};
  assert.equal((await request('/media/yupoo/unknown.jpg')).status,404);
  assert.equal((await request('/media/yupoo/blocked.jpg')).status,400);
  assert.equal(fetches,0,'unregistered or foreign sources are never fetched');
  const copied = await request('/media/yupoo/test.jpg');
  assert.equal(copied.status,200); assert.equal(copied.headers.get('content-type'),'image/jpeg');
  assert(cached.has('yupoo/test.jpg'),'first view persists to R2');
  assert.equal((await request('/media/yupoo/test.jpg')).status,200); assert.equal(fetches,1,'repeat view uses R2');
  assert.equal((await request('/media/brands/blocked.png')).status,400);
  assert.equal((await request('/media/brands/crest.png')).status,200);
  assert(cached.has('brands/crest.png'),'brand symbol persists in R2');
  assert.equal((await request('/media/yupoo/nba.jpg')).status,200);
  assert(cached.has('yupoo/nba.jpg'),'NBA first view persists to R2');
  assert.equal((await request('/media/yupoo/nfl.jpg')).status,200);
  assert(cached.has('yupoo/nfl.jpg'),'NFL first view persists to R2');
  assert.equal((await request('/media/yupoo/shorts.jpg')).status,200);
  assert(cached.has('yupoo/shorts.jpg'),'Shorts first view persists to R2');
  assert.equal((await request('/media/yupoo/training.jpg')).status,200);
  assert(cached.has('yupoo/training.jpg'),'Training first view persists to R2');
  assert.equal((await request('/media/yupoo/other-supplier.jpg')).status,400);
  cached.clear(); globalThis.fetch = async () => new Response('not an image',{headers:{'content-type':'text/html'}});
  assert.equal((await request('/media/yupoo/test.jpg')).status,502); assert.equal(cached.size,0);
  globalThis.fetch = async () => new Response('too big',{headers:{'content-type':'image/jpeg','content-length':'99999999'}});
  assert.equal((await request('/media/yupoo/test.jpg')).status,413); assert.equal(cached.size,0);
} finally {globalThis.fetch = nativeFetch;}

console.log('PASS: pagination, combined filters, admin authorization, stale responses, media allowlist, first-view copy, R2 reuse, MIME and size limits.');
assert.equal((await request('/api/admin/products','PUT',{id:'p0',price:-1},true)).status,400);
assert.equal((await request('/api/admin/products','PUT',{id:'p0',price:1.234},true)).status,400);
assert.equal((await request('/api/admin/settings','PUT',{extraPersonalization:-1},true)).status,400);
const pricedRecord=JSON.parse(sql.prepare("SELECT value FROM catalog_products WHERE id='p0'").get().value);
await put('products',{...pricedRecord,price:165.50,priceLongSleeve:true});
const publicPriced=(await (await request('/api/catalog/products?id=p0')).json()).items[0];
assert.equal(publicPriced.price,165.50);
assert.equal(publicPriced.priceLongSleeve,true);
assert.deepEqual(publicPriced.images,pricedRecord.images);
console.log('PASS: admin price validation, persistence and public API round trip.');

sql.close();
