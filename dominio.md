# Domínio financeiro

Este documento descreve o modelo do produto. O roadmap fica em `tarefas.md`.

## Identidade

Finance App é um app PT-BR para finanças pessoais. A moeda padrão é BRL.

## Regras principais

- Toda entidade financeira pertence a exatamente um usuário (`userId`) do Better Auth.
- Relações entre entidades financeiras devem preservar o mesmo `userId` no banco e na aplicação.
- Usuários só podem visualizar e alterar os próprios dados.
- Valores monetários são armazenados em centavos positivos.
- O sentido financeiro vem de `movementType`, não do sinal do valor.
- Compra no cartão de crédito é despesa.
- Pagamento de fatura é conceito de transferência entre conta bancária e cartão, não nova despesa.
- Caixinhas/investimentos resgatáveis são contas de investimento dentro do patrimônio. Aporte e resgate são transferências entre contas, não despesa/receita.
- Rendimento de investimento é receita financeira, separada da receita principal por grupo de categoria.
- CSV bruto não é armazenado por padrão; importações guardam apenas dados parseados necessários para revisão.
- Orçamentos e recorrências são conceitos do produto, mas não entram na fundação executável da Fase 1.

## Contas

Tipos suportados:

- Conta corrente
- Conta poupança
- Carteira/dinheiro
- Investimento, incluindo caixinhas/reservas resgatáveis

Contas representam dinheiro real. Cartões de crédito não são contas.

## Cartões e faturas

Cartões de crédito são entidades próprias, com instituição, dia de fechamento, dia de vencimento, limite opcional e conta padrão opcional para pagamento.

Cada compra de cartão pertence a uma fatura persistida, identificada pelo cartão e pelo mês de vencimento (`YYYY-MM`). Se a fatura ainda não existe, cadastro manual e importação podem criá-la. Se já existe, a compra é adicionada nela.

Compra de cartão continua sendo despesa para análise de gastos na data da compra. Ela não é saída de caixa; a saída de caixa acontece no pagamento da fatura.

Pagamento de fatura é uma movimentação que sai de uma conta real e abate uma fatura específica. Pagamentos parciais, múltiplos e acima do saldo são permitidos. Pagamento acima do saldo representa crédito/adiantamento.

Estorno/crédito do cartão é abatimento da fatura, não receita.

Parcelamentos criam um grupo de parcelas e lançamentos futuros nas faturas futuras. Cada parcela conta no mês/data da própria parcela.

## Categorias

Categorias ficam dentro de grupos. Grupos e categorias são separados entre receita e despesa.

Exemplos de grupos: Moradia, Alimentação, Transporte, Saúde, Educação, Lazer, Assinaturas, Impostos, Renda, Rendimentos financeiros e Outros.

Grupos de receita podem ser marcados como receita principal ou receita financeira. Essa marcação separa salário/freelas de juros/dividendos/rendimentos sem transformar aporte em despesa.

## Movimentações

Tipos:

- Receita
- Despesa
- Transferência
- Pagamento de fatura de cartão, sempre vinculado a uma fatura específica
- Ajuste de saldo

Transferência usa origem e destino reais. Exemplo: depósito na caixinha é Nubank → Caixinha; resgate da caixinha é Caixinha → Nubank, mesmo quando a linha veio do extrato Nubank.

Status de transação:

- Prevista
- Confirmada
- Ignorada
- Duplicada
- Pendente de revisão

## Recorrências

Recorrências descrevem movimentos financeiros esperados, como salário, aluguel, contas e assinaturas. Elas têm frequência (`once`, semanal, mensal ou anual), conta, valor e período de validade.

Uma ocorrência pode estar prevista (gerada pela recorrência), confirmada (já virou transação ligada por `recurrenceId` e `recurrenceOccurrenceOn`) ou atrasada (data anterior a hoje sem confirmação).

A não duplicação de confirmações é garantida por índice único parcial em `(recurrenceId, recurrenceOccurrenceOn)` nas transações.

## Dados sigilosos

A política de mascaramento é única e vive em `src/lib/sensitive-data.ts` (`sensitiveDataRules`).
É aplicada na **escrita** de todo texto livre vindo do usuário ou de CSV.

Dados sigilosos cobertos:

- CPF.
- Número de cartão (13 a 19 dígitos contíguos).
- Identificadores numéricos longos (5+ dígitos): contas, agências, IDs externos.
- Senhas, tokens, secrets e chaves (`senha`, `password`, `token`, `secret`, `chave`, `api_key`).

Garantias:

- Tabelas `finance_app_*` não devem ter colunas para senhas/tokens/credenciais; o teste em `src/lib/sensitive-data.test.ts` falha se isso mudar.
- CSV bruto não é armazenado por padrão (`import_batches.rawFileStored=false`).
- Comando idempotente `bun run db:sanitize -- --email <email>` re-aplica a política em texto já persistido para um usuário.

## Importação

A importação CSV tem duas etapas: lote e linhas. Linhas importadas devem ser revisadas antes de virarem transações definitivas. Na revisão, uma linha pode virar receita, despesa ou transferência. Regras de importação podem sugerir transferência com origem/destino reais para casos recorrentes como caixinhas Nubank.

Importação de cartão exige cartão e mês de vencimento da fatura no lote. As linhas entram na fatura escolhida, com possibilidade de revisão antes de confirmar. Importação de conta bancária que contenha pagamento de fatura deve vincular a linha à fatura específica paga.

Status do lote: rascunho, em revisão, confirmado, cancelado e revertido.

Status da linha: pendente de revisão, válida, inválida, ignorada, duplicada e importada.

## Dois contextos de cálculo

O sistema distingue dois contextos diferentes ao trabalhar com transações financeiras:

### Fluxo de caixa mensal (saldo)

Usado pelo dashboard (`calculateMonthlyBalanceTotals`, `aggregateCashFlow`, `projectedBalanceCents`) para responder: **quanto dinheiro real entrou ou saiu neste mês?**

Regras:
- `income` em qualquer conta → **conta** como entrada de caixa.
- `expense` em conta bancária (`checking`, `savings`, `cash`, `investment`) → **conta** como saída de caixa (`cashExpenseCents`).
- `credit_card_payment` → **conta** como saída de caixa (`invoicePaymentCents`), pois é o momento em que o dinheiro sai do banco.
- `expense` em conta `credit_card` → **não conta**; o dinheiro só sai no momento do pagamento da fatura.

Isso vale tanto para transações confirmadas/previstas no fluxo histórico quanto para movimentos gerados por recorrências (`extraPlannedMovements`).

### Análise de gastos (relatórios, orçamentos, rankings)

Usado por `rankMonthlyCategories`, `rankMonthlyGroups` e `buildBudgetUsage` para responder: **em que o usuário gastou neste mês?**

Regras:
- Todas as `expense` confirmadas no período são contabilizadas, independentemente do tipo de conta.
- `credit_card_payment` é excluído (evita dupla contagem com a despesa original do cartão).
- O objetivo é refletir o consumo real por categoria/grupo, não o movimento de caixa.
