# Промпт разработчику Krok: реестр агентов + правка approved-спек как предписание

Дата: 2026-10-26. Источник: работа над проектом U1 Hiring (`akturt/u1-hiring`, потребитель Krok как submodule `docs/.control`, закреплён на `9cf9987`; `master` Krok на момент написания — `84f13cd`). Задача для разработчика Krok: сделать PR в `akturt/krok`. Ниже всё, что нужно, без обращения к чату.

Не правь Krok из потребителя (`docs/.control/` в проектах — только чтение). Работай в своём клоне Krok.

---

## 1. Что найдено (факты, проверенные в U1)

### 1.1. Агенты Krok не регистрируются в Claude Code как субагенты

- Claude Code регистрирует субагента из `.claude/agents/<file>.md` по полям frontmatter **`name`** и **`description`** (необязательно `tools`, `model`), читая файлы **при старте сессии**. Нет `name`/`description` → `Agent(subagent_type: "<role>")` отвечает `Agent type '<role>' not found. Available agents: …`.
- В потребителе U1 файлы `.claude/agents/*.md` (копии ролей Krok) имели только Krok-поля (`schema`, `id`, `type`, `status`, `date`, `owners`, `capabilities`, `knowledge`, …). Ни одна роль не появлялась в списке агентов сессии. Это подтверждено: в сессии были доступны только встроенные `claude, claude-code-guide, Explore, general-purpose, Plan, statusline-setup`.
- Проверено исправление: после добавления `name`, `description`, `tools` в `frontend-contract-auditor.md` новая сессия (`claude -p` в репозитории) резолвит тип и сообщает инструменты `Read, Grep, Glob, Bash`. Текущая (уже запущенная) сессия горячо не перечитывает агентов — нужен перезапуск.
- В самом Krok часть ролей уже имеет `description` (например `forensic-auditor`, `pipeline-archaeologist`), но **проверь**, есть ли `name` у всех шести `agents/claude-code/*.md`: для регистрации нужны оба поля.

### 1.2. BOM в копиях ролей у потребителя

- В U1 копии `adversary-checker.md`, `architecture-reviewer.md`, `documentation-reviewer.md`, `forensic-auditor.md`, `pipeline-archaeologist.md`, `reality-auditor.md` начинаются с `EF BB BF`. В самом Krok эти файлы начинаются с `2D 2D 2D` (`---`), то есть BOM — артефакт процедуры копирования (вероятно PowerShell `Out-File`/`Set-Content`). Файл с BOM перед `---` не читается как frontmatter ни Claude Code, ни валидаторами Krok по `lines[0] !== '---'`.
- Нужны: предупреждение в процедуре копирования и проверка, которая ловит BOM.

### 1.3. Реестр агентов не консолидирован

- `core/registry.yaml` → `components.agents` перечисляет 4 роли: `architecture-reviewer`, `documentation-reviewer`, `reality-auditor`, `adversary-checker`.
- В `agents/claude-code/` файлов 6 (плюс `forensic-auditor`, `pipeline-archaeologist`), в `agents/opencode/` 7 (плюс `ontological-auditor`). Остальные не в реестре.
- `validate-integrity.sh` проверяет только направление «реестр → файл» (`Registry agent '…' has no matching file`); обратного («файл → реестр») нет, поэтому реестр дрейфует.
- `agents/README.md`: «Krok contains 6 roles» устарело, таблица ролей неполна.

### 1.4. Проектный агент нужно перенести в общий реестр

Владелец решил: агенты, которые создаются в проектах по ходу работы, накапливаются в Krok в консолидированном виде и доступны Claude и другим ИИ-агентам. Первый кандидат — **`frontend-contract-auditor`** (создан в U1 2026-10-26, текст в приложении A). Разрешено копировать из Krok в потребителей, чтобы агенты свободно использовали субагентов.

### 1.5. Политика правки approved-спек: сейчас жёсткий гейт, нужно предписание

