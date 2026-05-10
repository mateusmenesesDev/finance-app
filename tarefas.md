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
- [x] Casos suficientes para validar dashboard, orçamento, fluxo de caixa, duplicidade, categorização e recorrências.

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

- [x] Criar orçamento mensal geral.
- [x] Criar orçamento por grupo de categoria.
- [x] Criar orçamento por categoria.
- [x] Copiar orçamento de um mês para outro.
- [x] Comparar previsto vs realizado.
- [x] Exibir percentual consumido do orçamento.
- [x] Alertar categorias próximas do limite.
- [x] Alertar categorias acima do limite.
- [x] Exibir histórico de orçamento por mês.
- [x] Exibir variação entre meses.
- [x] Permitir ajustar orçamento durante o mês mantendo histórico.

---

## Fase 7 — Fluxo de caixa

Objetivo: prever saldo futuro e evitar surpresas.

- [x] Exibir entradas previstas.
- [x] Exibir saídas previstas.
- [x] Exibir saldo projetado por conta.
- [x] Exibir saldo projetado consolidado.
- [x] Separar realizado, previsto e pendente.
- [x] Permitir visão diária, semanal, mensal e anual.
- [x] Incluir faturas futuras de cartão.
- [x] Incluir recorrências futuras.
- [x] Alertar risco de saldo negativo.
- [x] Comparar fluxo previsto vs realizado.

---

## Fase 8 — Recorrências completas

Objetivo: controlar receitas, despesas, assinaturas e contas a pagar/receber.

- [x] Cadastrar receita recorrente.
- [x] Cadastrar despesa recorrente.
- [x] Cadastrar assinatura.
- [x] Cadastrar conta a pagar.
- [x] Cadastrar conta a receber.
- [x] Definir frequência: semanal, mensal, anual ou personalizada.
- [x] Definir data de vencimento.
- [x] Definir conta padrão.
- [x] Definir categoria padrão.
- [x] Gerar previsão no fluxo de caixa.
- [x] Confirmar recorrência quando aparecer em CSV importado.
- [x] Alertar recorrência atrasada.
- [x] Exibir ranking de assinaturas e gastos fixos.
- [x] Sugerir cancelamento/revisão de assinaturas pouco usadas ou caras.

---

## Fase 9 — Análise de gastos

Objetivo: transformar histórico financeiro em decisões melhores.

### Rankings

- [x] Ranking de gastos por categoria.
- [x] Ranking de gastos por grupo.
- [x] Ranking de gastos por conta.
- [x] Ranking de estabelecimentos/descrições.
- [x] Ranking de assinaturas.
- [x] Ranking de maiores transações do período.

### Tendências

- [x] Tendência mensal por categoria.
- [x] Tendência mensal por grupo.
- [x] Tendência de receitas.
- [x] Tendência de despesas.
- [x] Tendência de saldo.
- [x] Comparação com mês anterior.
- [x] Comparação com média dos últimos meses.
- [x] Comparação com mesmo mês do ano anterior.

### Insights

- [x] Identificar categorias que mais cresceram.
- [x] Identificar categorias que mais reduziram.
- [x] Identificar gastos fora do padrão.
- [x] Identificar concentração excessiva em poucos tipos de gasto.
- [x] Identificar gastos pequenos recorrentes que somam valor relevante.
- [x] Identificar oportunidades de economia.
- [x] Identificar despesas sem categoria ou mal classificadas.

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

- [x] Sugerir categoria para transações importadas.
- [x] Explicar por que uma categoria foi sugerida.
- [x] Gerar resumo mensal das transações.
- [x] Gerar resumo das receitas.
- [x] Gerar resumo das despesas.
- [x] Gerar resumo das contas e cartões.
- [x] Gerar resumo de orçamento.
- [x] Gerar resumo de fluxo de caixa.
- [x] Detectar anomalias em gastos.
- [x] Sugerir regras de categorização.
- [x] Sugerir categorias para transações sem categoria.
- [x] Sugerir oportunidades de economia.
- [x] Criar painel de sugestões pendentes de aprovação.
- [x] Registrar quando uma sugestão foi aceita ou rejeitada.

