# Tarefas

Roadmap de produto para o app de finanças pessoais descrito em `projeto.md`.

Decisões de domínio ficam em `dominio.md`; este arquivo acompanha execução e priorização.

Princípios do backlog:

- O app deve ser centrado em **contas**, **transações**, **categorias**, **importação CSV** e **análise de gastos**.
- Bancos, carteiras e cartões de crédito devem ser modelados como contas.
- Faturas de cartão devem entrar como compras individuais; o pagamento da fatura deve ser tratado como transferência entre conta bancária e cartão.
- Importações CSV devem ser revisadas antes de virarem transações definitivas.
- IA deve ser assistiva: sugere, resume e alerta, mas não altera dados sem confirmação.
- Dados financeiros e dados sigilosos devem ter proteção explícita, com cuidado especial para senhas, números de cartão, CPF e identificadores sensíveis.

---

## Fase 1 — Fundação do produto

Objetivo: trocar o esqueleto inicial por uma base segura para finanças pessoais.

### Produto

- [x] Definir o modelo principal do app em torno de contas, transações, categorias, importações, orçamentos e recorrências.
- [x] Definir os tipos de conta suportados:
  - [x] Conta corrente
  - [x] Conta poupança
  - [x] Carteira/dinheiro
  - [x] Cartão de crédito
  - [x] Conta de investimento, se necessário no futuro
- [x] Definir os tipos de movimentação:
  - [x] Receita
  - [x] Despesa
  - [x] Transferência entre contas
  - [x] Pagamento de fatura
  - [x] Ajuste de saldo
- [x] Definir status de transação:
  - [x] Prevista
  - [x] Confirmada
  - [x] Ignorada
  - [x] Duplicada
  - [x] Pendente de revisão
- [x] Definir regras de isolamento multiusuário: cada usuário deve visualizar e alterar apenas seus próprios dados.

### Técnica

- [x] Remover referências visuais e conceituais do scaffold inicial.
- [x] Ajustar nome, descrição e estrutura inicial do app para o domínio financeiro.
- [x] Revisar configuração de banco, migrations e nomes de tabelas antes de criar entidades financeiras.
- [x] Garantir que todas as futuras entidades financeiras tenham vínculo com usuário.
- [x] Criar estados vazios úteis para primeiro uso do app.

---

## Fase 2 — Contas, categorias e transações

Objetivo: permitir controle manual básico antes da importação CSV.

### Contas

- [x] Cadastrar conta.
- [x] Editar conta.
- [x] Arquivar conta sem apagar histórico.
- [x] Definir saldo inicial da conta.
- [x] Definir instituição financeira da conta.
- [x] Marcar conta como ativa/inativa.
- [x] Exibir saldo atual por conta.
- [x] Exibir saldo consolidado do usuário.

### Cartões de crédito

- [x] Cadastrar cartão de crédito como tipo de conta.
- [x] Configurar dia de fechamento da fatura.
- [x] Configurar dia de vencimento da fatura.
- [x] Exibir compras por fatura.
- [x] Exibir total aberto da fatura.
- [x] Registrar pagamento de fatura como transferência.
- [x] Evitar duplicar despesa quando a fatura for paga pela conta bancária.

### Categorias

- [x] Cadastrar grupos de categoria.
- [x] Cadastrar categorias dentro de grupos.
- [x] Editar categorias.
- [x] Arquivar categorias sem perder histórico.
- [x] Definir categorias padrão para receitas e despesas.
- [x] Exibir gastos por grupo e por categoria.

Exemplos de grupos:

- Moradia
- Alimentação
- Transporte
- Saúde
- Educação
- Lazer
- Assinaturas
- Impostos
- Renda
- Investimentos
- Outros

### Transações

