# Finance App

Aplicativo web PT-BR para controle de finanças pessoais.

## Fundação atual

- Autenticação por email e senha com Better Auth, incluindo fluxo de "esqueci minha senha" via link por email.
- Painel inicial com estado vazio útil.
- Modelo financeiro em Drizzle com tabelas prefixadas por `finance_app_`.
- Tabelas do Better Auth mantidas sem prefixo: `user`, `session`, `account`, `verification`.
- Valores em BRL armazenados como centavos positivos; o tipo de movimentação define receita, despesa ou transferência.
- Importação CSV modelada para revisão, sem armazenamento de CSV bruto por padrão.

## Documentos

- `projeto.md`: desejo inicial do produto.
- `dominio.md`: decisões de domínio financeiro.
- `tarefas.md`: roadmap por fase.

## Comandos

```bash
bun run dev
bun run check
bun run typecheck
bun run db:generate
bun run db:migrate
bun run db:seed
bun run db:sanitize -- --email <email>
```

## Recuperação de senha

- Link "Esqueci minha senha" na tela de entrada leva para `/esqueci-senha`.
- O backend usa Better Auth (`requestPasswordReset` / `resetPassword`) com token de 1 hora, single-use, e revoga todas as outras sessões ao redefinir.
- A resposta para o pedido é sempre genérica para evitar enumeração de emails.
- Email transacional: `RESEND_API_KEY` e `EMAIL_FROM` em `.env`.
  - Em produção ambos são obrigatórios (validado em `src/env.js`).
  - Em dev, se vazios, o link é impresso no console do servidor (procure por `[email:dev]`) para que o desenvolvedor copie manualmente.

## Seed local de desenvolvimento

`bun run db:seed` cria/reusa o usuário demo via Better Auth e recria apenas os dados financeiros/de importação desse usuário.

Credenciais fixas, somente para desenvolvimento local:

- Email: `demo@finance.local`
- Senha: `Demo@123456`

O seed não apaga outros usuários nem dados financeiros de outros usuários. Os exemplos de importação usam somente valores mascarados. A massa inclui recorrências realistas (salário, aluguel, assinaturas e contas avulsas) com parte das transações dos últimos meses vinculada para validar dashboard e fluxo de caixa.

## Privacidade e auditoria

A política oficial de dados sigilosos vive em `src/lib/sensitive-data.ts` e é documentada em `dominio.md`. Toda escrita de texto livre (transações, recorrências, lotes de importação) passa pela mesma função de mascaramento.

A página `/configuracoes` cobre quatro abas:

- **Privacidade**: lista de dados sigilosos, status do armazenamento de CSV bruto e botão para re-sanitizar todo o histórico do usuário.
- **Auditoria**: histórico filtrável de eventos relevantes (criações, atualizações, arquivamentos, sanitizações e deleções).
- **Sugestões da IA**: histórico de sugestões com aceite/rejeição e timestamp da decisão.
- **Dados**: download do JSON com todas as tabelas financeiras, hard-delete de contas arquivadas e limpeza completa dos dados financeiros (mantém a conta de login).

O comando `bun run db:sanitize -- --email <email>` re-aplica as regras de mascaramento em transações, recorrências, lotes e templates do usuário informado. É idempotente: rodar duas vezes seguidas não muda nada na segunda execução.

## Relatórios

A página `/reports` reúne relatórios por período com filtros de conta, grupo, categoria e tipo de transação. Ela exibe visualizações de receitas/despesas, categorias, grupos, contas, cartões, orçamento e fluxo de caixa.

Cada painel pode ser exportado em CSV no formato BR: UTF-8 com BOM, separador `;`, datas `DD/MM/AAAA` e decimais com `,`.

Os gráficos usam Recharts. O pacote `react-is` deve casar com a versão de React instalada; por isso `package.json` fixa `react-is@19.2.6` via `overrides`/`resolutions`.