- ADR-004, решение 4: «The semantic body of an `approved`, `implemented` or `superseded` Spec is immutable; a change of scope is a new or superseding Spec».
- Реализация: `documentation/validation/validate-lifecycle.mjs` → `IMMUTABLE_SPEC = {approved, implemented, superseded}`; в режиме `BASE_REF` изменение тела даёт `ERROR: … body of a approved spec changed against <ref>`; `SPEC_TRANSITIONS.approved = [approved, implemented, superseded]` (возврата в `draft` нет). `.github/workflows/docs-validate.yml` Krok на PR выставляет `BASE_REF=origin/<base>`, то есть в потребителях с тем же CI это **жёсткий гейт**.
- Решение владельца (2026-10-26): approved-спеку **можно править**; на время правки она становится `draft` (потому что изменена), после согласования правок возвращается в `approved`. Это **предписание, а не жёсткий гейт**.
- Согласуется с уже существующим текстом: `agents/claude-code/documentation-reviewer.md` («Direct content edit to `docs/specs/approved/*.md` without `git mv` from `drafts/` → flag»).
- Реальный кейс: в U1 approved-спека `2026-10-24-workforce-relations-tasks-schedule.md` была повышена без `## Acceptance criteria` (`validate-lifecycle` падал), владелец разрешил править; пришлось править тело approved-спеки, оставляя её `approved`, что `BASE_REF`-режим пометил бы ошибкой.

---

## 2. Что нужно сделать (один PR, два логических коммита)

### Коммит A — реестр агентов и регистрация

A1. **Регистрационные поля во всех `agents/claude-code/*.md`**: `name:` (= имя файла без `.md`) и `description:` (одно предложение: что делает и когда вызывать; для делегирования Claude Code это решающее поле). Существующим ролям `tools:` **не добавляй** (поведение не менять; роли `documentation-reviewer` с «Rewrite protocol» и остальные могут писать) — вынеси вопрос в раздел 5. Убедись, что ни один файл не начинается с BOM.

A2. **Добавь `frontend-contract-auditor`**:
- `agents/claude-code/frontend-contract-auditor.md` — **обобщённая** версия приложения A: убери привязки к U1 (`INV-000`, имена конкретных документов, «U1»), оставь 11 проверок. Источник стандарта — «контракты, которые называет сам проект»: `CLAUDE.md`/`AGENTS.md`, `.claude/rules/*`, дизайн-документы проекта (обычно `docs/design/*`: контракт компонентов, layout, screen grammar, каталог паттернов), `docs/architecture/naming-contract.md` если есть, `.context/boundaries.yml`. Правила владельца («строки только в каталоге i18n», «без fallback-ов», «возврат к родителю — через breadcrumb», «роль/должность не в идентификаторе») формулируй как «применяй те из них, которые проект объявляет». Frontmatter: Krok-поля (`schema: 1`, `id: agent-claude-code-frontend-contract-auditor`, `type: prompt`, `status: active`, `date`, `owners: [krok-team]`, `entity_refs: [agentic-layer]`, `capabilities: [review-frontend-contracts]`, `knowledge: [report-formats]` если применимо, `tags`) **плюс** `name: frontend-contract-auditor`, `description: …`, `tools: Read, Grep, Glob, Bash` (инструментов записи нет — агент read-only; Bash нужен для `git diff`).
- `agents/opencode/frontend-contract-auditor.md` — зеркало в формате opencode (`description`, `mode: subagent`, `permission: {read: allow, bash: ask, edit: deny, webfetch: allow}` как у остальных).
- `knowledge/capabilities.md`: новая capability `review-frontend-contracts` (Description / Consumes: `changed-files` + контракты проекта / Produces: `frontend-findings`). Проверь формат соседних записей и что `integrity-docs.mjs` её находит.

A3. **Реестр**: `core/registry.yaml` → `components.agents` — добавить все роли, у которых есть файл: `forensic-auditor`, `pipeline-archaeologist`, `ontological-auditor` (только opencode), `frontend-contract-auditor`.

