# Fluxo Maestro → Executor → VAR

Este diretório contém os modelos de passagem de trabalho usados pelos agentes do
projeto Camisa 10.

## Como iniciar uma funcionalidade

Comece na conversa principal:

> Maestro, quero discutir uma ideia para o Camisa 10. Não implemente ainda.

O Maestro produzirá um prompt. Revise-o e, quando estiver satisfeito, responda:

> Aprovo este prompt. Pode iniciar o fluxo Executor → VAR.

O agente principal delegará a implementação ao Executor e, ao receber o
relatório, enviará o pacote completo ao VAR Técnico. Correções dentro do escopo
podem circular automaticamente por até três ciclos. Mudanças de escopo sempre
voltam para o usuário.

## Estados possíveis

`DESCOBERTA → AGUARDANDO_APROVAÇÃO → EXECUÇÃO → REVISÃO`

Da revisão, o fluxo termina em `APROVADO`, retorna para `CORREÇÃO` ou para em
`BLOQUEADO`.

## Regra de documentação

Trabalhos pequenos podem ser documentados nas próprias mensagens. Trabalhos
médios ou grandes devem criar uma pasta em `runs/<id-da-tarefa>/` usando os
modelos deste diretório.
