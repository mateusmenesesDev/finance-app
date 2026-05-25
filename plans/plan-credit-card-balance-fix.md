# Plan: Correção do Saldo Mensal para Despesas de Cartão de Crédito

> Source PRD: `plans/prd-credit-card-balance-fix.md`

## Architectural decisions

- **Schema**: sem alterações — a distinção entre despesa bancária e despesa de cartão já existe via `movementType` + `account.type`
- **Key models**: `RuleTransaction` ganha o campo `accountType: AccountKind` para permitir que as funções de regra distingam o tipo de conta sem precisar de parâmetros extras
- **Dois contextos de cálculo explicitamente separados**:
  - *Fluxo de caixa mensal* (saldo): usa `isMonthlyBalanceTransaction` — exclui `expense` em `credit_card`, inclui `credit_card_payment`
  - *Análise de gastos* (relatórios, orçamentos, rankings): usa `isMonthlyMetricTransaction` existente — inclui todas as `expense` por mês de ocorrência, sem distinção de conta
- **Retrocompatibilidade**: nenhuma migração de dados; a mudança é puramente na camada de cálculo

---

## Phase 1 — Fundação: separar fluxo de caixa de análise de gastos

**User stories**: 1, 2, 3, 5, 6, 7, 8, 13, 14

### What to build

Adicionar `accountType: AccountKind` ao tipo `RuleTransaction` e propagar esse campo em todos os call sites que constroem ou passam transações para funções de regra.

Com esse campo disponível, criar a função `isMonthlyBalanceTransaction` que filtra transações pelo critério de fluxo de caixa real: inclui `income` em qualquer conta, inclui `expense` apenas em contas não-cartão (`checking`, `savings`, `cash`, `investment`), inclui `credit_card_payment`. Excluir `expense` em `credit_card`.

Modificar `calculateMonthlyTotalsByCashFlowRole` para usar `isMonthlyBalanceTransaction` ao acumular despesas, e passar a retornar dois novos campos no resultado: `cashExpenseCents` (despesas bancárias) e `invoicePaymentCents` (pagamentos de fatura do mês). O campo `expenseCents` existente passa a ser `cashExpenseCents + invoicePaymentCents` para manter compatibilidade nos call sites que ainda não foram atualizados.

Auditar `rankMonthlyCategories`, `rankMonthlyGroups` e `buildBudgetUsage` para confirmar que continuam usando a lógica de análise (despesas por mês de ocorrência, sem distinção de tipo de conta) — nenhuma alteração de comportamento esperada, apenas validação explícita.

Atualizar os testes unitários em `finance-rules.test.ts` cobrindo:
- despesa em cartão de crédito **não** conta no saldo mensal
- `credit_card_payment` **conta** no saldo mensal (como saída)
- despesa em cartão **continua** aparecendo nos rankings de categoria e orçamentos
- `netCents` = receitas − cashExpenses − invoicePayments

### Acceptance criteria

- [ ] `RuleTransaction` possui o campo `accountType: AccountKind` e todos os call sites o preenchem
- [ ] Uma despesa confirmada em conta `credit_card` não aparece em `cashExpenseCents` nem no `netCents` do mês
- [ ] Um `credit_card_payment` confirmado aparece em `invoicePaymentCents` e reduz o `netCents` do mês em que é pago
- [ ] `expenseCents` retornado = `cashExpenseCents + invoicePaymentCents`
- [ ] `rankMonthlyCategories` e `rankMonthlyGroups` continuam exibindo despesas de cartão no mês de ocorrência (sem alteração)
- [ ] `buildBudgetUsage` continua contabilizando despesas de cartão no mês da compra (sem alteração)
- [ ] Todos os testes novos e existentes passam

---

## Phase 2 — Dashboard: novo card "Fatura paga" e label corrigido

**User stories**: 4, 12

### What to build

Atualizar o dashboard para consumir os novos campos retornados por `calculateMonthlyTotalsByCashFlowRole`.

O card **"Despesas do mês"** passa a exibir `cashExpenseCents` (despesas em contas bancárias), com label atualizado para deixar claro que se refere a dinheiro real (ex: "Despesas em dinheiro"). Adicionar um novo `StatCard` **"Fatura paga"** exibindo `invoicePaymentCents` — o total de pagamentos de fatura realizados no mês selecionado.

O card **"Saldo do mês"** já passa a exibir o valor correto automaticamente, pois usa `monthlyTotals.netCents` que foi corrigido no Phase 1.

### Acceptance criteria

- [ ] O card "Despesas do mês" exibe apenas despesas em contas bancárias (não inclui compras de cartão)
- [ ] Um novo card "Fatura paga" está visível no dashboard com o total de `credit_card_payment` do mês
- [ ] O card "Saldo do mês" exibe `receitas − despesas bancárias − fatura paga`
- [ ] Se não houver pagamento de fatura no mês, o card "Fatura paga" exibe R$ 0,00 (ou é omitido visualmente)
- [ ] O layout do grid de cards não quebra visualmente com o card adicional

---

## Phase 3 — Auditoria de projeções: saldo projetado e recorrências

**User stories**: 9, 10, 11, 15

### What to build

Auditar e validar que `projectedBalanceCents` e o módulo `aggregateCashFlow` já seguem a lógica correta para cartões. O `cash-flow.ts` já exclui compras de cartão do fluxo projetado (`plannedExpense`) e usa `invoiceOutflow` para faturas futuras — confirmar que esse comportamento está consistente com a nova separação do Phase 1.

Verificar que recorrências geradas com `movementType: "expense"` em conta `credit_card` não vazam para `plannedExpense` no `aggregateCashFlow`. Adicionar testes para o cenário de `credit_card_payment` com status `planned` aparecer corretamente na projeção de saída de caixa.

Atualizar `dominio.md` com uma seção explícita documentando a distinção entre "fluxo de caixa mensal" e "análise de gastos", e como cada tipo de transação se encaixa em cada contexto.

### Acceptance criteria

- [ ] `projectedBalanceCents` no dashboard não inclui compras futuras de cartão como saídas de caixa diretas
- [ ] Um `credit_card_payment` com status `planned` aparece corretamente como saída projetada no mês de vencimento
- [ ] Recorrências em conta `credit_card` não inflamam `plannedExpense` no cash flow projetado
- [ ] `dominio.md` descreve explicitamente os dois contextos de cálculo (fluxo de caixa vs. análise de gastos)
- [ ] Todos os testes de `cash-flow.test.ts` continuam passando
