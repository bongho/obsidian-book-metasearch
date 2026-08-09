# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.3] - 2026-08-09

### Fixed

- **Concurrent edits to a note are no longer overwritten.** Appending a Price
  Watch row and refreshing the auto-filled description both read the note,
  built a new body from it, and wrote that back. Anything typed in between —
  and an Aladin price lookup leaves a whole network round-trip of room — was
  silently discarded. Both paths now use `Vault.process()`, which reads and
  writes as one atomic operation.
- Sentence case in six UI strings: four settings names ending in `Key` → `key`,
  plus the `Reading log` and `Price check` headings.

### Security

Development-toolchain only — the packages below live in `devDependencies` and
never reach the bundled `main.js`.

- Bumped `vitest` 2.1.9 → 3 and `@vitest/coverage-v8` to match, clearing two
  critical advisories in `@vitest/mocker` (arbitrary file read/execute while
  the Vitest UI server is listening). Dependabot never proposed this because
  the fix needs a major bump — `npm audit` surfaced it instead. With the
  follow-up `npm audit fix` for transitive `brace-expansion` and `fast-uri`
  advisories, `npm audit` goes from 9 vulnerabilities to 0.

### Changed

- Dependency bumps: `eslint` 9 → 10, `@types/node` 22 → 26, `happy-dom` 15 →
  20, `esbuild` 0.25.5 → 0.28.1 (includes a path-traversal fix in esbuild's
  dev server), `eslint-plugin-obsidianmd` 0.4.1, `globals`, `typescript-eslint`,
  and the `actions/checkout` + `actions/setup-node` CI actions to v7.
- Configured `obsidianmd/ui/sentence-case` with this plugin's own vocabulary
  (acronyms, provider brand names, and an ignore list for Korean UI copy and
  literal placeholder strings), taking lint from 48 warnings to 2. The rule
  stays on so it keeps checking English UI strings.

## [1.2.2] - 2026-08-07

### Reverted

- **Rolled back M5 (declarative settings API from v1.2.0).** In Obsidian 1.13+,
  overriding `PluginSettingTab.getSettingDefinitions()` causes the framework
  to render the declarative UI **in place of** our `display()` implementation,
  not alongside it as we had assumed. That regressed several UX affordances:
  API-key password masking (values shown as plaintext), the reveal toggle,
  the per-provider **Healthcheck** buttons, the "Open migration helper" and
  "발급 페이지 열기" action buttons — all vanished from the settings tab.
  The current `SettingControl` union has no `secret`/`password` variant and
  no idiomatic way to embed the healthcheck action affordances we rely on,
  so a partial declarative footprint can't preserve the tab. The v1.0.1
  community-plugin reviewer's warning about `getSettingDefinitions()` will
  come back — accepting that in exchange for correct UX and no plaintext
  key exposure. Deleted `src/ui/settings-definitions.ts`.

## [1.2.1] - 2026-08-07

### Changed

- Swapped `contentEl.createEl('div', ...)` for the more idiomatic
  `contentEl.createDiv(...)` in `DuplicateModal`, following the
  `obsidianmd/prefer-create-el` guideline. Purely stylistic — behavior
  unchanged.

### Removed

- The temporary "_Screenshots coming soon_" placeholder from `README.md`
  (and its accompanying `<!--...-->` template block). Real screenshots
  will land later without a preview note in the meantime — placeholder
  text was tripping the community-plugin reviewer.

### Notes

The reviewer also recommended migrating the `.setWarning()` button call
to `.setDestructive()`. That API requires Obsidian ≥ 1.13.0, but our
`minAppVersion` is still `1.4.4` for backward compatibility. Deferred
until we bump `minAppVersion` in a future release.

## [1.2.0] - 2026-08-07

### Added

