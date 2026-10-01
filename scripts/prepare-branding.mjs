import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const sources=JSON.parse(await readFile(resolve(root,'catalog-import/branding-sources.json'),'utf8'));
const teams=JSON.parse(await readFile(resolve(root,'catalog-import/teams.json'),'utf8'));
const branding={}; const sql=[];
const quote=value=>"'"+value.replaceAll("'","''")+"'";
for(const team of teams){
 const source=sources[team.id];if(!source)throw Error('Missing symbol: '+team.name);
 const url=new URL(source.url);
 if(url.protocol!=='https:' || !['a.espncdn.com','thumb.wikimedia.org','upload.wikimedia.org'].includes(url.hostname))throw Error('Invalid symbol origin: '+team.name);
 const key='brands/'+createHash('sha256').update(source.url).digest('hex').slice(0,32)+'.png';
 branding[team.id]={image:'/media/'+key,...(source.color&&/^[a-f0-9]{6}$/i.test(source.color)?{color:'#'+source.color}:{})};
 sql.push(`INSERT INTO catalog_import_media(object_key,source_url) VALUES(${quote(key)},${quote(source.url)}) ON CONFLICT(object_key) DO UPDATE SET source_url=excluded.source_url;`);
}
await mkdir(resolve(root,'.import-sql'),{recursive:true});
await writeFile(resolve(root,'.import-sql/branding.sql'),sql.join('\n'));
await writeFile(resolve(root,'team-branding.json'),JSON.stringify(branding,null,2));
console.log('Symbols prepared: '+Object.keys(branding).length);
