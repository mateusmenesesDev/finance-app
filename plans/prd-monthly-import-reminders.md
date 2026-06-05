# PRD — Lembretes Mensais de Importação (Extrato e Fatura)

## Problem Statement

Todo mês, no dia 1, o usuário precisa cadastrar no app o extrato de cada conta bancária e a fatura de cada cartão de crédito (hoje são três instituições: Nubank, Itaú e C6). Esse trabalho é repetitivo, fácil de esquecer parcialmente e difícil de auditar depois: não há hoje um lugar no produto que diga “você já importou o extrato do Nubank deste ciclo?” ou “ainda falta a fatura do cartão Itaú?”.

Sem lembretes explícitos, o usuário pode repetir importações por dúvida, pular um banco sem perceber ou só descobrir o gap semanas depois, quando os relatórios e o fluxo de caixa já estão inconsistentes.

## Solution

Oferecer uma **rotina mensal de importação** visível no **dashboard**, com itens configuráveis (contas para extrato, cartões para fatura). No **dia 1** de cada mês surge um bloco de lembretes referentes ao **mês anterior** (dados que acabaram de fechar). Cada item tem um **checkbox manual** que o usuário marca ao concluir a tarefa — sem vínculo automático com lotes de importação. Itens incompletos **permanecem visíveis** até serem marcados, mesmo após o dia 1. O usuário pode **desmarcar** se marcou por engano e **navegar meses anteriores** para ver o que ficou pendente ou concluído. Novos itens entram na rotina de forma **inline** (“Adicionar à rotina”) a partir das contas e cartões já cadastrados.

## User Stories

### Configuração da rotina

1. Como usuário, quero adicionar uma conta corrente à rotina mensal, para receber lembrete de importar o extrato dessa conta todo mês.
2. Como usuário, quero adicionar um cartão de crédito à rotina mensal, para receber lembrete de importar a fatura desse cartão todo mês.
3. Como usuário, quero remover um item da rotina quando não for mais relevante, para que ele pare de aparecer nos lembretes futuros.
4. Como usuário, quero ver na lista de contas/cartões quais já fazem parte da rotina, para não configurar duas vezes o mesmo item.
5. Como usuário, quero adicionar à rotina diretamente da tela de contas ou cartões (ação inline), para não precisar de uma tela de configuração separada.
6. Como usuário, quero que apenas contas que representam dinheiro real (não cartão legado como conta) entrem como lembrete de extrato, para alinhar com o modelo do produto.
7. Como usuário, quero que cartões arquivados ou inativos não possam ser adicionados à rotina, para evitar lembretes órfãos.
8. Como usuário, quero que contas arquivadas saiam automaticamente da rotina ou fiquem inativas, para não lembrar de importar algo que não uso mais.
9. Como usuário, quero poder ter mais de uma conta na mesma instituição na rotina, se eu realmente opero duas contas no mesmo banco.
10. Como usuário, quero poder ter mais de um cartão na mesma instituição na rotina, se tenho cartões distintos no mesmo banco.
11. Como usuário, quero ver o nome da conta/cartão e a instituição no lembrete, para distinguir Nubank, Itaú e C6 rapidamente.
12. Como usuário, quero um estado vazio claro quando nenhum item está na rotina, com orientação para adicionar o primeiro item inline.

### Ciclo mensal e referência de período

13. Como usuário, quero que no dia 1 de cada mês apareçam os lembretes do ciclo daquele mês, para ritualizar o fechamento mensal.
14. Como usuário, quero que os lembretes de junho referenciem explicitamente os dados de **maio** (mês anterior), para não confundir competência com o mês em que estou trabalhando.
15. Como usuário, quero que o rótulo do bloco deixe claro “Importar movimentações de maio/2026”, para saber qual extrato/fatura buscar no banco.
16. Como usuário, quero que lembretes de extrato e de fatura do mesmo ciclo compartilhem a mesma referência de mês de dados (mês anterior), para manter uma única “rodada” mensal.
17. Como usuário, quero que antes do dia 1 do mês o bloco de rotina do ciclo atual não apareça (ou apareça desabilitado com explicação), para não antecipar tarefas do mês que ainda não começou.
18. Como usuário, quero que após o dia 1 os lembretes não concluídos continuem visíveis no dashboard, para não perder pendências só porque já passou o dia 1.
19. Como usuário, quero que quando todos os itens estiverem marcados o bloco mostre conclusão do ciclo, para ter sensação de fechamento.
20. Como usuário, quero navegar para meses/ciclos anteriores no dashboard e ver o checklist daquela rodada, para auditar se esqueci algo no passado.
21. Como usuário, quero ver visualmente itens pendentes em meses passados, para corrigir retroativamente minha disciplina de importação.
22. Como usuário, quero que ao navegar um mês passado eu possa marcar ou desmarcar itens daquele ciclo, se ainda estiver corrigindo o histórico.

