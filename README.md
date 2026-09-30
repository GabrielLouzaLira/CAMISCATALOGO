# Camisa 10 - publicacao Cloudflare

O catalogo e o painel usam:
- D1: camisa10-catalogo
- R2: catalogo
- Secret ADMIN_PASSWORD no Worker

Depois do primeiro deploy, vincule no painel Cloudflare:
CATALOG_DB -> D1 camisa10-catalogo
CATALOG_MEDIA -> R2 catalogo

## Navegacao visual do catalogo

- O catalogo usa app-v3.js, com selecao de esporte, liga e equipe.
- Em Esportes e equipes, configure imagem de apresentacao, escudo, cores, ordem, destaque e visibilidade.
- Sem imagem de apresentacao, a equipe utiliza a primeira foto de um produto. Nenhuma imagem de atleta e adicionada automaticamente.
- Configuracoes controla o esporte/liga inicial, quantidade por pagina, indicadores e reproducao automatica.
- A troca de equipe atualiza seus produtos; a pagina da equipe permite carregar os demais modelos.
- O Worker adiciona colunas e indices de consulta preservando o JSON existente. A migracao acontece no primeiro acesso apos uma futura publicacao.

## Verificacao local

Requer Node.js 24 para os testes com SQLite em memoria.

- npm run check: sintaxe dos arquivos.
- npm test: migracao, preservacao de registros, filtros, categorias ocultas, autenticacao, paginacao e respostas atrasadas.
- npm run build: gera os arquivos de publicacao.
- scripts/check-browser.mjs: verificacao opcional com Chrome instalado no Windows e Worker local na porta 8790, usando somente dados ficticios e a credencial local de teste. Nunca executar esse teste contra producao.

Os arquivos .wrangler/ e catalog-*-test.png sao locais e ignorados pelo Git. O build nao publica no Cloudflare. O envio ao GitHub/publicacao e uma etapa separada.

## Conta nova configurada

- Conta Cloudflare: `d713c51f91c9b68f183a3656bf7d5aa4`.
- D1 `camisa10-catalogo`: `0aedf94a-2c7a-4eba-9060-89e8fa97019a`.
- R2: `catalogo`.
- Os bindings CATALOG_DB e CATALOG_MEDIA estao declarados em wrangler.jsonc.
- O banco e o bucket novos nao contem os produtos ou fotos da conta antiga.

## Publicacao na conta nova

1. Execute `npx wrangler login` na conta acima.
2. Execute `npm test` e `npm run build`.
3. Execute `npx wrangler deploy`.
4. Configure a senha do painel com `npx wrangler secret put ADMIN_PASSWORD`.
5. Abra `/admin.html` no endereco exibido pelo deploy e cadastre os produtos e fotos.

As tabelas sao inicializadas automaticamente pelo Worker. A senha, tokens e
backups de dados nunca devem ser enviados ao GitHub. O bucket nao precisa ser
publico: as fotos sao servidas pela rota /media/ do Worker.

Atualizar este repositorio nao publica automaticamente na Cloudflare.
