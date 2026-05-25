# PRD: Correção do Saldo Mensal para Despesas de Cartão de Crédito

## Problem Statement

O usuário edita uma transação na página de transações e muda a conta de destino para um cartão de crédito (transformando-a em uma despesa de cartão). Mesmo após essa mudança, a transação continua sendo somada ao cálculo de "Saldo do mês" no dashboard. Isso é incorreto: o saldo do mês deve refletir o fluxo de caixa real — ou seja, dinheiro que efetivamente saiu de contas bancárias — e não o acúmulo de débito no cartão.

O impacto prático é que o saldo do mês fica artificialmente negativo (ou menos positivo) no mês em que o usuário fez a compra no cartão, e o pagamento da fatura (que é quando o dinheiro de fato sai) não aparece como saída no mês em que é pago. Isso confunde o usuário e torna o dashboard não confiável para tomada de decisões financeiras.

## Solution

Separar os conceitos de **fluxo de caixa mensal** (o que afeta saldo) e **análise de gastos** (o que aparece nas categorias e relatórios):

- **Fluxo de caixa mensal (saldo do mês):** considera apenas movimentações que afetam dinheiro real — receitas, despesas em contas normais (corrente, poupança, dinheiro), e pagamentos de fatura (`credit_card_payment`). Despesas lançadas em conta cartão de crédito são **excluídas** deste cálculo.
- **Análise de gastos (relatórios, análise, orçamentos):** considera despesas de cartão pelo mês em que ocorreram, permitindo entender em que categorias o dinheiro foi gasto, independentemente de quando a fatura foi paga.

O dashboard ganha um novo card mostrando o total de faturas de cartão pagas no mês, deixando explícito esse valor sem confundir com despesas operacionais.

## User Stories

1. Como usuário, quero que o "Saldo do mês" no dashboard mostre apenas o fluxo de caixa real (receitas menos despesas bancárias e pagamentos de fatura), para que eu possa confiar nesse número ao tomar decisões sobre meu orçamento mensal.
2. Como usuário, quero que despesas lançadas no cartão de crédito NÃO apareçam no cálculo do saldo do mês, pois elas ainda não saíram do meu dinheiro disponível.
3. Como usuário, quero que o pagamento da fatura do cartão (credit_card_payment) SIM apareça como saída no "Saldo do mês" do mês em que o pagamento é realizado, pois esse é o momento em que o dinheiro de fato sai.
4. Como usuário, quero ver um card dedicado no dashboard mostrando o total de pagamentos de fatura realizados no mês, para ter visibilidade clara sobre o quanto paguei em faturas.
5. Como usuário, quero que a página de Análise de gastos continue mostrando despesas de cartão de crédito agrupadas pelo mês em que ocorreram (não no mês do pagamento da fatura), para que eu possa entender meus padrões de consumo por categoria.
6. Como usuário, quero que os Relatórios continuem usando as despesas individuais do cartão por mês de ocorrência, para análise histórica de gastos por categoria.
7. Como usuário, quero que o ranking de "Maiores despesas" no dashboard continue exibindo despesas de cartão pelo mês de ocorrência, para entender onde gastei mais naquele mês.
8. Como usuário, quero que os Orçamentos (budgets) considerem despesas de cartão no mês da compra (não no da fatura), para que eu possa controlar gastos por categoria conforme acontecem.
9. Como usuário, quero que a projeção de saldo (saldo projetado do mês) também siga a mesma lógica — excluindo compras no cartão e incluindo pagamentos de fatura — para que a projeção seja consistente com o saldo do mês.
10. Como usuário, quero que o Cash Flow projete corretamente saídas futuras de dinheiro baseadas nos pagamentos de fatura planejados (não nas compras do cartão), para que eu possa planejar minha liquidez.
11. Como usuário, quando tenho despesas pendentes de recorrência lançadas no cartão, quero que elas não apareçam no saldo projetado como saídas de caixa futuras, mas sim como gastos de cartão a serem incluídos na próxima fatura.
12. Como usuário, quero que o card "Despesas do mês" no dashboard reflita apenas despesas em dinheiro (contas bancárias), separando visualmente do card de "Fatura do cartão".
13. Como usuário, quero que o "Saldo do mês" calculado como `receita - despesas em dinheiro - pagamentos de fatura` seja intuitivamente correto: se eu ganho R$5.000, pago R$1.000 em despesas bancárias e R$2.000 em fatura, meu saldo deve ser R$2.000.
14. Como usuário, quero que a distinção entre "despesa em dinheiro" e "despesa de cartão" seja automática — basta que a conta selecionada na transação seja do tipo cartão de crédito.
15. Como usuário, quero que transações com status `planned` de pagamento de fatura apareçam corretamente nas projeções de saldo futuro.

## Implementation Decisions

### Separação de funções de cálculo

Atualmente existe uma única função `isMonthlyMetricTransaction` que filtra transações para todos os contextos. É necessário criar **duas lógicas distintas**:

