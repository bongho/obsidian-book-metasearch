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

**npm 10.8.1 installs no rolldown binary; `npm ci` needs >= 10.8.2.** vitest 4
pulls in rolldown, whose native binding ships as a platform-specific optional
dependency. npm 10.8.1 (bundled with Node 20.16) resolves `package-lock.json`
but installs none of them — `node_modules/@rolldown/` ends up holding only
`pluginutils`, and every `npm test` dies with `Cannot find module
'@rolldown/binding-wasm32-wasi'`. The lockfile is fine and vitest is fine; it is
the installer. Run installs with a newer npm, e.g.

    PATH="/opt/homebrew/opt/node@22/bin:$PATH" npm ci

The binding is architecture-native rather than Node-version-specific, so once it
is installed the default `node`/`npm` on the machine runs `npm test`,
`npm run verify`, and `npm run test:coverage` normally. CI is unaffected —
`actions/setup-node` ships a current npm on all three matrix versions.

`package.json` declares `engines.npm >= 10.8.2` and `.npmrc` sets
`engine-strict=true`, so an npm below the floor now aborts the install with
`EBADENGINE` instead of quietly producing a tree whose tests cannot run.

The floor is 10.8.2 rather than 10.9 because that is what the evidence
supports, and because the floor has to stay under CI: `actions/setup-node`
resolves `20.x` to Node 20.20.2, which bundles **npm 10.8.2** — one patch above
the broken version — while `22.x` gets 10.9.8 and `24.x` gets 11.17.0. A 10.9
floor would fail the required `build (20.x)` check. Versions observed installing
the binding correctly: 10.8.2 (linux-x64, CI), 10.9.4 (darwin-arm64, local),
11.17.0 (linux-x64, CI). Only 10.8.1 has been observed failing.

**Dependabot groups are resolved by specificity, not by declaration order.**
A group keyed on `dependency-type` outranks one keyed on `patterns`, so listing
a narrow `patterns` group first does not keep its packages out of a broader
dev-dependency group. `vitest` and `@vitest/coverage-v8` have to install as a
pair (exact peer pin), so `dev-dependencies` carries an explicit
`exclude-patterns` for them. Removing it puts the ERESOLVE split of #22 back.

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

`main` requires the three `build` checks and admins are not exempt, so the
release commit goes through a PR like every other change. The tag is pushed
afterwards, on its own — branch protection does not cover tags.

1. On a branch, move the `## [Unreleased]` block in `CHANGELOG.md` to a new
   `## [x.y.z] - YYYY-MM-DD` heading, leaving `## [Unreleased]` empty above it.
   The next section header must be `## [`, not text, or the release-notes
   extractor won't stop.
2. `npm version --no-git-tag-version <x.y.z>` — bumps `package.json` and runs
   `version-bump.mjs` to sync `manifest.json` + `versions.json`, without making
   a commit or a tag. Plain `npm version` tags the branch commit, and a squash
   merge then orphans that tag.
3. Commit, push, open a PR, merge once the three checks pass.
4. `git checkout main && git pull`, then `git tag <x.y.z>` and
   `git push origin <x.y.z>`.
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
