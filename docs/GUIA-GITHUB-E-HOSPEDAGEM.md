# Guia de GitHub e hospedagem

GitHub e hospedagem têm responsabilidades diferentes:

- **GitHub** guarda o código e o histórico de alterações.
- **Hospedagem** executa a loja, guarda variáveis privadas e protege o painel.

## Etapa 1 — preparar o repositório local

Antes do primeiro envio, confirme:

```bash
npm run types:bindings
npm run typecheck
npm test
git status
```

Revise a lista mostrada por `git status`. O arquivo `.dev.vars` não pode
aparecer nela como arquivo a ser enviado.

## Etapa 2 — criar o repositório no GitHub

1. Entre em [GitHub](https://github.com) com sua conta.
2. Clique em **New repository**.
3. Use um nome claro, como `camisa10-loja`.
4. Escolha **Private** enquanto o projeto estiver em desenvolvimento.
5. Não crie README, `.gitignore` ou licença pelo GitHub, pois eles já existem
   localmente.

Após criar, o GitHub mostrará o endereço do repositório. Esse endereço será
conectado ao projeto local no momento de publicar o primeiro commit.

## Etapa 3 — primeiro envio

Só faça esta etapa depois de revisar os arquivos e confirmar que nenhum dado
privado será enviado. O fluxo será:

```bash
git add .
git commit -m "Preparar projeto Camisa 10 para publicação"
git remote add origin URL_DO_REPOSITORIO
git push -u origin master
```

`URL_DO_REPOSITORIO` deve ser substituída pelo endereço criado na sua conta.
Não cole senhas ou tokens em arquivos do projeto.

## Etapa 4 — preparar a hospedagem

Esta etapa é separada do GitHub. Antes de publicar a loja, será preciso:

1. escolher a plataforma compatível com a aplicação;
2. criar o banco de produção e o armazenamento de imagens;
3. criar a configuração de produção sem usar os IDs fictícios locais;
4. cadastrar as variáveis privadas na plataforma;
5. configurar o login que protege `/admin`;
6. testar loja e painel em um endereço de prévia antes do domínio final.

## Segurança do painel

O endereço público da loja será o domínio principal, como `seudominio.com`.
O painel continuará no mesmo domínio, em `seudominio.com/admin`.

A lista de e-mails administrativos deve ficar apenas nas variáveis privadas da
hospedagem. Ela não deve aparecer no código, no README, no GitHub ou no
navegador do cliente.

## O que ainda não deve ser feito

Não publique, não conecte um domínio e não crie recursos de produção antes de
definir a plataforma de hospedagem e a estratégia de login. Esta organização
deixa o projeto pronto para essa próxima decisão, mas não realiza o deploy.
