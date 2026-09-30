# Camisa 10 — loja e painel administrativo

Aplicação de venda de camisetas com vitrine pública e painel administrativo
protegido. A loja recebe pedidos pelo site e prepara a conversa com o cliente
no WhatsApp; pagamentos não são processados pelo site neste momento.

O painel fica em `/admin` e permite administrar produtos, imagens, categorias,
estoque, pedidos, configurações e resumo de vendas.

## Recursos principais

- vitrine pública com busca, filtros e páginas de produto;
- galeria de imagens, tamanhos, cores, estoque e personalização opcional;
- carrinho temporário salvo no navegador;
- pedido registrado antes da abertura do WhatsApp;
- reserva temporária de estoque para evitar duas vendas da mesma peça;
- cancelamento, devolução e recriação segura de pedidos;
- painel responsivo em `/admin`;
- imagens de produtos armazenadas em R2;
- resumo de caixa e histórico mensal de vendas.

## Estrutura e publicação

- [Estrutura das pastas](docs/ESTRUTURA-DO-PROJETO.md)
- [Guia de GitHub e hospedagem](docs/GUIA-GITHUB-E-HOSPEDAGEM.md)

## Requisitos locais

- Node.js `>=22.13.0`;
- banco D1 e armazenamento R2 locais, configurados em `wrangler.local.jsonc`;
- um arquivo `.dev.vars` criado a partir de `.dev.vars.example`.

## Como executar localmente

```bash
npm ci
copy .dev.vars.example .dev.vars
npm run types:bindings
npm run dev
```

Abra a loja no endereço indicado pelo terminal. O painel administrativo fica em
`/admin`.

`ADMIN_EMAIL_ALLOWLIST` aceita um ou mais e-mails separados por vírgula. Nunca
coloque e-mails autorizados, senhas, tokens ou chaves em arquivos enviados ao
GitHub. O `.dev.vars` é local e está ignorado pelo Git; apenas
`.dev.vars.example` pode ser versionado.

## Pedidos e estoque

1. O comprador escolhe produtos e informa seus dados.
2. O servidor confirma preço e disponibilidade atuais.
3. Ao registrar o pedido, o estoque fica reservado temporariamente.
4. O painel confirma a venda sem realizar uma segunda baixa.
5. Cancelamentos e devoluções devolvem as unidades correspondentes ao estoque.
6. Reservas que vencem são liberadas pelo sistema para que as peças voltem a
   ficar disponíveis.

## Testes e verificações

```bash
npm run lint
npm run types:bindings
npm run typecheck
npm run build
npm test
```

Os testes incluem regras de preço, pedido, estoque, reserva, devolução,
imagens, autenticação administrativa, migrações e renderização da interface.

## Antes de publicar

O arquivo `wrangler.local.jsonc` usa recursos locais fictícios e não serve como
configuração de produção. Na hospedagem será necessário criar os recursos reais
de banco e imagens, cadastrar variáveis privadas e configurar a autenticação do
painel. O guia de publicação explica a separação entre essas etapas.
