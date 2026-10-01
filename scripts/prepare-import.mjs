import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const input = resolve(root, 'catalog-import');
const output = resolve(root, '.import-sql');
const read = async name => JSON.parse(await readFile(resolve(input, name), 'utf8'));
const manifest = await read('manifest.json');
const teams = await read('teams.json');
const categories = await read('categories.json');
const source = await readFile(resolve(root, 'worker-source.js'), 'utf8');
const { default: worker } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const sql = new DatabaseSync(':memory:');
const quote = value => value === null ? 'NULL' : typeof value === 'number' ? String(value) : "'" + String(value).replaceAll("'", "''") + "'";
let statements = [];
const db = { prepare(query) { return { args: [], bind(...args) { this.args = args; return this; }, async first() { return sql.prepare(query).get(...this.args) || null; }, async all() { return { results: sql.prepare(query).all(...this.args) }; }, async run() { sql.prepare(query).run(...this.args); let index = 0; statements.push(query.replace(/\?/g, () => quote(this.args[index++])) + ';'); return { success: true }; } }; }, async batch(items) { return Promise.all(items.map(item => item.run())); } };
const env = { CATALOG_DB: db, ADMIN_PASSWORD: 'import-local-only' };
await worker.fetch(new Request('https://local.test/api/catalog/bootstrap'), env);
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'schema-fresh-only.sql'), statements.join('\n'));
statements = [];
async function save(collection, item) {
  const response = await worker.fetch(new Request('https://local.test/api/admin/' + collection, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-admin-password': env.ADMIN_PASSWORD }, body: JSON.stringify(item) }), env);
  assert.equal(response.status, 200, await response.text());
}
const existingSettings = JSON.parse(sql.prepare("SELECT value FROM catalog_settings WHERE key='store'").get().value);
await save('settings', { ...existingSettings, whatsapp: '5518998266308', introText: 'Encontre sua camisa por esporte, país, liga e equipe. Consulte tamanhos, preços e disponibilidade pelo WhatsApp.' });
// Patch only requested fields in an existing store, preserving its other settings.
statements = ["UPDATE catalog_settings SET value=json_set(value,'$.whatsapp','5518998266308','$.initialCategoryId','futebol','$.initialGroup','Brasil','$.introText','Encontre sua camisa por esporte, país, liga e equipe. Consulte tamanhos, preços e disponibilidade pelo WhatsApp.') WHERE key='store';"];
for (const category of categories) await save('categories', category);
// Hide empty starter categories only; never hide an existing populated collection.
for (const id of ['basquete', 'volei', 'nfl']) statements.push(`UPDATE catalog_categories SET value=json_set(value,'$.hidden',json('true')) WHERE id=${quote(id)} AND NOT EXISTS(SELECT 1 FROM catalog_teams WHERE category_id=${quote(id)});`);
for (const team of teams) await save('teams', team);
statements.push('CREATE TABLE IF NOT EXISTS catalog_import_media (object_key TEXT PRIMARY KEY, source_url TEXT NOT NULL);');
await writeFile(resolve(output, '000-settings-teams.sql'), statements.join('\n'));
const teamIds = new Set(teams.map(team => team.id));
const ids = new Set(); const media = new Map(); let photos = 0;
for (const [index, file] of manifest.chunks.entries()) {
  statements = [];
  for (const product of await read(file)) {
    assert(!ids.has(product.id), 'Duplicate product'); ids.add(product.id);
    assert(teamIds.has(product.teamKey), 'Unknown team');
    assert(product.images.length, 'Missing photos');
    for (const image of product.images) {
      const url = new URL(image.sourceUrl);
      assert(url.protocol === 'https:' && url.hostname === 'photo.yupoo.com' && url.pathname.startsWith('/minkang/'));
      assert(/^yupoo\/[a-f0-9]{32}\.(jpe?g|png|gif|webp)$/.test(image.objectKey));
      assert.equal(image.url, '/media/' + image.objectKey);
      assert(!media.has(image.objectKey) || media.get(image.objectKey) === image.sourceUrl, 'Conflicting media key');
      media.set(image.objectKey, image.sourceUrl); photos++;
      statements.push(`INSERT INTO catalog_import_media(object_key,source_url) VALUES(${quote(image.objectKey)},${quote(image.sourceUrl)}) ON CONFLICT(object_key) DO UPDATE SET source_url=excluded.source_url;`);
    }
    // Supplier metadata stays in the repository, not in the public API payload.
    await save('products', { ...product, images: product.images.map(({url}) => ({url})) });
  }
  await writeFile(resolve(output, String(index + 1).padStart(3, '0') + '-products.sql'), statements.join('\n'));
}
assert.equal(ids.size, manifest.products); assert.equal(photos, manifest.photos);
await writeFile(resolve(output, 'import.sql'), (await Promise.all(['000-settings-teams.sql', ...manifest.chunks.map((_, i) => String(i + 1).padStart(3,'0') + '-products.sql')].map(file => readFile(resolve(output,file),'utf8')))).join('\n'));
console.log(JSON.stringify({products: ids.size, teams: teams.length, photos, uniquePhotos: media.size, output}));