A4. **Проверки** (`documentation/validation/`):
- в `integrity-docs.mjs` для `agents/claude-code/*.md`: файл начинается с `---` (без BOM), есть `name` и он равен имени файла, `description` непуст. Ошибки в формате `ERROR: Agent '<name>' …`.
- в `validate-integrity.sh` обратная проверка: каждый файл из `agents/{claude-code,opencode}/*.md` (кроме README) присутствует в `registry_list_agents`; иначе `ERROR: Agent file '…' is not in the Registry`.
- тесты `documentation/validation/tests/agents.test.mjs` (на временном корне, как в `helpers.mjs`): нет `name` → ошибка; `name` ≠ имени файла → ошибка; пустой `description` → ошибка; BOM → ошибка; валидный файл → чисто; файл не в реестре → ошибка.

A5. **Документация**: `agents/README.md` — актуальная таблица ролей, раздел «Registration» (что нужно Claude Code, чтение при старте сессии, перезапуск сессии), раздел «Contributing a project-born agent» (как проектный агент попадает в Krok: обобщить → добавить `name/description/tools` → capability → registry → opencode-зеркало → PR), раздел «Installing into a consumer» (`cp` из `docs/.control/agents/claude-code/<role>.md` в `.claude/agents/`, **без** `Out-File`/`Set-Content` из PowerShell — BOM; рекомендовать `cp`/`Copy-Item`). Проверь `INSTALL.md` и bootstrap: если есть шаг установки агентов, обнови; если нет — только документация, без новой автоматики (в раздел 5 вынеси вопрос про `krok agents install`).

### Коммит B — правка approved-спеки как предписание (ADR-008)

B1. **ADR-008** (`docs/adr/008-approved-spec-reopen.md`, `status: proposed`; принятие — человек): `depends_on: [adr-004-spec-lifecycle]`, `entity_refs: [lifecycle-spec]`. Решение: (1) approved-спеку можно править; пока правки не согласованы, она `draft` (`git mv` в `drafts/`, `status: draft`); после согласования — `draft → approved` (человеческий акт, ADR-004.3); (2) `implemented` и `superseded` остаются неизменяемыми (история); (3) неизменяемость тела approved — предписание: инструмент предупреждает, не блокирует; (4) смена scope по-прежнему лучше нового/замещающего Spec, но не навязывается гейтом. Оформи как **дополнение** к ADR-004 решению 4 (как ADR-007 расширяет ADR-004: «Nothing is added to ADR-004…», здесь наоборот — явно сказать, что решение 4 ослабляется для `approved`). Тело ADR-004 не менять (accepted).

B2. **`validate-lifecycle.mjs`**:
- `SPEC_TRANSITIONS.approved` += `'draft'` (переоткрытие).
- Изменение тела при `from === 'approved'`, если спека осталась `approved`: **не ошибка, а предупреждение** `WARNING: <file>: body of an approved spec changed against <ref> — set it to draft (git mv to drafts/) while it is being edited, then re-approve`. Если `to === 'draft'` (спека переоткрыта) — ни ошибки, ни предупреждения. `implemented`/`superseded`: по-прежнему `ERROR`.
- ADR (`accepted`/`superseded`) — без изменений (ошибка).
- Предупреждения не меняют код выхода; при `GITHUB_ACTIONS` печатать ещё `::warning::…`. Публичный API: `validate(docsRoot, baseRef)` сейчас возвращает массив ошибок — **не ломай** (используется тестами); предупреждения верни через третий необязательный аргумент-коллектор (`validate(root, ref, warnings = [])`) либо отдельный экспорт.
- Переход `draft → approved` по-прежнему требует `## Acceptance criteria` (AC-NNN, уникальные) — не ослаблять.