---

## Fase 11 — Relatórios e visualizações

Objetivo: permitir análise por período e exportação de informações.

- [x] Visualizar por dia.
- [x] Visualizar por semana.
- [x] Visualizar por mês.
- [x] Visualizar por ano.
- [x] Filtrar qualquer relatório por conta.
- [x] Filtrar qualquer relatório por categoria.
- [x] Filtrar qualquer relatório por grupo.
- [x] Filtrar qualquer relatório por tipo de transação.
- [x] Visualizar gráfico de receitas e despesas.
- [x] Visualizar gráfico de categorias.
- [x] Visualizar gráfico de contas.
- [x] Visualizar gráfico de cartões.
- [x] Visualizar gráfico de orçamento.
- [x] Visualizar gráfico de fluxo de caixa.
- [x] Exportar relatório em CSV.
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
- [ ] Revisar preferências de aparência e acessibilidade após uso contínuo.

---

## Fase 14 — Clareza visual, tema e experiência base

Objetivo: reduzir sobrecarga cognitiva nos fluxos já construídos, deixando a UI legível, hierárquica e confortável em tema claro e escuro.

### Diagnóstico e princípios de UX

- [ ] Mapear telas com excesso de informação, começando por dashboard, transações, contas, importação e revisão de CSV.
- [ ] Definir a tarefa principal de cada tela e esconder ou rebaixar dados que não ajudam nessa tarefa.
- [ ] Criar hierarquia visual consistente para título, resumo, ação primária, filtros, listas, detalhes e alertas.
- [ ] Usar divulgação progressiva: mostrar resumo primeiro e detalhes somente quando o usuário expandir, filtrar ou entrar no item.
- [ ] Separar estados de atenção: informação normal, pendência, alerta, erro e ação destrutiva.
- [ ] Reduzir cards, badges, cores e métricas concorrendo pela atenção na mesma área.
- [ ] Padronizar textos curtos, vazios úteis, erros e confirmações em português claro.

### Layout e navegação

- [ ] Revisar navegação principal para destacar os fluxos centrais: Dashboard, Transações, Contas, Importações, Categorias e Relatórios.
- [ ] Criar visão resumida para listas densas, com opção de abrir detalhe lateral ou página de detalhe.
- [ ] Agrupar filtros avançados em uma área recolhível.
- [ ] Definir estados vazios orientados à próxima ação, não apenas mensagens genéricas.
- [ ] Melhorar legibilidade de tabelas/listas: espaçamento, alinhamento monetário, datas, descrição e categoria.
- [ ] Garantir ações primárias claras e poucas ações secundárias visíveis por vez.
- [ ] Revisar experiência mobile/responsiva para não empilhar informação demais.

### Tema visual

- [ ] Definir tokens de design mínimos: cores, fundo, superfície, borda, texto, texto secundário, sucesso, alerta, erro e foco.
- [ ] Substituir cores soltas por tokens sem criar abstração desnecessária.
- [ ] Criar tema claro como padrão inicial.
- [ ] Criar tema escuro com contraste suficiente para uso contínuo.
- [ ] Permitir escolher entre claro, escuro e preferência do sistema.
- [ ] Persistir preferência de tema por usuário ou localmente quando o usuário não estiver autenticado.
- [ ] Evitar usar apenas cor para indicar estado; combinar cor com texto, ícone ou posição.
- [ ] Validar contraste de textos, botões, inputs, gráficos e badges nos dois temas.

### Componentes e consistência

- [ ] Revisar botões, inputs, selects, dialogs, dropdowns, cards, tabelas e badges para consistência visual.
- [ ] Padronizar formatação de moeda, datas, percentuais e valores negativos/positivos.
- [ ] Padronizar loading, skeleton, erro, vazio e sucesso nos fluxos principais.
- [ ] Melhorar feedback de ações: salvar, importar, desfazer, aplicar filtros, editar em lote e excluir/arquivar.
- [ ] Garantir foco visível, navegação por teclado e labels acessíveis nos controles principais.
- [ ] Criar exemplos visuais com dados do seed para validar telas densas sem dados reais.

