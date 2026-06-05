# Plan: Lembretes Mensais de Importação

> Source PRD: `plans/prd-monthly-import-reminders.md`

## Architectural decisions

Durable decisions that apply across all phases:

- **Routes**: checklist only on the dashboard (`/` with `?month=YYYY-MM` as the **routine cycle** month); inline configuration on accounts and credit cards list/detail surfaces; shortcuts to `/import` via query params (`accountId`, `cardId`, `invoiceMonthKey`) — today only `batchId` is supported.
- **Schema**:
  - `import_routine_items`: `userId`, `kind` (`account_statement` | `card_invoice`), exactly one of `accountId` or `cardId`, `createdAt`, optional `sortOrder`; unique per `(userId, accountId)` and `(userId, cardId)` where not null.
  - `import_routine_completions`: `userId`, `routineItemId`, `cycleMonthKey` (`YYYY-MM`), `completedAt`; unique `(userId, routineItemId, cycleMonthKey)`.
  - FKs with `onDelete: cascade` from item → completions; item removed when linked account/card is deleted.
- **Key models**: `ImportRoutineItem`, `ImportRoutineCompletion`; domain helpers for `referenceMonthKey(cycleMonthKey)` (always previous calendar month), `shouldShowRoutineBlock(...)`, `routineProgress(...)`.
- **Auth**: every query and server action scopes by `userId` from Better Auth session, consistent with the rest of the app.
- **Completion**: manual checkbox only; never reads `importBatches` or transaction counts.
- **Copy**: PT-BR labels — “Rotina de importação”, “Extrato”, “Fatura”, “Importar movimentações de {mês/ano}”.

---

## Phase 1: Fundação de dados e domínio

**User stories**: 14, 16, 27, 39 (data isolation at persistence layer)

### What to build

Add the two new tables via Drizzle schema and migration. Export types and relations alongside existing finance tables.

Implement a small pure domain module for routine cycles: given a `cycleMonthKey`, compute `referenceMonthKey` (previous month); given today's date, selected cycle, and whether the user has active routine items, compute whether the dashboard block should render; given items and a completion map for a cycle, compute `completedCount`, `totalCount`, and `isFullyComplete`.

Unit tests cover month-boundary edge cases (January cycle → December reference), visibility rules (before day 1 of current cycle hidden; day 1+ visible; past cycles always visible when items exist), and progress aggregation.

No UI in this phase — behavior is verified through migration + tests.

### Acceptance criteria

- [ ] Migration applies cleanly and creates both tables with constraints described in architectural decisions
- [ ] `referenceMonthKey("2026-01")` → `"2025-12"` and `referenceMonthKey("2026-06")` → `"2026-05"`
- [ ] `shouldShowRoutineBlock` returns false for current cycle when today is before day 1 of that month
- [ ] `shouldShowRoutineBlock` returns true for current cycle on day 1 and after, when user has ≥1 routine item
- [ ] `shouldShowRoutineBlock` returns true when viewing a past cycle via month selector, when user has ≥1 routine item
- [ ] `routineProgress` returns correct `n/total` and `isFullyComplete` for partial and full completion sets
- [ ] All new unit tests pass

---

## Phase 2: Configuração inline da rotina

**User stories**: 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 41, 47

### What to build

Server actions to add and remove accounts and credit cards from the routine, with validation: account not archived and `type !== credit_card`; card active and not archived; reject duplicate membership.

On the accounts page, each eligible account shows whether it is already in the routine and offers “Adicionar à rotina” / “Remover da rotina”. Same pattern on the credit cards page.

When the user has zero routine items, the dashboard (in a later phase) will show guidance — in this phase, ensure accounts/cards surfaces make the path obvious (empty-state copy or link hint acceptable on dashboard stub if already touched).

Renaming an account or card continues to flow through existing entities — routine labels read live names from joins, not denormalized snapshots.

### Acceptance criteria

- [ ] User can add a checking account to the routine and see it marked as “na rotina” on the accounts list
- [ ] User can add a credit card to the routine from the cards page
- [ ] User cannot add the same account or card twice (clear error or no-op)
- [ ] User cannot add an archived account or inactive/archived card
- [ ] User cannot add a `credit_card` type account as an extrato reminder
- [ ] User can remove an item from the routine and it disappears from future cycles
- [ ] Two accounts at the same institution can both be in the routine independently
- [ ] Two cards at the same institution can both be in the routine independently
- [ ] Routine item rows are isolated per `userId` (another user cannot see or mutate them)
- [ ] Adding a fourth bank later does not affect items or completions from earlier months

---

## Phase 3: Checklist no dashboard (ciclo + histórico + marcar)