- [x] Cadastrar transação manual.
- [x] Editar transação.
- [x] Excluir ou arquivar transação.
- [x] Associar transação a conta.
- [x] Associar transação a categoria.
- [x] Informar data da transação.
- [x] Informar valor.
- [x] Informar descrição original.
- [x] Informar descrição editada/apelido.
- [x] Marcar transação como receita, despesa ou transferência.
- [x] Filtrar transações por período, conta, categoria, tipo e texto.
- [x] Ordenar transações por data, valor e categoria.

---

## Fase 3 — Importação CSV

Objetivo: transformar arquivos exportados manualmente dos bancos e cartões no principal fluxo de entrada de dados.

### Fluxo de importação

- [x] Criar central de importação CSV.
- [x] Permitir upload de CSV de banco.
- [x] Permitir upload de CSV de cartão de crédito.
- [x] Associar cada importação a uma conta.
- [x] Registrar histórico de importações.
- [x] Exibir data, arquivo, conta, usuário, status e quantidade de linhas importadas.
- [x] Permitir cancelar importação antes da confirmação.
- [x] Permitir desfazer uma importação confirmada.

### Templates por instituição

- [x] Criar template de importação por banco/cartão.
- [x] Salvar mapeamento de colunas por instituição.
- [x] Permitir reutilizar template em importações futuras.
- [x] Permitir editar template quando o banco mudar o formato do CSV.
- [x] Suportar formatos diferentes de data.
- [x] Suportar separadores diferentes.
- [x] Suportar vírgula ou ponto como separador decimal.
- [x] Suportar colunas separadas de entrada e saída.
- [x] Suportar coluna única de valor com sinal positivo/negativo.
- [x] Suportar inversão de sinal quando necessário.

Campos mínimos para mapear:

- Data
- Descrição
- Valor
- Tipo ou sinal
- Identificador externo, quando existir
- Categoria original, quando o banco exportar
- Observação, quando existir

### Pré-visualização e revisão

- [x] Exibir pré-visualização das linhas antes de salvar.
- [x] Normalizar valores e datas antes da revisão.
- [x] Marcar linhas inválidas com motivo claro.
- [x] Permitir editar data, valor, descrição, conta e categoria durante a revisão.
- [x] Permitir aplicar categoria em lote.
- [x] Permitir ignorar linhas selecionadas.
- [x] Exibir total de receitas, despesas, transferências e linhas ignoradas antes de confirmar.
- [x] Exigir confirmação manual antes de criar transações definitivas.

### Duplicidade

- [x] Detectar duplicados dentro do mesmo arquivo.
- [x] Detectar duplicados contra importações anteriores.
- [x] Detectar duplicados contra transações manuais.
- [x] Usar conta, data, valor e descrição normalizada como base de comparação.
- [x] Permitir confirmar, ignorar ou revisar possíveis duplicados.
- [x] Mostrar claramente por que uma linha foi considerada duplicada.

### Segurança na importação

- [x] Detectar possíveis dados sigilosos no CSV.
- [x] Alertar quando houver CPF, número de cartão, senha, token ou identificador sensível.
- [x] Permitir mascarar dados sensíveis antes de salvar.
- [x] Evitar armazenar o arquivo bruto quando não for necessário.
- [x] Se armazenar arquivo bruto, deixar isso explícito e controlável.

---

## Fase 3.5 — Dados realistas e seed local

Objetivo: popular o ambiente de desenvolvimento com dados brasileiros plausíveis para testar fluxos, telas e relatórios sem usar dados financeiros reais.

### Rotina de seed