B3. **Тесты** в `documentation/validation/tests/lifecycle.test.mjs` (используй существующий `repoWith` / `put` / `doc` / `AC`): (a) approved→approved с изменённым телом: ошибок нет, одно предупреждение; (b) approved→draft (файл в `drafts/`, `status: draft`) с изменённым телом: ни ошибок, ни предупреждений; (c) draft→approved после правок без AC: ошибка (требование AC); с AC: чисто; (d) `implemented` с изменённым телом: ошибка; (e) accepted ADR с изменённым телом: ошибка; (f) `## Result` по-прежнему исключён из сравнения; (g) переход approved→draft не считается «illegal transition».

B4. **Документы**: `playbook/playbook-v2.md` (§4.2 Lifecycle: схема `approved → draft` для правок; §4.3 «semantic body immutable» → предписание; строка про валидацию `validate-lifecycle`; таблица в районе строки 1002 — если упоминает), `docs/architecture/entity-catalog.md` (`lifecycle-spec`: упомянуть ADR-008), `agents/claude-code/documentation-reviewer.md` и opencode-зеркало (формулировку «flag» оставь, добавь «correct path: reopen to draft»). Проверь `sops/` и `bootstrap/generators/*` на строки «approved … immutable» — grep по репозиторию.

B5. **Execution Units**: `krok execution create/ready/start` требуют approved Spec. Проверь поведение, когда Spec переоткрыта в `draft` при живом Unit: `ready`/`start` перевалидируют и должны отказать с понятным сообщением; `verify`/`complete` — зафиксируй текущее поведение тестом или описанием в ADR. Не меняй семантику Execution Units без явной необходимости; если нужна — вынеси в раздел 5.

---

## 3. Критерии приёмки

1. `node --test documentation/validation/tests/*.test.mjs core/control/tests/*.test.mjs bootstrap/tests/*.test.mjs engine/reality-engine/tests/*.test.mjs` — зелёный (как в CI Krok), включая новые тесты.
2. `bash documentation/validation/validate-integrity.sh`, `validate-frontmatter.sh`, `node documentation/validation/validate-lifecycle.mjs docs`, `validate-backlog.mjs docs`, `validate-vocabulary.mjs .` — зелёные; `BASE_REF=origin/master` на PR-ветке не даёт ошибок.
3. Каждый файл `agents/claude-code/*.md` имеет `name` (= стем файла) и непустой `description`, не начинается с BOM; **проверено руками**: скопируй их в тестовый `.claude/agents/` потребителя и запусти новую сессию Claude Code (`claude -p "…Agent subagent_type …"`) — все типы резолвятся. Приложи вывод в PR.
4. `frontend-contract-auditor` есть в обоих каталогах агентов, в реестре и в каталоге capabilities; claude-code-версия резолвится в новой сессии с инструментами `Read, Grep, Glob, Bash`.
5. Обратная проверка реестра работает: удали запись из реестра → `validate-integrity.sh` падает.
6. ADR-008 в `proposed`, тело ADR-004 не тронуто; `agents/README.md` актуален (число ролей, регистрация, процедура вклада).
7. PR-описание в формате Krok (What / Why / Changed / Testing); коммиты заканчиваются `Co-Authored-By: …` по правилам вашего окружения.

## 4. Ограничения

- Без force-push, без переписывания истории, `master` напрямую не трогать.
- Потребителей (U1 и др.) в этом PR не менять; подъём submodule — отдельным шагом у потребителя.
- Не менять права/инструменты существующих ролей (кроме регистрационных полей) без решения владельца (раздел 5).
- Документы Krok — Canonical Schema v1 (обязательные `schema, id, type, status, date, owners`), валидаторы выше.

## 5. Вопросы владельцу Krok (реши до или в PR)

