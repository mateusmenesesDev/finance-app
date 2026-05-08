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
- CSV bruto não é armazenado por padrão; importações guardam apenas dados parseados necessários para revisão.
- Orçamentos e recorrências são conceitos do produto, mas não entram na fundação executável da Fase 1.

## Contas

Tipos suportados:

- Conta corrente
- Conta poupança
- Carteira/dinheiro
- Cartão de crédito
- Investimento, reservado para uso futuro

Bancos, carteiras e cartões são modelados como contas.

## Categorias

Categorias ficam dentro de grupos. Grupos e categorias são separados entre receita e despesa.

Exemplos de grupos: Moradia, Alimentação, Transporte, Saúde, Educação, Lazer, Assinaturas, Impostos, Renda, Investimentos e Outros.

## Movimentações

Tipos:

- Receita
- Despesa
- Transferência
- Pagamento de fatura de cartão
- Ajuste de saldo

Status de transação:

- Prevista
- Confirmada
- Ignorada
- Duplicada
- Pendente de revisão

## Importação

A importação CSV tem duas etapas: lote e linhas. Linhas importadas devem ser revisadas antes de virarem transações definitivas.

Status do lote: rascunho, em revisão, confirmado, cancelado e revertido.

Status da linha: pendente de revisão, válida, inválida, ignorada, duplicada e importada.
