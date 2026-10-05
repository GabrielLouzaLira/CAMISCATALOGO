# Importação NFL — outubro de 2026

Fonte: https://guoshuzhen7788.x.yupoo.com/albums/74546529?uid=1

473 fotos examinadas. 383 modelos de 30 equipes selecionados; 50 registros repetidos ou já cadastrados descartados; 40 itens de outros esportes, moletom ou imagem indisponível excluídos. A identificação combina os títulos do fornecedor com revisão visual das imagens sem nome. As fotos incluem montagens de frente e costas fornecidas pelo vendedor e são preservadas integralmente.

Os nomes das equipes seguem a organização atual do catálogo, inclusive para uniformes históricos. Nenhuma disponibilidade ou temporada atual é inferida das fotos antigas. Os produtos existentes com números 9 (Bengals, preto) e 24 (Browns, branco) foram preservados sem recadastro.

Execute `node scripts/prepare-nba-import.mjs nfl` para gerar `.import-sql/nfl.sql`. A inserção é aditiva e preserva registros já existentes. A migração `migrations/20261002-correct-nrl-teams.sql` corrige cinco peças da NRL anteriormente confundidas com equipes da NFL. Fotos continuam copiadas ao R2 no primeiro acesso.