**User stories**: 13, 15, 17, 18, 19, 20, 21, 22, 23, 24, 25, 28, 31, 32, 38, 42, 43, 44, 45, 46

### What to build

Dashboard block “Rotina de importação” positioned above pending imports. Loads active routine items joined with account/card name and institution for the cycle selected by the existing month picker (`month` query param = `cycleMonthKey`).

Block header shows reference period copy (“Importar movimentações de maio/2026” when cycle is June 2026). Each row: checkbox, label “Extrato — {nome}” or “Fatura — {nome}”, institution subtitle, basic visual distinction between extrato and fatura.

Progress indicator `n/total`. Server actions to mark and unmark completion for `(routineItemId, cycleMonthKey)`; revalidate dashboard path after mutation.

Visibility follows domain rules from Phase 1. Incomplete items stay visible after day 1 until checked. When all items are complete, show a concluded state (full card, not hidden yet — compaction comes in Phase 4).

Historical navigation: changing month on dashboard shows that cycle's checklist state; user can mark/unmark items in past cycles.

Empty routine: if no items configured, show clear empty state pointing user to add items from accounts/cards pages.

### Acceptance criteria

- [ ] With ≥1 routine item and cycle visible, dashboard shows the routine block
- [ ] Before day 1 of the current calendar month, the **current** cycle block is hidden (past months still accessible via month picker)
- [ ] On day 1 of June 2026, block title/body references May 2026 data
- [ ] User can check an item as done; unchecked items remain pending
- [ ] User can uncheck a previously completed item
- [ ] Marking done does not create or confirm any import batch
- [ ] Completion for June cycle does not affect May cycle checkboxes
- [ ] Progress shows e.g. `4/6` when four of six items are done
- [ ] On day 5 with pending items, block still lists what's missing
- [ ] Navigating to June cycle in July shows June's checklist including any item left unchecked (e.g. C6 fatura)
- [ ] User can mark an item done even when there were no movements that month
- [ ] Typical setup (3 accounts + 3 cards) shows six reminders with bank names visible
- [ ] Month picker on dashboard drives which cycle's checklist is shown
- [ ] All copy is PT-BR and consistent with product tone

---

## Phase 4: Polish de UX no dashboard

**User stories**: 19, 26, 29, 30, 36, 37

### What to build

Improve checklist interaction so toggling feels instant (`useTransition`, optimistic UI, or equivalent pattern used elsewhere in the app).

On day 1 of the **current** cycle only, apply stronger visual emphasis (badge “Hoje é dia 1”, border, or similar).

When all items in the **current** cycle are complete, collapse or compact the block so the dashboard stays scannable; user can still expand or uncheck items.

Strengthen extrato vs fatura scanning (icons, badges, or grouped sections).

### Acceptance criteria

- [ ] Toggling a checkbox does not require a full-page reload; feedback appears immediately with server reconciliation
- [ ] On day 1 of the current month, the routine block is visually more prominent than on other days
- [ ] When current cycle is 100% complete, the block uses a compact/collapsed presentation by default
- [ ] User can still uncheck items from the compact state
- [ ] Extrato and fatura rows are distinguishable at a glance without reading full text
- [ ] Progress `n/total` remains accurate after optimistic updates

---

## Phase 5: Atalhos para importação e ciclo de vida

**User stories**: 8, 33, 34, 35, 40, optional audit events from PRD

### What to build

Each checklist row links to `/import` with query params: extrato → `accountId`; fatura → `cardId` + `invoiceMonthKey` derived from `referenceMonthKey` and the card's closing/due rules. Extend the import page to read these params and pre-select account/card and invoice month in the upload form. If invoice month cannot be derived unambiguously, show helper text near the link or on the import form without blocking manual checkbox completion.

When an account or card is deleted, cascade removes the routine item (and its completions). When archived, either remove from routine or exclude from active queries — behavior must be predictable and documented in code comments if ambiguous.

If the app already audits similar mutations, record add/remove routine item and mark/unmark completion events.

### Acceptance criteria

- [ ] Clicking an extrato reminder opens `/import` with the correct account pre-selected
- [ ] Clicking a fatura reminder opens `/import` in card mode with correct card and a sensible default `invoiceMonthKey` for the reference data month
- [ ] Import page works normally when opened without query params (no regression)
- [ ] Deleting an account or card removes its routine item; dashboard no longer lists it
- [ ] Archived accounts/cards no longer appear as active routine reminders
- [ ] Audit log entries exist for routine mutations if audit is enabled elsewhere in the app (otherwise explicitly deferred with a comment in PR/commit)
- [ ] User can complete the full monthly workflow: configure six items → see dashboard on day 1 → import via shortcut → mark all done
