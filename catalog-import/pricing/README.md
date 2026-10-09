# Preços confirmados pela loja

Tabela aplicada individualmente aos 11.399 produtos existentes em 09/10/2026. Shorts R$120; infantil de camiseta/short R$165; torcedor R$140; retrô R$175; jogador R$190; NBA R$200; NFL R$250; jaquetas/moletons R$270; kits de treino adultos e conjuntos infantis com calça R$350. Os valores das categorias adicionais foram confirmados pelo proprietário. Produtos infantis de futebol têm prioridade sobre retrô/jogador; conjuntos com calça têm prioridade sobre infantil. Blusas de treino avulsas seguem camisa torcedor. Produtos NBA e NFL seguem suas tabelas próprias.

Adicionais: camiseta manga longa R$20; nome e número R$30; 2GG R$15; 3GG R$20; 4GG R$25. Manga longa é aplicada apenas em camisas/blusas marcadas, não em jaquetas ou conjuntos. O preço exibido já inclui esse adicional; tamanho e personalização são somados nas opções do pedido.

`prices.json.gz` registra preço base, regra, indicador de manga longa e valores anteriores. A importação não altera fotos ou descrições. `node scripts/prepare-pricing.mjs` gera SQL que preenche apenas preços/adicionais ausentes, preservando alterações feitas posteriormente pelo painel.

No painel: Produtos → Editar → Preço base e opção de manga longa. Configurações contém os cinco adicionais. Valores validados no servidor; valor vazio deixa o produto sob consulta. Novos produtos podem receber preço no cadastro. Testes: `node scripts/test-pricing.mjs` e `node scripts/test-catalog.mjs`.
