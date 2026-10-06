# Kits de treino — DongshanSports

Fonte: https://x.yupoo.com/photos/dongshanstore/albums?tab=gallery

3.421 modelos de 83 equipes de futebol e basquete, com 75.762 imagens. 536 álbuns de peças avulsas, tabelas, conjuntos casuais sem equipe ou sem identificação pública foram excluídos. Nenhuma galeria idêntica, capa repetida ou título integral repetido foi encontrado entre os selecionados. O import compara álbuns e galerias com os imports anteriores; não havia kits marcados como treino+kit. Não foi feita comparação visual exaustiva de todos os modelos entre fornecedores.

Adultos e infantis, regata/camiseta/polo com shorts ou agasalho com calça. Referências individuais preservam variantes semelhantes. País, liga e esporte seguem a equipe; Liverpool e Al Ittihad foram adicionados com escudos ESPN.

Classificação baseada nos títulos do fornecedor, com conferência visual de 107 amostras distribuídas por equipe/época, além de 23 títulos ambíguos. As fotos de capa do fornecedor ficam primeiro, preservando as galerias. Não houve revisão visual individual de todas as fotos. Temporadas e versões seguem o fornecedor; preços, tamanhos e disponibilidade são consultados pelo WhatsApp.

As galerias grandes são armazenadas como JSON compactado sem perdas (.json.gz) no GitHub. O preparador lê esse formato diretamente: `node scripts/prepare-nba-import.mjs training`. Inserção aditiva: não sobrescreve produtos existentes. `manifest.json` lista todos os lotes, contagens e fonte; `excluded.json` documenta os itens fora do escopo.

O filtro Modelo → Kits de treino usa a tag `kit-treino`, preservando os filtros infantil, kit e versão jogador. Fotos são copiadas para R2 na primeira abertura. A origem permitida é restrita a https://photo.yupoo.com/dongshanstore/.