1. Нужен ли `tools:` для существующих read-only ролей (`reality-auditor`, `adversary-checker`, `architecture-reviewer`, `forensic-auditor`, `pipeline-archaeologist`)? Без `tools:` роль наследует все инструменты, включая Edit/Write — это противоречит их тексту «read-only». Но часть ролей может писать отчёты в файлы (проверь `forensic-auditor`, `documentation-reviewer`). Рекомендация: добавить `tools: Read, Grep, Glob, Bash` тем, чей текст запрещает запись и которые не создают файлы, остальным оставить как есть.
2. Нужна ли команда `krok agents install [--platform claude-code]` (копия ролей из submodule в `.claude/agents/` без BOM) и `krok agents sync` (сравнение с submodule)? Это закроет «копируем руками».
3. Как потребитель возвращает проектный агент в Krok (процедура вклада) — достаточно README или нужен шаблон `documentation/templates/agent.md`?
4. Предупреждение о правке approved-спеки: достаточно ли `WARNING`, или добавить опцию `strict` в `.context/project.yml` (потребитель сам выбирает гейт)?

## 6. После слияния — шаги в потребителе U1 (для справки, не часть PR)

- Поднять submodule `docs/.control` на новый коммит Krok.
- Заменить проектную копию `.claude/agents/frontend-contract-auditor.md` версией из Krok (`cp`, без BOM); тест `tests/unit/claude-agents.test.ts` и правило `.claude/rules/frontend-audit.md` остаются.
- Остальные пять ролей Krok в `.claude/agents/` U1 заменить копиями с `name/description` (сейчас это документы, не агенты, и с BOM).
- Правило `.claude/rules/spec-workflow.md` и `CLAUDE.md` U1: зафиксировать «approved править через draft».

---

## Приложение A. Исходный текст `frontend-contract-auditor` (U1, `.claude/agents/frontend-contract-auditor.md`, коммит `ebd9ce6` в `akturt/u1-hiring`)

Это проектная версия (с привязками к U1); в Krok нужна обобщённая (см. A2). Ниже — файл целиком, как он лежит в U1.

````markdown
---
schema: 1
id: agent-frontend-contract-auditor
type: prompt
status: active
date: 2026-10-26
owners: [akturt]
# Claude Code registers a sub-agent from `name` + `description` (+ `tools`); without them the type is not found in a session.
name: frontend-contract-auditor
description: "Independent read-only auditor of frontend changes against this project's contracts (canonical components, i18n catalog, navigation, accessibility, naming, INV-000). MUST be run on every UI change (components, pages, panels, forms, tables, navigation, app.css, src/i18n/admin/en.ts) before it is reported done or committed to master. Give it the checkout path and the base commit; it never edits anything."
tools: Read, Grep, Glob, Bash

entity_refs: []
touches: [src/components, src/app, src/i18n/admin, docs/design]
docs: [../rules/canonical-component-first.md, ../rules/naming.md, ../rules/bug-fix-workflow.md]
refs: []
depends_on: []
capabilities: [review-frontend, review-component-reuse, review-i18n, review-navigation]
knowledge: []
tags: [claude-code, agent, reviewer, frontend, ui]
priority: P0
---

# Agent — Frontend Contract Auditor

> Project-local role (not a Krok copy; Krok itself is never edited). Created 2026-10-26 on the owner's instruction:
> **run this agent on every frontend change before reporting it done.** The author of UI code is not trusted to
> self-assess against the contracts; this agent is the independent check.

## When to invoke

Every time UI code is written or changed (`src/components/**`, `src/app/**` pages, panels, forms, tables, navigation,
`app.css`, `src/i18n/admin/en.ts`): after the code compiles and before any "done" report, commit to master or release.
Invoke with the `Agent` tool, `subagent_type: "frontend-contract-auditor"`, and tell it the worktree path and the base
commit to diff against. It is read-only. Every NEW finding is fixed (or recorded as a named open item with the
reason) before the work is reported; PRE-EXISTING findings are listed to the owner, not silently ignored.

## System Prompt

You are the **Frontend Contract Auditor** of this project. READ-ONLY: never edit, create, delete or commit anything.
You report findings only. The owner's complaint that created you: an AI repeatedly hand-rolled UI instead of reusing
the project's canonical components and contracts, invented navigation, hard-coded strings and then reported the work
as finished. Find every such place. Do not praise; do not summarize what is fine.

### Inputs you are given

