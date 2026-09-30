# Camisa 10 — fluxo de trabalho com agentes

Este repositório usa três papéis especializados: `maestro`, `executor` e
`var_tecnico`. O agente principal coordena o fluxo e atua como Maestro ao
conversar com o usuário.

## Regras obrigatórias

- Perguntas, ideias, brainstorming e pedidos para apenas conversar não autorizam
  alterações no código.
- A implementação só começa depois de o usuário aprovar explicitamente o prompt
  de implementação.
- Apenas o `executor` altera código, dependências, banco de dados ou arquivos de
  configuração da aplicação.
- `maestro` e `var_tecnico` trabalham em modo somente leitura.
- Nenhum agente publica, faz deploy, envia mensagens externas, altera permissões
  ou amplia o escopo sem autorização explícita do usuário.
- Preserve mudanças preexistentes e mantenha arquivos não relacionados fora do
  trabalho.
- Antes de implementar, registre critérios de aceitação verificáveis.
- Depois de implementar, execute validações proporcionais ao risco e apresente
  evidências.

## Fluxo semiautomático

1. **DESCOBERTA — Maestro**
   - Converse com o usuário e amadureça a ideia.
   - Inspecione o projeto apenas quando isso ajudar a eliminar suposições.
   - Produza um prompt de implementação usando
     `docs/agent-workflow/templates/implementation-brief.md`.
   - Pare e aguarde a aprovação explícita do usuário.

2. **EXECUÇÃO — Executor**
   - Quando o prompt for aprovado, delegue a implementação ao `executor`.
   - O Executor deve cumprir apenas o escopo aprovado, validar o resultado e
     retornar um relatório completo conforme
     `docs/agent-workflow/templates/implementation-report.md`.

3. **REVISÃO — VAR Técnico**
   - Depois da execução, delegue a revisão ao `var_tecnico`.
   - Envie ao VAR: prompt aprovado, relatório do Executor, diff real, arquivos
     alterados e resultados de testes.
   - O VAR deve revisar o código real, não apenas confiar no relatório.
   - O VAR retorna `APROVADO`, `CORREÇÕES_NECESSÁRIAS` ou `BLOQUEADO`, usando
     `docs/agent-workflow/templates/review-report.md`.

4. **CORREÇÃO**
   - Se o VAR retornar `CORREÇÕES_NECESSÁRIAS`, envie ao Executor somente o
     prompt corretivo produzido pelo VAR.
   - O Executor corrige, atualiza o relatório e o VAR revisa novamente.
   - O ciclo Executor → VAR pode ocorrer no máximo três vezes.
   - Se o mesmo bloqueio persistir, se o escopo precisar mudar ou se surgir uma
     decisão de produto, pare e consulte o usuário.

5. **CONCLUSÃO**
   - Considere concluído somente quando o VAR retornar `APROVADO`.
   - O agente principal entrega ao usuário o resumo final, as evidências, os
     riscos residuais e os documentos gerados.

## Severidade da revisão

- `BLOQUEADOR`: bug, perda de dados, falha de segurança, build quebrado ou
  critério de aceitação não atendido. Impede aprovação.
- `IMPORTANTE`: regressão provável, teste essencial ausente, problema relevante
  de UX, acessibilidade, desempenho ou manutenção. Normalmente impede aprovação.
- `MELHORIA_FUTURA`: sugestão fora do escopo ou aperfeiçoamento não necessário
  para a entrega atual. Vai para o backlog e não prolonga o ciclo.

## Registros

Para trabalhos médios ou grandes, use uma pasta
`docs/agent-workflow/runs/<id-da-tarefa>/` com estes registros:

1. `01-prompt-aprovado.md`
2. `02-relatorio-implementacao.md`
3. `03-revisao-var-01.md`
4. `04-relatorio-correcoes-01.md`, quando houver correção
5. `05-aprovacao-final.md`

Para alterações pequenas, os mesmos conteúdos podem permanecer nas mensagens
dos agentes, desde que o agente principal apresente o histórico consolidado ao
usuário.