### Critérios de aceite

- [ ] Uma tela inicial não deve exibir mais métricas do que o necessário para responder “como está meu mês?”.
- [ ] Listas densas devem permitir varrer informação rapidamente sem abrir todos os detalhes.
- [ ] O usuário deve conseguir alternar claro/escuro/sistema sem recarregar o app.
- [ ] A preferência de tema deve permanecer após fechar e abrir o app.
- [ ] Telas principais devem funcionar bem com dados vazios, poucos dados e muitos dados.
- [ ] A UI deve ser validada com a massa realista da Fase 3.5.

---

## Fase 15 — Arquitetura simples e organização sustentável do código

Objetivo: reduzir acoplamento e facilitar manutenção das próximas fases sem criar camadas artificiais, mantendo regras de negócio testáveis e telas fáceis de entender.

Princípios:

- Preferir organização por domínio/feature em vez de pastas genéricas gigantes.
- Criar abstração somente quando ela reduzir duplicação real, acoplamento ou risco de mudança.
- Manter Server Components, Server Actions e rotas como adaptadores finos; regras financeiras devem ficar fora da camada de interface.
- Derivar tipos do banco, schemas de validação e contratos existentes quando possível, evitando tipos paralelos inconsistentes.
- Não criar `features`, `modules` e `services` para representar a mesma coisa; escolher nomes claros e manter fronteiras simples.
- Testar regras de domínio antes/depois de refatorar: red-green-refactor, com comportamento preservado.

### Diagnóstico inicial

- [ ] Mapear arquivos grandes ou com muitas responsabilidades, começando por dashboard, importação CSV, ações financeiras e schema do banco.
- [ ] Identificar lógica de domínio misturada com UI, `FormData`, redirects, revalidation, queries Drizzle e formatação visual.
- [ ] Identificar duplicações reais de formatação, validação, enums, filtros, consultas e componentes de UI.
- [ ] Listar fluxos críticos que não podem mudar durante a refatoração: contas, categorias, transações, importação, revisão, duplicidade e seed.
- [ ] Criar testes de caracterização para regras importantes antes de mover código quando ainda não houver cobertura suficiente.

### Estrutura alvo mínima

- [ ] Manter `src/app` focado em rotas, composição de telas, carregamento inicial e adapters de framework.
- [ ] Criar `src/features` para domínios do produto somente quando houver código suficiente para justificar a extração.
- [ ] Organizar features por domínio, por exemplo:
  - [ ] `accounts`
  - [ ] `categories`
  - [ ] `transactions`
  - [ ] `imports`
  - [ ] `dashboard`
  - [ ] `budgets`, `cash-flow`, `recurrences` e `reports` quando essas fases forem implementadas
- [ ] Dentro de cada feature, usar nomes diretos e poucos arquivos: `components`, `actions`, `queries`, `use-cases`, `schemas`, `types` e `domain` apenas quando necessários.
- [ ] Criar `src/shared` apenas para código realmente compartilhado entre features, como UI base, formatação, datas, moeda, validações comuns e helpers sem dependência do domínio.
- [ ] Usar `src/types` somente para tipos transversais da aplicação; preferir tipos colocalizados na feature quando o uso for local.
- [ ] Evitar uma pasta global `services` genérica; quando existir serviço, ele deve representar uma integração ou caso de uso claro dentro da feature.
- [ ] Avaliar divisão do schema Drizzle por domínio se o arquivo único dificultar manutenção, mantendo um barrel claro para migrations e imports.

### Fronteiras e dependências