### Marcação manual (conclusão)

23. Como usuário, quero marcar manualmente um lembrete como feito após importar (ou após decidir que não há movimentação), para registrar que não preciso repetir.
24. Como usuário, quero desmarcar um item concluído se marquei por engano, para manter o checklist honesto.
25. Como usuário, quero que marcar como feito **não** crie nem confirme importação no app, para separar “lembrete pessoal” de “dado importado”.
26. Como usuário, quero que marcar como feito seja instantâneo (sem recarregar a página inteira), para usar o checklist de forma ágil.
27. Como usuário, quero confiar que marcar/desmarcar em um mês não altera outros meses, para cada ciclo ter estado independente.
28. Como usuário, quero marcar itens em qualquer ordem, para flexibilidade na minha rotina real.
29. Como usuário, quero ver contagem de concluídos vs total (ex: 4/6), para saber o progresso da rodada.
30. Como usuário, quero distinguir visualmente itens de extrato vs fatura, para escanear a lista rapidamente.

### Dashboard e navegação

31. Como usuário, quero ver a rotina mensal no dashboard (home), para encontrá-la no fluxo natural de abrir o app no dia 1.
32. Como usuário, quero que o bloco de rotina respeite o seletor de mês já existente no dashboard, para revisar ciclos passados no mesmo lugar.
33. Como usuário, quero um atalho de cada lembrete para a tela de importação, para ir direto cadastrar o CSV.
34. Como usuário, quero que o atalho de importação de extrato pré-selecione a conta correta quando possível, para reduzir cliques.
35. Como usuário, quero que o atalho de importação de fatura pré-selecione o cartão e sugira o mês de fatura coerente com o mês de dados da rotina, para alinhar com o fluxo de importação de cartão existente.
36. Como usuário, quero que o bloco de rotina não polua o dashboard quando estiver tudo concluído no mês atual, ou que fique compacto, para priorizar outras informações depois do dia 1.
37. Como usuário, quero que no dia 1 o bloco tenha destaque visual maior que nos outros dias, para chamar atenção na data crítica.
38. Como usuário, quero acessar o app em PT-BR com textos claros (“Extrato”, “Fatura”, “Rotina de importação”), para combinar com o restante do produto.

### Segurança e dados

39. Como usuário, quero que apenas eu veja e altere minha rotina e meus checkmarks, para isolamento entre usuários do Better Auth.
40. Como usuário, quero que excluir uma conta/cartão do app trate o item da rotina de forma previsível (remover ou invalidar), para não quebrar o checklist.
41. Como usuário, quero que renomear conta ou cartão atualize o rótulo do lembrete automaticamente, para não manter nomes antigos fixos no checklist.

### Casos do dia a dia (3 bancos)

42. Como usuário com Nubank, Itaú e C6, quero seis lembretes típicos (3 extratos + 3 faturas) quando configurar uma conta e um cartão por banco, para cobrir minha realidade atual.
43. Como usuário, quero marcar só o extrato do Itaú como feito e deixar os demais pendentes, para refletir progresso parcial real.
44. Como usuário, quero voltar no dia 5 e ainda ver o que falta do ciclo de junho, para terminar o que não fiz no dia 1.
45. Como usuário, quero abrir o dashboard em julho, navegar para o ciclo de junho e ver que esqueci a fatura do C6, para corrigir minha disciplina.
46. Como usuário, quero marcar um lembrete como feito mesmo quando não houve lançamentos no período, para não ficar com pendência falsa.
47. Como usuário, quero adicionar um quarto banco no futuro à rotina sem mudar o comportamento dos ciclos antigos, para escalar além dos três bancos atuais.

## Implementation Decisions

### Conceitos de domínio

- **Item de rotina**: vínculo persistente entre usuário e uma entidade financeira — conta (`financialAccounts`) para lembrete de **extrato**, ou cartão (`creditCards`) para lembrete de **fatura**. Um item não mistura os dois tipos.
- **Ciclo da rotina**: identificado por `YYYY-MM` do **mês calendário em que a rotina corre** (ex.: ciclo `2026-06` = rodada que começa em 01/06/2026).
- **Mês de referência dos dados**: sempre o **mês anterior** ao ciclo (`2026-05` quando o ciclo é `2026-06`). Exibido de forma explícita na UI.
- **Conclusão**: registro por `(usuário, item de rotina, ciclo)` com timestamp; **somente manual**. Não consulta status de `importBatches`.

### Regras de visibilidade no dashboard

- O bloco **“Rotina de importação”** aparece quando:
  - Existe ao menos um item de rotina ativo para o usuário, **e**
  - Para o ciclo selecionado no dashboard: hoje é **dia 1 ou posterior** dentro daquele mês calendário **ou** o usuário está navegando um **mês passado** (sempre mostrar histórico navegável).