- [x] Criar arquivo de seed alinhado ao stack atual: Drizzle ORM + PostgreSQL.
- [x] Expor script simples no `package.json`, por exemplo `db:seed`, executável com Bun.
- [x] Usar `@faker-js/faker` como dependência de desenvolvimento ou, se for mais simples, geradores determinísticos locais.
- [x] Criar usuário demo isolado para desenvolvimento, compatível com as tabelas de autenticação existentes.
- [x] Gerar contas realistas: conta corrente, poupança, carteira e cartão de crédito.
- [x] Gerar grupos e categorias padrão em português do Brasil.
- [x] Gerar transações dos últimos meses com receitas, despesas, transferências, pagamento de fatura e ajustes.
- [x] Gerar faturas/cartão como compras individuais, mantendo pagamento de fatura como transferência.
- [x] Gerar exemplos de importações CSV revisadas, pendentes, com duplicados e linhas inválidas.
- [x] Garantir que todos os registros financeiros pertençam ao usuário demo.
- [x] Tornar a rotina idempotente: rodar mais de uma vez não deve duplicar dados.
- [x] Permitir limpar/recriar apenas os dados demo sem afetar usuários reais.
- [x] Evitar qualquer dado sensível real; CPFs, cartões, tokens e descrições devem ser fictícios ou mascarados.
- [x] Documentar no README como executar o seed e quando usá-lo.

### Massa mínima desejada

- [x] Pelo menos 4 contas.
- [x] Pelo menos 10 grupos de categoria.
- [x] Pelo menos 30 categorias.
- [x] Pelo menos 6 meses de transações.
- [x] Pelo menos 1 importação confirmada e 1 importação pendente de revisão.
- [x] Casos suficientes para validar dashboard, orçamento, fluxo de caixa, duplicidade e categorização.

---

## Fase 4 — Regras de categorização

Objetivo: reduzir trabalho manual sem perder controle.

- [x] Criar regra por texto da descrição.
- [x] Criar regra por estabelecimento/beneficiário.
- [x] Criar regra por conta.
- [x] Criar regra por valor aproximado.
- [x] Criar regra por tipo de transação.
- [x] Aplicar regras durante a revisão de importação.
- [x] Mostrar qual regra sugeriu cada categoria.
- [x] Permitir aceitar ou rejeitar sugestões.
- [x] Criar regra a partir de uma correção manual.
- [x] Reprocessar transações pendentes com regras novas.
- [x] Medir quantas transações foram categorizadas automaticamente.

---

## Fase 5 — Dashboard mensal executivo

Objetivo: ao entrar no app, entender rapidamente a situação financeira do mês.

- [x] Exibir receitas do mês.
- [x] Exibir despesas do mês.
- [x] Exibir saldo do mês.
- [x] Exibir saldo por conta.
- [x] Exibir gasto por grupo de categoria.
- [x] Exibir ranking de maiores categorias de despesa.
- [x] Exibir orçamento usado no mês.
- [x] Exibir fluxo previsto até o fim do mês.
- [x] Exibir faturas abertas de cartão.
- [x] Exibir importações pendentes de revisão.
- [x] Exibir alertas importantes.
- [x] Exibir insights principais do mês.

Alertas desejados:

- [x] Categoria acima do orçamento.
- [x] Gasto acelerado em relação ao mês anterior.
- [x] Fatura próxima do vencimento.
- [x] Conta com saldo projetado baixo.
- [x] Transações sem categoria.
- [x] Importação com muitos duplicados ou linhas inválidas.

---

## Fase 6 — Orçamento mensal

Objetivo: planejar e acompanhar limites de gasto por categoria.

- [ ] Criar orçamento mensal geral.
- [ ] Criar orçamento por grupo de categoria.
- [ ] Criar orçamento por categoria.
- [ ] Copiar orçamento de um mês para outro.
- [ ] Comparar previsto vs realizado.
- [ ] Exibir percentual consumido do orçamento.
- [ ] Alertar categorias próximas do limite.
- [ ] Alertar categorias acima do limite.
- [ ] Exibir histórico de orçamento por mês.
- [ ] Exibir variação entre meses.
- [ ] Permitir ajustar orçamento durante o mês mantendo histórico.

---

## Fase 7 — Fluxo de caixa

Objetivo: prever saldo futuro e evitar surpresas.