- [ ] Server Actions devem fazer apenas autenticação, parsing de entrada, chamada de caso de uso e resposta/revalidation.
- [ ] Casos de uso devem receber dados tipados e `userId` explícito, validar invariantes e coordenar persistência.
- [ ] Regras financeiras puras devem ficar em funções testáveis sem dependência de React, Next.js ou Drizzle.
- [ ] Queries de leitura reutilizáveis devem sair das páginas quando forem usadas em mais de uma tela ou tiverem regra de negócio relevante.
- [ ] Componentes de UI devem receber dados prontos para renderização e evitar conhecer detalhes do banco.
- [ ] Código em `shared` não deve importar features; features podem importar `shared`.
- [ ] Features não devem depender uma da outra livremente; quando necessário, extrair contrato mínimo compartilhado ou mover regra para domínio mais apropriado.
- [ ] Autorização multiusuário deve continuar explícita em toda leitura e escrita financeira.

### DRY, SOLID e KISS aplicados ao app

- [ ] Remover duplicação de validações e enums usando schemas/tipos únicos por domínio.
- [ ] Padronizar formatação de moeda, data, percentual e sinal financeiro em um ponto compartilhado.
- [ ] Consolidar filtros de transações/importações quando a regra for a mesma em páginas diferentes.
- [ ] Extrair componentes repetidos de formulário, tabela e estado vazio somente quando houver repetição real e a API ficar simples.
- [ ] Separar responsabilidades sem fragmentar fluxo coeso em funções pequenas demais.
- [ ] Evitar interfaces/repositórios abstratos sem múltiplas implementações ou benefício claro de teste.
- [ ] Preferir funções explícitas e nomes de domínio a helpers genéricos como `processData`, `handleItem` ou `utils` grandes.

### Refatoração incremental

- [ ] Refatorar uma feature por vez, começando por importação CSV ou transações se forem os módulos mais acoplados.
- [ ] Para cada feature, mover primeiro regras puras, depois queries/use-cases, depois componentes.
- [ ] Manter commits pequenos e reversíveis por fluxo de usuário.
- [ ] Não reescrever telas só para mudar pastas; cada movimento deve reduzir complexidade observável.
- [ ] Preservar URLs, contratos de formulário, dados existentes e comportamento visual salvo quando a mudança for intencional.
- [ ] Atualizar imports e remover arquivos mortos a cada etapa.
- [ ] Documentar no README ou em `docs/architecture.md` a estrutura escolhida, regras de dependência e exemplos de onde colocar código novo.

### Testes e validação técnica

- [ ] Garantir testes unitários para normalização de CSV, detecção de duplicidade, categorização, saldo, fatura e orçamento conforme forem extraídos.
- [ ] Adicionar testes de integração leves para casos de uso críticos quando a lógica depender de banco.
- [ ] Rodar lint, typecheck, testes e seed após cada refatoração relevante.
- [ ] Validar manualmente fluxos principais com a massa realista da Fase 3.5.
- [ ] Garantir que a refatoração não cria dependência circular, arquivo barril confuso ou camada sem responsabilidade clara.

### Critérios de aceite

- [ ] `src/app` deve estar majoritariamente livre de regra financeira complexa.
- [ ] Regras de domínio importantes devem ser testáveis sem subir Next.js.
- [ ] Código compartilhado deve existir por necessidade comprovada, não por antecipação.
- [ ] Um desenvolvedor deve saber onde adicionar uma nova regra de transação, importação ou dashboard sem procurar em muitos lugares.
- [ ] Arquivos grandes devem ter responsabilidade clara; quando acumularem fluxos diferentes, devem ser divididos por feature ou caso de uso.
- [ ] A arquitetura deve ajudar as próximas fases sem exigir boilerplate para tarefas simples.

---

## Fase 16 — Reporte de bugs e sugestões de features

Objetivo: criar canal direto dentro do app para o usuário reportar problemas e propor melhorias, sem depender de ferramentas externas e sem vazar dados financeiros sensíveis.

Princípios:

