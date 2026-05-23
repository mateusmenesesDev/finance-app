# Arquitetura

Este app usa organização incremental por domínio, sem camadas genéricas obrigatórias.

## Regras práticas

- `src/app` contém rotas, Server Components, Server Actions e composição de UI.
- Server Actions devem ser adaptadores: autenticar, ler `FormData`, chamar regra/caso de uso, revalidar ou redirecionar.
- Regras de domínio puras ficam fora de `src/app` e não importam React, Next.js ou Drizzle.
- `src/features/<domínio>` existe somente quando há código de domínio real para agrupar.
- `src/lib` permanece para código compartilhado legado ou transversal. Wrappers podem existir para preservar imports antigos durante migrações curtas.
- Não criar `services`, repositórios, barrels ou interfaces abstratas sem redução clara de complexidade.

## Imports CSV

Primeira extração de domínio:

- `src/features/imports/csv-domain.ts`: normalização de template, parsing CSV, normalização de descrição e chave de duplicidade.
- `src/features/imports/category-rules.ts`: matching e desempate de regras de importação.
- `src/features/imports/confirm-domain.ts`: resolução/erro de categoria na confirmação.
- `src/features/imports/batch-domain.ts`: montagem de linhas de lote, duplicidade, sugestões de regra e recorrência.

A UI continua em `src/app/import`. As exports antigas em `src/lib/import-*` reexportam os módulos novos para preservar compatibilidade enquanto chamadas antigas forem migradas.

## Onde colocar código novo

- Nova regra pura de importação: `src/features/imports/*` com teste ao lado.
- Mudança visual ou formulário da importação: `src/app/import`.
- Coordenação com banco/autenticação: manter no Server Action até haver caso de uso claro e testável para extrair.
- Código usado por vários domínios e sem regra financeira específica: avaliar `src/lib` antes de criar outra pasta.
