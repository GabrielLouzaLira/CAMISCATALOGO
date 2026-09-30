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
sql.close();

// Execute UI logic with a minimal DOM and controlled responses to test races.
const app = (await readFile(new URL("../app-v3.js", import.meta.url), "utf8")).split('document.addEventListener("click"')[0];
const nodes = new Map();
const context = vm.createContext({
  document: { activeElement: null, querySelector(selector) {
    if (selector === "#team-search") return null;
    if (!nodes.has(selector)) nodes.set(selector, { open: false, innerHTML: "", textContent: "", value: "" });
    return nodes.get(selector);
  }, querySelectorAll() { return []; } },
  window: { scrollTo() {} }, setTimeout, clearTimeout, URLSearchParams, console
});
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
    if (!rendered.includes("--offset:0;") || !rendered.includes('data-team="a"')) throw Error("carousel or full team link missing");
  })()
`, context);
console.log("PASS: initialization, migration preservation, pagination (53 products), filters, hidden categories, admin authorization, stale team/search responses and carousel rendering.");
