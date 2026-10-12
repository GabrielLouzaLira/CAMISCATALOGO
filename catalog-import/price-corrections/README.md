# Correções de 12/10/2026

844 conjuntos adultos curtos ajustados para R$200 e 29 camisas de Fórmula 1 ajustadas para R$190 (34 camisas no total, cinco já tinham esse preço). Os 128 shorts já estão cadastrados a R$120; agora há um botão direto na vitrine que remove filtros de país/equipe para exibir todos. Valores continuam editáveis no painel.

JSON contém IDs, nomes, valores anteriores e novos valores para auditoria. Aplicação feita por ID, sem recriar produtos, alterar galerias ou mudar os conjuntos com calça.

Fotos NBA: aviso de indisponibilidade do Yupoo era uma imagem HTTP 200 e tinha sido salvo no R2. O Worker agora reconhece esse arquivo por SHA256, tenta a miniatura da mesma foto e não armazena o aviso novamente. Fotos recuperadas foram gravadas no R2. Auditoria das primeiras páginas de 32 equipes: 1.086 capas verificadas, 855 respondendo como imagem e 231 ainda indisponíveis no fornecedor (nba-unavailable.json). Não foram usadas fotos de outros produtos. Miniaturas recuperadas podem ter resolução inferior.
