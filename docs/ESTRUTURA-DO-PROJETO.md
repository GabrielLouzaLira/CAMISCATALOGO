# Estrutura do projeto

Esta é uma visão rápida para localizar cada parte sem precisar procurar em todo
o código.

| Pasta ou arquivo | Para que serve |
| --- | --- |
| `app/` | Páginas da loja, painel administrativo e rotas da aplicação. |
| `app/storefront.tsx` | Vitrine pública, detalhes de produto e carrinho. |
| `app/admin/` | Tela e componentes do painel administrativo. |
| `app/api/` | Rotas usadas pela loja e pelo painel. |
| `db/` | Estrutura do banco e regras de produtos, pedidos e estoque. |
| `drizzle/` | Migrações versionadas do banco de dados. |
| `lib/` | Tipos e funções reutilizáveis, como preço e validação de imagens. |
| `public/` | Arquivos públicos estáticos, quando existirem. |
| `worker/` | Entrada do Worker da aplicação. |
| `tests/` | Testes unitários, de integração e de renderização. |
| `docs/` | Documentação para desenvolvimento, GitHub e hospedagem. |
| `package.json` | Comandos e dependências do projeto. |
| `.dev.vars.example` | Modelo de variáveis locais sem dados privados. |
| `wrangler.local.jsonc` | Configuração exclusiva do ambiente local. |

## O que deve ir ao GitHub

Código, documentação, testes, migrações, `package.json`, `package-lock.json`,
arquivos de configuração e o modelo `.dev.vars.example`.

## O que não deve ir ao GitHub

Arquivos locais com dados privados ou gerados automaticamente, como
`.dev.vars`, `node_modules`, `.wrangler`, `dist`, `worker-configuration.d.ts`,
logs e registros locais do Codex. Essas regras já estão no `.gitignore`.

## Regra simples para mudanças futuras

- Mudança de tela ou funcionalidade: normalmente começa em `app/`.
- Mudança de estoque, pedido ou banco: confira também `db/` e `drizzle/`.
- Nova regra importante: adicione ou ajuste um teste em `tests/`.
- Antes de enviar ao GitHub: rode `npm run types:bindings`, `npm run typecheck`
  e `npm test`.