- Modelar bug, sugestão de feature e feedback geral como uma única entidade `feedback` com campo `tipo`, evitando duplicar tabelas, telas e regras.
- Cada usuário visualiza e altera apenas seus próprios reportes; isolamento multiusuário deve continuar explícito.
- Coleta de contexto técnico deve ser opcional, transparente e nunca incluir dados financeiros do usuário.
- O fluxo deve ser leve: abrir, descrever, enviar; não virar sistema de tickets completo.

### Domínio

- [ ] Definir entidade `feedback` com `id`, `usuário`, `tipo`, `título`, `descrição`, `status`, `criado_em` e `atualizado_em`.
- [ ] Definir tipos suportados:
  - [ ] Bug
  - [ ] Sugestão de feature
  - [ ] Outro/feedback geral
- [ ] Definir status do reporte:
  - [ ] Aberto
  - [ ] Em análise
  - [ ] Resolvido
  - [ ] Recusado
  - [ ] Duplicado
- [ ] Definir campos opcionais de contexto técnico: rota atual, versão do app, navegador/SO, identificador da sessão.
- [ ] Definir limites de tamanho para título e descrição e mensagens de erro claras.

### Envio de reporte

- [ ] Criar ponto de acesso visível em todas as telas (ex.: item no menu ou botão flutuante discreto).
- [ ] Criar formulário com tipo, título, descrição e anexos opcionais.
- [ ] Pré-preencher rota atual e dados técnicos não sensíveis quando o usuário consentir.
- [ ] Permitir ao usuário revisar e remover qualquer dado de contexto antes de enviar.
- [ ] Bloquear envio de campos vazios ou claramente inválidos com mensagem útil.
- [ ] Confirmar envio com mensagem clara e link para acompanhar o reporte.

### Acompanhamento pelo usuário

- [ ] Listar reportes do próprio usuário com tipo, título, status e data.
- [ ] Filtrar a lista por tipo e status.
- [ ] Exibir detalhe do reporte com histórico de mudanças de status.
- [ ] Permitir editar título e descrição enquanto o status estiver `Aberto`.
- [ ] Permitir cancelar/arquivar reporte próprio sem apagar histórico do mantenedor.
- [ ] Notificar o usuário quando o status do reporte mudar.

### Privacidade e segurança

- [ ] Avisar explicitamente que descrição e anexos podem ser lidos pelo mantenedor.
- [ ] Não incluir transações, saldos, CPF, números de cartão ou tokens no contexto técnico automático.
- [ ] Sanitizar descrição usando as mesmas regras de dados sigilosos da importação CSV.
- [ ] Permitir ao usuário excluir seus reportes ao excluir a conta.
- [ ] Registrar quem leu e respondeu cada reporte para auditoria interna.

### Operação do mantenedor

- [ ] Definir como o mantenedor acessa os reportes (rota administrativa restrita ou exportação).
- [ ] Permitir alterar status e adicionar resposta visível ao usuário.
- [ ] Permitir marcar reporte como duplicado vinculando ao reporte original.
- [ ] Exibir métricas básicas: reportes abertos, tempo médio até resposta, principais áreas afetadas.

### Critérios de aceite

- [ ] Usuário consegue abrir um reporte em menos de um minuto a partir de qualquer tela.
- [ ] Usuário só vê seus próprios reportes; nenhum dado financeiro vaza no contexto enviado.
- [ ] Mantenedor consegue triar, responder e fechar reportes sem ferramenta externa.
- [ ] Mudanças de status chegam ao usuário sem precisar consultar manualmente.

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
14. Clareza visual, tema claro/escuro e experiência base.
15. Arquitetura simples e organização sustentável do código.
16. Reporte de bugs e sugestões de features.

---

## Critérios de validação do produto

- [ ] A interface reduz sobrecarga cognitiva, prioriza a próxima ação e não mostra tudo ao mesmo tempo.
- [ ] O usuário pode escolher tema claro, escuro ou preferência do sistema, com contraste adequado.
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
- [ ] A organização do código permite evoluir features sem espalhar regra de negócio por páginas, actions e helpers genéricos.