- [ ] Exibir entradas previstas.
- [ ] Exibir saídas previstas.
- [ ] Exibir saldo projetado por conta.
- [ ] Exibir saldo projetado consolidado.
- [ ] Separar realizado, previsto e pendente.
- [ ] Permitir visão diária, semanal, mensal e anual.
- [ ] Incluir faturas futuras de cartão.
- [ ] Incluir recorrências futuras.
- [ ] Alertar risco de saldo negativo.
- [ ] Comparar fluxo previsto vs realizado.

---

## Fase 8 — Recorrências completas

Objetivo: controlar receitas, despesas, assinaturas e contas a pagar/receber.

- [ ] Cadastrar receita recorrente.
- [ ] Cadastrar despesa recorrente.
- [ ] Cadastrar assinatura.
- [ ] Cadastrar conta a pagar.
- [ ] Cadastrar conta a receber.
- [ ] Definir frequência: semanal, mensal, anual ou personalizada.
- [ ] Definir data de vencimento.
- [ ] Definir conta padrão.
- [ ] Definir categoria padrão.
- [ ] Gerar previsão no fluxo de caixa.
- [ ] Confirmar recorrência quando aparecer em CSV importado.
- [ ] Alertar recorrência atrasada.
- [ ] Exibir ranking de assinaturas e gastos fixos.
- [ ] Sugerir cancelamento/revisão de assinaturas pouco usadas ou caras.

---

## Fase 9 — Análise de gastos

Objetivo: transformar histórico financeiro em decisões melhores.

### Rankings

- [ ] Ranking de gastos por categoria.
- [ ] Ranking de gastos por grupo.
- [ ] Ranking de gastos por conta.
- [ ] Ranking de estabelecimentos/descrições.
- [ ] Ranking de assinaturas.
- [ ] Ranking de maiores transações do período.

### Tendências

- [ ] Tendência mensal por categoria.
- [ ] Tendência mensal por grupo.
- [ ] Tendência de receitas.
- [ ] Tendência de despesas.
- [ ] Tendência de saldo.
- [ ] Comparação com mês anterior.
- [ ] Comparação com média dos últimos meses.
- [ ] Comparação com mesmo mês do ano anterior.

### Insights

- [ ] Identificar categorias que mais cresceram.
- [ ] Identificar categorias que mais reduziram.
- [ ] Identificar gastos fora do padrão.
- [ ] Identificar concentração excessiva em poucos tipos de gasto.
- [ ] Identificar gastos pequenos recorrentes que somam valor relevante.
- [ ] Identificar oportunidades de economia.
- [ ] Identificar despesas sem categoria ou mal classificadas.

---

## Fase 10 — IA assistiva local/futura

Objetivo: planejar IA desde o início sem comprometer privacidade.

Princípios:

- IA não deve ser fonte de verdade.
- IA deve sugerir, não executar mudanças definitivas sozinha.
- Toda sugestão que altera dados deve exigir confirmação.
- Preferir IA local ou futura.
- Evitar envio de dados financeiros sensíveis para serviços externos.
- Mascarar dados sigilosos antes de qualquer processamento assistido.

Tarefas:

- [ ] Sugerir categoria para transações importadas.
- [ ] Explicar por que uma categoria foi sugerida.
- [ ] Gerar resumo mensal das transações.
- [ ] Gerar resumo das receitas.
- [ ] Gerar resumo das despesas.
- [ ] Gerar resumo das contas e cartões.
- [ ] Gerar resumo de orçamento.
- [ ] Gerar resumo de fluxo de caixa.
- [ ] Detectar anomalias em gastos.
- [ ] Sugerir regras de categorização.
- [ ] Sugerir categorias para transações sem categoria.
- [ ] Sugerir oportunidades de economia.
- [ ] Criar painel de sugestões pendentes de aprovação.
- [ ] Registrar quando uma sugestão foi aceita ou rejeitada.

---

## Fase 11 — Relatórios e visualizações

Objetivo: permitir análise por período e exportação de informações.