- **`isMonthlyBalanceTransaction`** (novo): filtra transações que afetam o fluxo de caixa mensal. Inclui `income` em qualquer conta e `expense` apenas em contas que NÃO são cartão de crédito, além de `credit_card_payment`. Exclui `expense` em contas `credit_card`.
- **`isMonthlySpendingTransaction`** (renomeação/manutenção do atual): mantém a lógica existente para análise de gastos — inclui `income` e `expense` por mês de ocorrência, sem distinção de tipo de conta.

### Acesso ao tipo de conta nas funções de regra

As funções em `finance-rules.ts` atualmente recebem `RuleTransaction[]` sem informação de tipo de conta. Para distinguir despesas de cartão de despesas bancárias, é necessário que as funções de saldo recebam ou derivem o tipo de conta de cada transação. Opções:

- Adicionar `accountType` ao tipo `RuleTransaction`
- Passar um `Map<accountId, accountType>` como parâmetro adicional às funções afetadas

A abordagem de adicionar `accountType` ao `RuleTransaction` é preferida por ser mais explícita e evitar acoplamento extra nos call sites.

### Modificações em `calculateMonthlyTotalsByCashFlowRole`

A função deve passar a:
- Usar `isMonthlyBalanceTransaction` (nova lógica) para calcular `expenseCents` e `netCents`
- Incluir `credit_card_payment` como saída em `expenseCents` (ou campo separado `invoicePaymentCents`)
- Retornar `cashExpenseCents` (despesas bancárias) e `invoicePaymentCents` (pagamentos de fatura) como campos separados no resultado, além do `expenseCents` agregado para compatibilidade

### Modificações em `rankMonthlyCategories`

Deve continuar usando a lógica de análise (`isMonthlySpendingTransaction`) — sem alteração de comportamento, apenas garantindo que usa a função correta após o refactor.

### Dashboard — novo card

O grid de `StatCard`s no dashboard passa de 4 para 5 (ou reorganização visual), adicionando:
- **"Fatura paga"** (ou "Cartão de crédito"): exibe o total de `credit_card_payment` do mês selecionado
- O card **"Despesas do mês"** passa a exibir apenas despesas em contas bancárias (cash expenses), com label potencialmente renomeado para "Despesas em dinheiro" ou "Despesas bancárias"

### Orçamentos (budgets)

O cálculo de consumo de orçamento deve continuar usando a lógica de análise de gastos (despesas de cartão pelo mês da compra), não a lógica de fluxo de caixa. Isso é consistente com o propósito dos orçamentos: controlar gastos por categoria, não liquidez.

### Cash Flow e projeções

O módulo de Cash Flow já exclui corretamente compras de cartão do fluxo projetado (`cash-flow.ts` linha ~222). Validar que a lógica existente permanece consistente após as mudanças. A projeção de saldo do mês no dashboard (`projectedBalanceCents`) deve ser revisada para usar a mesma lógica de `isMonthlyBalanceTransaction`.

### Recorrências

Transações recorrentes lançadas como despesa de cartão devem seguir a nova lógica: não impactam saldo mensal, apenas análise de gastos. Nenhuma mudança de schema é necessária — a distinção vem do `movementType` e tipo de conta da transação gerada.

### Schema

Nenhuma alteração de schema é necessária. A distinção entre despesa bancária e despesa de cartão já existe através do `movementType` + tipo da conta (`account.type === 'credit_card'`).

### Consistência visual

O dashboard deve deixar claro ao usuário a separação entre:
- Despesas em dinheiro (saem do banco imediatamente)
- Fatura paga (consolidação do débito de cartão)
- Saldo do mês = Receitas − Despesas em dinheiro − Fatura paga

## Out of Scope

- Mudar como transações de cartão são criadas ou editadas na página de transações
- Alterar a lógica da página de Análise (`/analysis`) e Relatórios (`/reports`) — continuam usando despesas por mês de ocorrência
- Implementar o agrupamento automático de compras em faturas (invoice grouping) — isso já existe em `computeFutureInvoices` e não muda
- Alterar o cálculo de saldo das contas individuais (conta corrente, cartão) — já está correto
- Criar novos tipos de movimentação
- Impactar transações com status diferente de `confirmed` nos relatórios (regra de `affectsReports` permanece)

## Further Notes

- O bug se manifesta principalmente quando o usuário edita uma transação existente e muda a conta para um cartão de crédito, mas também acontece ao criar uma nova despesa diretamente em uma conta cartão.
- A mudança é **não-breaking** para os dados: nenhuma transação precisa ser migrada. A lógica apenas passa a filtrar diferente nas funções de cálculo.
- Testes unitários em `finance-rules.test.ts` precisam ser atualizados para cobrir os dois cenários: (a) despesa de cartão excluída do saldo mensal e (b) `credit_card_payment` incluído no saldo mensal.
- A documentação de domínio (`dominio.md`) deve ser atualizada para refletir a distinção explícita entre "fluxo de caixa mensal" e "análise de gastos".
