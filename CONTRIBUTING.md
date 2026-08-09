# Contributing

Thanks for your interest in Book Metasearch. This document covers the setup,
test, and release loop.

## Dev setup

```bash
git clone https://github.com/bongho/obsidian-book-metasearch.git
cd obsidian-book-metasearch
npm install
```

Point the build at a real vault's plugin folder so changes hot-reload:

```bash
export VAULT_PLUGIN_DIR="/path/to/vault/.obsidian/plugins/book-metasearch"
mkdir -p "$VAULT_PLUGIN_DIR"
cp manifest.json styles.css "$VAULT_PLUGIN_DIR/"
OUTDIR="$VAULT_PLUGIN_DIR" npm run dev
```

For hot-reload inside Obsidian, install [pjeby/hot-reload](https://github.com/pjeby/hot-reload)
via BRAT and drop an empty `.hotreload` file into the plugin folder.

## Test / lint / build

```bash
npm test           # Vitest, run once
npm run test:watch # Vitest, watch mode
npm run lint       # ESLint (obsidianmd rules + typescript-eslint)
npm run build      # tsc --noEmit + esbuild production bundle
npm run verify     # all three at once — the pre-merge check
```

CI (`.github/workflows/lint.yml`) runs `build → lint → test` on Node 20 / 22 /
24. Failing tests and lint errors block merge.

Lint should sit at **0 errors and 2 warnings**. Both warnings are deliberate
and documented where they occur — a deprecated `setWarning()` call that can't
be replaced until `minAppVersion` rises, and the settings tab opting out of
the declarative API (see [#11](https://github.com/bongho/obsidian-book-metasearch/issues/11)).
If you see a third, it's yours.

`main` is protected on GitHub (not in-repo config): force-push and branch
deletion are blocked, and the three CI jobs must pass before merge. There's no
required review, since this is a solo-maintained repo. Change it under
**Settings → Branches**.

For a dependency bump, run `npm run verify` against the change locally rather
than trusting a green CI badge — CI installs from the PR's lockfile, which
tells you the install resolved, not that the new versions behave.

Test files live next to sources (`src/**/*.test.ts`). Pure utilities are
tested directly; anything that needs Obsidian APIs (`App`, `Vault`,
`SuggestModal`, `requestUrl`) is stubbed via `src/__mocks__/obsidian.ts` —
grow the stub as new call sites appear.

## Known constraints

**`@eslint/js` stays on 9.x while `eslint` itself is on 10.x.** This looks like
an oversight in `package.json` but isn't: `eslint-plugin-obsidianmd@0.4.1`
requires `@eslint/js@^9.30.1` directly, so `@eslint/js@10` — which wants an
`eslint@^10` peer — can't resolve in any combination. Bumping `eslint` alone
works, which is why the versions look mismatched. Dependabot will keep
proposing the `@eslint/js` major; it was closed unmergeable once already
(#6) and will stay that way until the plugin bumps its own requirement. Don't
re-debug the resolver.

**Merging anything under `.github/workflows/` needs the `workflow` OAuth
scope.** GitHub enforces this server-side, so with an HTTPS remote there's no
local-push workaround — run `gh auth refresh -s workflow` first.

## Adding a provider

1. Implement `BookProvider` from `src/apis/base.ts`:
   - `id`, `displayName`, `requiresAuth`
   - `healthcheck() → HealthStatus` (never throws)
   - `searchByQuery(q, opts) → Book[]` (throws `ProviderError` on failure)
   - `searchByISBN(isbn) → Book | null`
2. Register in `src/main.ts` `onload()` and add the id to `priorityOrder`
   default in `src/settings.ts`.
3. Add a settings UI card in `src/ui/settings-tab.ts` (API key input +
   healthcheck button).
4. Every HTTP request must use Obsidian's `requestUrl()` — not `fetch()` —
   for CORS transparency and reliability.
5. Reuse pure utilities in `src/util/` (`isbn.ts`, `html.ts`,
   `language.ts`) rather than reimplementing.
6. Add a Vitest file covering the response-normalization path with a fixture
   payload.

## Release process

1. Bump semver in `package.json`.
2. `npm version <x.y.z>` — runs `version-bump.mjs` to sync `manifest.json` +
   `versions.json`.
3. Move the `## [Unreleased]` block in `CHANGELOG.md` to a new `## [x.y.z] -
   YYYY-MM-DD` heading. The next section header must be `## [`, not text,
   or the release-notes extractor won't stop.
4. `git push && git push --tags`.
5. `.github/workflows/release.yml` runs on the tag push:
   - `npm ci && npm run build`
   - Attest provenance on `main.js` (+ `styles.css` if present).
   - Auto-extract release notes from `CHANGELOG.md` (that's why step 3 matters).
   - `gh release create --draft` uploads `main.js`, `manifest.json`,
     `styles.css`.
6. Review the draft on GitHub, then click Publish.
7. For a new community-plugin manifest version, submit / update the PR to
   [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases).

## Filing bugs

- If a healthcheck or migration fails, the plugin auto-writes a redacted
  diagnostics note under `85. References (Book Search)/_errors/` (or your
  configured folder). Attaching that file to the GitHub issue speeds up
  triage; API keys are masked automatically.
- Include Obsidian version + OS from `Settings → About` when the issue
  touches editor / vault behavior.

## License

MIT © 2026 BongHo Lee — contributions are accepted under the same license.