- [ ] Visualizar por dia.
- [ ] Visualizar por semana.
- [ ] Visualizar por mês.
- [ ] Visualizar por ano.
- [ ] Filtrar qualquer relatório por conta.
- [ ] Filtrar qualquer relatório por categoria.
- [ ] Filtrar qualquer relatório por grupo.
- [ ] Filtrar qualquer relatório por tipo de transação.
- [ ] Visualizar gráfico de receitas e despesas.
- [ ] Visualizar gráfico de categorias.
- [ ] Visualizar gráfico de contas.
- [ ] Visualizar gráfico de cartões.
- [ ] Visualizar gráfico de orçamento.
- [ ] Visualizar gráfico de fluxo de caixa.
- [ ] Exportar relatório em CSV.
- [ ] Exportar relatório em PDF no futuro.

---

## Fase 12 — Segurança, privacidade e auditoria

Objetivo: proteger dados financeiros e reduzir risco de vazamento acidental.

- [ ] Definir lista de dados sigilosos que nunca devem ser exibidos sem máscara.
- [ ] Mascarar CPF.
- [ ] Mascarar número de cartão.
- [ ] Mascarar senhas, tokens e chaves.
- [ ] Evitar salvar senhas ou credenciais bancárias.
- [ ] Criar rotina para sanitizar descrições importadas.
- [ ] Permitir apagar arquivos brutos importados.
- [ ] Permitir apagar dados de uma conta específica.
- [ ] Registrar histórico de importações.
- [ ] Registrar alterações relevantes em transações.
- [ ] Registrar aceite/rejeição de sugestões de IA.
- [ ] Permitir exportar dados do usuário.
- [ ] Permitir excluir todos os dados financeiros do usuário.

---

## Fase 13 — Qualidade de uso

Objetivo: deixar o app confortável para uso contínuo.

- [ ] Criar onboarding para primeira conta.
- [ ] Criar onboarding para primeira importação CSV.
- [ ] Criar exemplos de categorias iniciais.
- [ ] Criar atalhos para categorizar rápido.
- [ ] Criar edição em lote de transações.
- [ ] Criar busca global.
- [ ] Criar filtros salvos.
- [ ] Criar indicadores de dados pendentes.
- [ ] Criar mensagens claras de erro na importação.
- [ ] Criar tela de ajuda sobre como exportar CSV dos bancos.
- [ ] Criar modo escuro/claro, se necessário.

---

## Ordem recomendada de execução

1. Fundação técnica e modelo de dados.
2. Contas, categorias e transações manuais.
3. Importação CSV com revisão obrigatória.
4. Templates por instituição e detecção de duplicados.
5. Seed local com dados realistas para desenvolvimento e validação visual.
6. Regras de categorização.
7. Dashboard mensal executivo.
8. Orçamento mensal.
9. Fluxo de caixa.
10. Recorrências.
11. Análises avançadas de gastos.
12. IA assistiva local/futura.
13. Relatórios, privacidade e acabamento.

---

## Critérios de validação do produto

- [ ] É possível importar CSVs de bancos diferentes sem retrabalho excessivo.
- [ ] É possível importar faturas de cartão sem duplicar despesa no pagamento da fatura.
- [ ] Toda transação pertence a uma conta e a um usuário.
- [ ] Gastos conseguem ser analisados por grupo, categoria, conta e período.
- [ ] O dashboard mensal responde rapidamente: quanto entrou, quanto saiu, onde foi gasto e o que merece atenção.
- [ ] O orçamento mostra previsto vs realizado.
- [ ] O fluxo de caixa mostra saldo futuro provável.
- [ ] Recorrências aparecem como previsões e podem ser confirmadas depois.
- [ ] IA sugere e resume, mas não altera dados sem confirmação.
- [ ] Dados sigilosos são mascarados ou removidos quando necessário.
- [ ] Importações podem ser auditadas e desfeitas.
