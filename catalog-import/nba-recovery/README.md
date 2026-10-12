# Recuperação de fotos NBA — 12/10/2026

Revisão das 231 capas indisponíveis do fornecedor https://05941188.x.yupoo.com/.

- 212 produtos encontrados nos novos álbuns por correspondência de equipe, jogador, número, cor e edição. Nomes normalizados somente para espaços, prefixo da marca e termo de temporada; quatro equivalências foram revisadas manualmente.
- 861 referências de fotos válidas, com 854 URLs distintas no catálogo. Capas escolhidas visualmente para mostrar a frente inteira da camisa.
- Mais 8 produtos recuperados dos próprios álbuns antigos, com 23 fotos copiadas pelo upload administrativo para o R2. Algumas são miniaturas e têm resolução menor.
- Total: 220 produtos recuperados. Os 11 restantes estão em pending.json; não foram substituídos por outro jogador, edição ou foto de costas.

recovered.json.gz registra IDs existentes, álbuns antigos/novos, fontes, galerias anteriores e novas. As chaves das capas anteriores receberam a fonte correspondente atualizada; o Worker descarta o aviso antigo do fornecedor e grava a foto válida no R2. extra-recovered.json registra os uploads adicionais. Não foram criados produtos duplicados nem alterados preços, nomes ou equipes. Cache público invalidado pelo painel após a atualização.

Validação: imagens verificadas pelo endereço público; todos os campos além de images dos 212 produtos comparados com o backup anterior. Os registros permitem auditar e desfazer as alterações de galerias.