- **Declarative settings API (Obsidian 1.13+ Settings search)** —
  `BookMetasearchSettingTab.getSettingDefinitions()` now returns a
  `SettingDefinitionItem[]` describing every user-facing setting in one
  place (`src/ui/settings-definitions.ts`), so Obsidian 1.13+'s built-in
  Settings search bar can find and jump to each option. The existing
  `display()` still owns rendering (including action-only rows like
  provider healthcheck buttons that don't map to declarative controls);
  the two code paths run in parallel and don't compete. Each control's
  `key` matches its `BookMetasearchSettings` field, so the framework's
  default `getControlValue`/`setControlValue` handle read/write with no
  glue. `aliases` are added on every control to widen search recall
  (e.g. `["ttb", "aladin", "api key"]` for the Aladin TTB Key). Resolves
  the Obsidian community-plugin review warning shipped since v1.0.1.

### Changed

- `obsidian` devDependency bumped `1.12.3 → 1.13.1` to pick up the
  `SettingDefinitionItem` types.

## [1.1.0] - 2026-08-07

### Added

- **Vitest test infrastructure** — colocated `*.test.ts` files, `happy-dom`
  environment, `obsidian` module aliased to a local mock so pure utilities can
  be unit-tested without an Obsidian runtime. CI (`.github/workflows/lint.yml`)
  now runs `npm test` in addition to lint + build. (M0-A)
- **Auto-dumped diagnostics notes** — when a provider healthcheck or the
  migration helper fails, the plugin writes a redacted diagnostics note to
  `errorDumpFolder` so users have a concrete artifact to attach to bug
  reports. API keys, tokens, secrets, and passwords are automatically masked
  based on the setting field name suffix. New settings: `errorDumpEnabled`
  (default `true`), `errorDumpFolder` (default
  `85. References (Book Search)/_errors`). (M0-B)
- **Migration banner state tracking** — new `migrationCompletedAt` and
  `migrationBannerDismissedAt` settings persist across reloads, and a new
  one-line `Notice` on startup points anpigon users to the migration helper.
  The banner suppresses itself once the user hits "완료" or "나중에" in the
  MigrationModal. Pure helper `shouldShowMigrationBanner` is exported from
  `src/migration/naver-detector.ts` for direct unit testing. (M0-C)
- **Auto-filled Abstract / Description section** — new notes created via
  "Search books" and "Search books by ISBN" now populate the
  `## Abstract / Description` auto-block with the provider's `description`
  field (Aladin subInfo, Kakao contents, Google Books description, Open
  Library first sentence). The `Update book info in current note` command
  refreshes the same block on demand while preserving edits made outside
  the `BOOKSEARCH:AUTO-START/END` markers. New setting: `autoFillDescription`
  (default `true`). (M0-D)
- **ISBN13 vault-wide duplicate detection** — before creating a new book
  note, the plugin scans the vault for existing `type: reference` notes with
  a matching ISBN10 or ISBN13. On match, `DuplicateModal` offers four
  actions: open existing / update existing / create anyway (ignore dedup) /
  cancel. `VaultBookIndex` runs incrementally via `metadataCache.on('changed')`
  and `vault.on('delete'/'rename')` hooks. New setting: `duplicateAction`
  (default `'ask'`; also supports `'open'`, `'update'`, `'error'` for
  headless workflows). (M1-A)
- **Reading Log workflow** — three new commands ("Mark book as
  wishlist / reading / read") stamp the active note's `status` frontmatter
  and record `startedAt` / `finishedAt` YYYY-MM-DD dates automatically on
  transition (idempotent — existing stamps are preserved). New notes get a
  configurable initial status (default `wishlist`). Commands are only active
  on `type: reference` notes tagged `book`. New settings:
  `readingStatusEnabled` (default `true`), `initialStatus` (default
  `'wishlist'`). Replaces the hardcoded `status: inProgress` on new notes. (M1-B)
- **Insert book citation at cursor** — new editor command searches all
  configured providers and emits a wikilink at the current cursor position.
  When the vault already has a matching book note (by ISBN), the link
  targets that note's basename; otherwise it emits an unresolved wikilink
  (Obsidian's standard "click to create" flow). Two link styles are
  available: `wikilink` (`[[Title]] (Author, Year)`) and `wikilink-alias`
  (`[[target|Author, Year — Title]]`). New settings: `citationStyle`
  (default `'wikilink'`), `citationOnMissing` (default `'insert-only'`;
  also supports `'create-note'` for auto-note-creation workflows). (M2)
- **Aladin used-book price check** — opt-in "Check used-book price (Aladin)"
  command extends Aladin's `ItemLookUp.aspx` with `OptResult=subInfo,usedList`
  to fetch used-book minimum prices across three channels (aladinUsed /
  spaceUsed / userUsed). Results surface either as a transient Notice
  (default) or appended as timestamped rows to a `## Price Watch` section at
  the note bottom. Deliberately kept OUT of the `Book` frontmatter schema
  via a separate `PriceQuote` type so re-checks don't produce diff noise on
  provider-derived fields. New settings: `priceCheckEnabled` (default
  `false`, explicit opt-in), `priceOutputMode` (default `'notice-only'`). (M3)

### Fixed

- **Migration modal no longer forgets its own completion.** Previously the
  "완료" button in `MigrationModal` only saved the TTB Key — the intended
  `migrationCompletedAt` timestamp was documented in a comment but never
  written, so the migration banner would (silently) have reappeared on every
  reload once the banner logic went live. (M0-C)

### Notes

Everything above is targeted for the next release as v1.1.0. M1 (ISBN vault
dedupe + Reading Log), M2 (citation insert), M3 (Aladin used-price), and M4
(distribution polish) land in follow-up releases.

## [1.0.1] - 2026-08-02

### Changed

- Docs updated to reflect the plugin being accepted into the Obsidian
  community-plugin directory.

## [1.0.0] - 2026-07-30

### Added

- 4-provider metasearch: Aladin (Korean primary), Kakao (Korean recall),
  Google Books (foreign primary), Open Library (foreign covers / ISBN
  fallback).
- Two strategies: sequential fallback (default) and parallel Fanout with
  ISBN13 dedupe.
- Commands: Search books · Search by ISBN · Search based on current note ·
  Update book info · Naver→Aladin migration helper.
- Template file support with `{{variable}}` substitution; Templater
  `<% ... %>` blocks preserved for post-creation execution.
- Frontmatter customization: `useDefaultFrontmatter` toggle, key-case
  conversion (`as-is` / `camelCase` / `snake_case` / `kebab-case`),
  additional YAML fragment with `{{variable}}` substitution.
- Cover image download to a configurable folder.
- 37 ISO 639-1 locale codes for cross-provider language filtering.
- API keys masked in settings UI with click-to-reveal.
- Cover thumbnails in search results (opt-in).
- Naver EOL migration helper that detects an existing
  `obsidian-book-search-plugin` config and guides users through Aladin
  setup.

[Unreleased]: https://github.com/bongho/obsidian-book-metasearch/compare/1.2.2...HEAD
[1.2.2]: https://github.com/bongho/obsidian-book-metasearch/compare/1.2.1...1.2.2
[1.2.1]: https://github.com/bongho/obsidian-book-metasearch/compare/1.2.0...1.2.1
[1.2.0]: https://github.com/bongho/obsidian-book-metasearch/compare/1.1.0...1.2.0
[1.1.0]: https://github.com/bongho/obsidian-book-metasearch/compare/1.0.1...1.1.0
[1.0.1]: https://github.com/bongho/obsidian-book-metasearch/compare/1.0.0...1.0.1
[1.0.0]: https://github.com/bongho/obsidian-book-metasearch/releases/tag/1.0.0
