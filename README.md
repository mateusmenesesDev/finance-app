# Finance App

Aplicativo web PT-BR para controle de finanças pessoais.

## Fundação atual

- Autenticação por email e senha com Better Auth.
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
```

## Seed local de desenvolvimento

`bun run db:seed` cria/reusa o usuário demo via Better Auth e recria apenas os dados financeiros/de importação desse usuário.

Credenciais fixas, somente para desenvolvimento local:

- Email: `demo@finance.local`
- Senha: `Demo@123456`

O seed não apaga outros usuários nem dados financeiros de outros usuários. Os exemplos de importação usam somente valores mascarados.
