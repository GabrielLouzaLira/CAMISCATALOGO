import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
const root=new URL('../',import.meta.url);
const rows=JSON.parse(gunzipSync(await readFile(new URL('catalog-import/pricing/prices.json.gz',root))));
const q=s=>"'"+s.replaceAll("'","''")+"'";
const sql=rows.map(p=>{
  if(!Number.isFinite(p.price)||p.price<0||typeof p.priceLongSleeve!=='boolean')throw Error('Invalid price record');
  return `UPDATE catalog_products SET value=json_set(value,'$.price',${p.price},'$.priceLongSleeve',json('${p.priceLongSleeve}')) WHERE id=${q(p.id)} AND json_extract(value,'$.price') IS NULL;`;
});
const fields={extraLongSleeve:20,extraPersonalization:30,extra2GG:15,extra3GG:20,extra4GG:25};
for(const [key,value] of Object.entries(fields))sql.push(`UPDATE catalog_settings SET value=json_set(value,'$.${key}',${value}) WHERE key='store' AND json_extract(value,'$.${key}') IS NULL;`);
await mkdir(new URL('.import-sql/',root),{recursive:true});
await writeFile(new URL('.import-sql/pricing.sql',root),sql.join('\n'));
console.log('Prepared prices:',rows.length);
