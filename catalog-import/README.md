# Catálogo importado

Fonte: https://minkang.x.yupoo.com/albums

Publicação: https://repositoriovamisa10.camisa10-gabriellouzalira.workers.dev/

Foram organizados 5.791 modelos de camisas e kits, 392 equipes e 41.536 fotos. Os cinco esportes presentes são futebol, automobilismo, rugby, futebol americano e esportes gaélicos. Países e territórios históricos seguem as coleções da fonte; ligas que misturam divisões são identificadas como coleções regionais, sem afirmar a divisão atual de cada clube.

`manifest.json` contém os totais e a lista de arquivos de produtos. `teams.json` e `categories.json` guardam a organização. Os 696 registros de `review-required.json` têm títulos ambíguos, informações insuficientes ou não permitem identificar com confiança uma camisa ou kit; não foram publicados automaticamente. Não foram importados preços ou estoque.

As fotos não estão incluídas como arquivos binários no Git. Cada produto mantém o endereço público de origem e uma chave determinística. O Worker aceita apenas chaves cadastradas em `catalog_import_media`: na primeira abertura copia a foto para o R2 `catalogo`; nas seguintes utiliza a cópia. Fotos ainda não abertas dependem da disponibilidade da fonte. Não há sincronização automática de novos álbuns.

## Reproduzir a importação

Com Node.js 24, execute `node scripts/prepare-import.mjs`. O script valida referências e URLs e gera SQL em `.import-sql/` (ignorado pelo Git).

Em um banco novo e vazio, execute primeiro `schema-fresh-only.sql`, uma única vez. No banco já inicializado, execute somente `import.sql`:

```sh
npx wrangler d1 execute camisa10-catalogo --remote --file .import-sql/import.sql --yes
```

O SQL atualiza produtos e equipes pelos IDs, preserva outras configurações da loja e não apaga registros alheios à importação. Reimportar atualiza os registros importados, portanto exporte modificações administrativas antes de fazê-lo. Remoções da fonte precisam de revisão explícita; não são propagadas automaticamente.

Execute `npm test`, `npm run check` e `npm run build` antes de publicar com Wrangler. D1 e R2 estão configurados em `wrangler.jsonc`; credenciais não devem ser incluídas no repositório. O acesso administrativo requer configurar o segredo `ADMIN_PASSWORD` na Cloudflare. O catálogo público funciona independentemente desse segredo.