- Antes do dia 1 do mês corrente: não mostrar lembretes do ciclo corrente (evitar antecipação); meses passados continuam acessíveis via seletor de mês.
- Itens não concluídos permanecem até marcação, independentemente do dia do mês.
- **Destaque no dia 1**: variante visual mais proeminente (borda, badge “Hoje é dia 1”, ou similar) apenas no dia 1 do ciclo corrente.
- Quando **todos** os itens do ciclo estiverem marcados: bloco em estado “concluído” (compacto ou colapsável), ainda permitindo desmarcar.

### Configuração inline

- Ações **“Adicionar à rotina”** / **“Remover da rotina”** nas telas de listagem/detalhe de contas e cartões (e opcionalmente no próprio bloco do dashboard se lista estiver vazia).
- Não criar wizard dedicado nem página de configurações isolada nesta entrega.
- Validar elegibilidade: conta não arquivada e tipo diferente de `credit_card`; cartão ativo e não arquivado.
- Unicidade: no máximo um item de rotina por conta e por cartão.

### Persistência (schema novo)

- Tabela de **itens de rotina**: `userId`, tipo (`account_statement` | `card_invoice`), `accountId` ou `cardId` (exclusivo), `createdAt`, opcional `sortOrder` para ordenação manual futura.
- Tabela de **conclusões**: `userId`, `routineItemId`, `cycleMonthKey` (`YYYY-MM`), `completedAt`, com unique `(userId, routineItemId, cycleMonthKey)`.
- FKs com `onDelete` coerente: remover item de rotina se conta/cartão for excluído; ou cascade nas conclusões quando item some.

### Server actions / API

- `addAccountToImportRoutine`, `removeAccountFromImportRoutine` (espelho para cartão).
- `setRoutineItemCompleted` / `clearRoutineItemCompleted` (marcar/desmarcar) recebendo `cycleMonthKey` e `routineItemId`.
- Leitura agregada para o dashboard: itens ativos + mapa de conclusões do ciclo selecionado + metadados de conta/cartão (nome, instituição).

### Integração com importação existente

- Links do checklist para `/import` com query params quando suportado: `accountId` para extrato; `cardId` + `invoiceMonthKey` para fatura.
- Para fatura, derivar `invoiceMonthKey` a partir do **mês de referência dos dados** e das regras já usadas no app (mês de vencimento da fatura). Se a derivação automática for ambígua (fechamento no meio do mês), documentar na UI qual mês de fatura o usuário deve escolher, sem bloquear o checkbox manual.

### UX do checklist

- Lista com checkbox por item, label “Extrato — {nome}” ou “Fatura — {nome}”, subtítulo com instituição e mês de referência.
- Barra ou texto de progresso `n/total`.
- Navegação de histórico: reutilizar parâmetro `month` do dashboard como **ciclo da rotina**, não confundir com o período de relatórios internos se houver divergência — alinhar copy na interface.

### Auditoria e privacidade

- Opcional: registrar eventos de auditoria em marcar/desmarcar e adicionar/remover item (se o padrão do app já cobrir ações sensíveis).

### Testes

- Testes unitários para: cálculo do mês de referência a partir do ciclo; regra de visibilidade dia 1; agregação de progresso.
- Teste de integração leve nas actions de marcar/desmarcar com isolamento por `userId`.

## Out of Scope

- Detecção automática de conclusão via importação confirmada, lote em revisão ou contagem de transações.
- Notificações push, e-mail, calendário externo ou lembretes fora do app.
- Página dedicada só para rotina (entrega focada no dashboard).
- Assistente/wizard de onboarding separado da ação inline.
- Lembretes para outros tipos de tarefa (orçamento, recorrências, pagar fatura, conciliação manual linha a linha).
- Compartilhamento de rotina entre usuários ou perfis familiares.
- Agendamento customizável do dia (ex.: dia 5 em vez de dia 1).
- Regras por instituição fixas (Nubank/Itaú/C6 hardcoded) — tudo é configurável por conta/cartão.
- Bloquear nova importação se o lembrete não estiver marcado.
- Sincronização mobile offline-first além do padrão atual do app web.

## Further Notes

- O problema original cita três bancos, mas a solução é **genérica**: o usuário monta a lista a partir das contas e cartões que já tem no app.
- A rotina é um **checklist de disciplina**, não prova de que os dados foram importados corretamente; isso evita falsos positivos/negativos e mantém o escopo pequeno.
- Se no futuro houver auto-detecção, ela deve ser opt-in e não substituir o checkbox manual escolhido neste PRD.
- Alinhar copy com `dominio.md`: extrato em conta real; fatura em entidade de cartão; importação CSV continua sendo o fluxo principal de entrada.
- Considerar posicionar o bloco **acima** de “Importações pendentes” no dashboard, pois a rotina é proativa e as pendências são reativas (lotes já iniciados).
