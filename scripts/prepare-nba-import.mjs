import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),dir=resolve(root,'catalog-import',process.argv[2] || 'nba');
const read=async name=>JSON.parse(await readFile(resolve(dir,name),'utf8'));
const manifest=await read('manifest.json'),teams=await read('teams.json'),category=await read('category.json'),brands=await read('branding-sources.json');
const q=v=>"'"+String(v).replaceAll("'","''")+"'",j=JSON.stringify,now=Date.now(),sql=[],ids=new Set(),media=new Map();
sql.push(`INSERT INTO catalog_categories(id,value,updated_at) VALUES(${q(category.id)},${q(j(category))},${now}) ON CONFLICT(id) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at;`);
for(const t of teams)sql.push(`INSERT INTO catalog_teams(id,value,updated_at,category_id,group_name,order_value,hidden,featured) VALUES(${q(t.id)},${q(j(t))},${now},${q(t.categoryId)},${q(t.group)},${t.order},0,0) ON CONFLICT(id) DO NOTHING;`);
for(const b of Object.values(brands)){const u=new URL(b.url);if(!['a.espncdn.com','thumb.wikimedia.org','upload.wikimedia.org'].includes(u.hostname))throw Error('Invalid logo source');media.set('brands/'+createHash('sha256').update(b.url).digest('hex').slice(0,32)+'.png',b.url);}
for(const file of manifest.chunks)for(const p of await read(file)){
 if(ids.has(p.id)||!teams.some(t=>t.id===p.teamKey))throw Error('Duplicate product or missing team');ids.add(p.id);
 for(const im of p.images){const u=new URL(im.sourceUrl);if(u.protocol!=='https:'||u.hostname!=='photo.yupoo.com'||!['/05941188/','/guoshuzhen7788/','/16620059194/'].some(prefix=>u.pathname.startsWith(prefix))||!/^yupoo\/[a-f0-9]{32}\.jpg$/.test(im.objectKey)||im.url!=='/media/'+im.objectKey)throw Error('Invalid imported image');media.set(im.objectKey,im.sourceUrl);}
 const {sourceAlbum,sourceTitle,...item}=p;item.images=p.images.map(({url})=>({url}));
 const search=[p.name,p.reference,p.teamName].join(' ').toLocaleLowerCase('pt-BR');
 sql.push(`INSERT INTO catalog_products(id,value,updated_at,team_id,order_value,featured,featured_order,search_text) VALUES(${q(p.id)},${q(j(item))},${now},${q(p.teamKey)},${p.order},0,0,${q(search)}) ON CONFLICT(id) DO NOTHING;`);
}
if(ids.size!==manifest.products)throw Error('Incomplete manifest');
for(const [key,url]of media)sql.push(`INSERT INTO catalog_import_media(object_key,source_url) VALUES(${q(key)},${q(url)}) ON CONFLICT(object_key) DO NOTHING;`);
await mkdir(resolve(root,'.import-sql'),{recursive:true});await writeFile(resolve(root,'.import-sql/'+(process.argv[2] || 'nba')+'.sql'),sql.join('\n'));
console.log(JSON.stringify({products:ids.size,teams:teams.length,statements:sql.length}));