A worktree path and a base commit. Audit everything changed since the base: `git diff --stat <base>`,
`git status --short` (uncommitted work counts), then read the changed and new files. Also read the neighbouring
existing code that does the same job (sibling pages/components) to judge idiom.

### Rules to read first (they are the standard)

- `CLAUDE.md`, `.claude/rules/canonical-component-first.md`, `.claude/rules/naming.md`, `.claude/rules/bug-fix-workflow.md`
- `docs/design/component-contract.md` (Layer 0 `src/components/ui` shadcn/Base UI canonical; Layer 1 `src/components/design`;
  shell), `docs/design/layout-contract.md`, `docs/design/screen-grammar.md`, `docs/design/pattern-catalog.md`,
  `docs/architecture/naming-contract.md`
- Owner rules: admin UI strings live ONLY in `src/i18n/admin/en.ts` (no hard-coded visible English in components or pages,
  including `aria-label`, placeholder, title, toast; outcomes via sonner toasts; Layer 1 takes strings as props, it
  never reads the catalog); no fallbacks or compatibility shims; roles and job titles never appear in identifiers;
  navigation back to a parent is the breadcrumb trail (`SetBreadcrumb` / `useBreadcrumb`), never a "Back to ..."
  button or link.

### What to check (report each finding with `file:line`, the offending code, the rule, and the existing thing to use)

1. **Hard-coded user-visible strings** and `aria-label`s; strings glued from fragments (non-translatable word order);
   raw codes shown as labels (level separation: capability ≠ command ≠ config code ≠ label); `?? code` fallbacks.
2. **Hand-rolled markup imitating a canonical component** instead of using it: Button/`buttonVariants`, Badge, Table /
   `DataTable`, `Pagination*` / `PaginationFooter`, Breadcrumb(s), `Calendar` + `Popover` / `DatePicker` (never
   `<input type="date">`), Select, Label, Checkbox, Skeleton, Alert, Card, Empty/EmptyState, Tabs, Separator, Sheet,
   Dialog/AlertDialog, PropertyList, SectionHeader. Raw `<a>/<button>/<div>/<ul>/<table>` styled as controls; magic
   pixel/colour/z-index values instead of tokens (`--z-*`, `--border`, `--ring`, ...).
3. **Navigation inventions**: "Back to ..." buttons/links, custom tab strips, custom pagers, Cancel buttons that duplicate
   the breadcrumb / panel close.
4. **Registry/list screens** not on `DataTable` + `PaginationFooter`; unbounded lists; in-memory pagination where the
   query can page; duplicated page-href builders.
5. **Layer and duplication**: import boundaries (ui ← design ← shell ← app), a helper that already exists elsewhere
   (UUID regex `UUID_RE`, date parse/format, pagination parsing, id helpers), components living in the wrong route folder.
6. **Accessibility/semantics**: clickable non-interactive elements, missing label/`htmlFor`, duplicate ids (a page behind a
   panel may render the same form), `title` as the only name, focus handling, keyboard reachability, row-level click targets
   that are only the control (a checkbox row must be clickable as a whole).
7. **Documentation gaps**: components added/changed but absent or stale in `docs/design/component-contract.md`; contract
   says one thing and code another.
8. **Naming-contract** violations (one stem across TS/SQL/docs/tests; forbidden names in the contract; no role/title in
   identifiers).
9. **Divergence from neighbouring idiom** and silent fallbacks (INV-000).
10. **Visual geometry**: for any header/toolbar/row built from several controls (badge + button, icon + text), is
    vertical alignment guaranteed by the markup (`align-items`) and is it measured by a test? Hover/focus/active states of
    every custom-styled control compared with the prototype/contract.
11. **Test honesty**: tests that only reproduce the reported case, assertions loosened to make something pass, tests
    skipped or failing "because pre-existing" without evidence. List any.

### Output

A prioritised list (blocking → minor), grouped by the 11 headings, each item tagged **NEW** (introduced by this work)
or **PRE-EXISTING**, with the concrete fix. Mark anything you could not confirm as "unverified". No padding; under about
1500 words.

````
