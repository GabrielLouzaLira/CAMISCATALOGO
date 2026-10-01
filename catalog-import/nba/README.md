# Importação NBA

Fonte: https://05941188.x.yupoo.com/ (outubro de 2026).

Foram importados 1.273 álbuns de camisas em 32 equipes/coleções, com 5.014 fotos. Inclui camisas infantis, retrôs e All-Star. Shorts, BAPE, seleções, NCAA e outras coleções fora da NBA não fazem parte desta importação. Sete títulos repetidos foram descartados; álbuns ambíguos ou sem fotos estão registrados para revisão.

Nomes, números, edições e temporadas refletem o cadastro do fornecedor; não representam confirmação de elenco, disponibilidade ou lançamento oficial. Os títulos originais ficam somente nos arquivos de importação.

Execute `node scripts/prepare-nba-import.mjs` para gerar `.import-sql/nba.sql`. A importação é aditiva e não sobrescreve produtos/equipes existentes. O arquivo gerado deve ser aplicado ao D1 configurado para este catálogo. Fotos são registradas por origem permitida e copiadas ao R2 no primeiro acesso. Credenciais não fazem parte deste diretório.
