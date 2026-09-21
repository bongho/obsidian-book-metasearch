# Book Metasearch

Book note maker with metasearch across **YES24 · Kakao · Google Books · Open Library**, queried in parallel. Korean-first with foreign fallback.

Successor to [anpigon/obsidian-book-search-plugin](https://github.com/anpigon/obsidian-book-search-plugin) (unmaintained). Built to solve the Naver Book Search API EOL (2026-08-01) and provide a proper Korean-first book note workflow.

## Install

From the community plugin directory:

1. In Obsidian, open **Settings → Community plugins**
2. Turn off **Restricted mode** if enabled
3. Click **Browse** and search for `Book Metasearch`
4. Click **Install**, then **Enable**

## Features

### Core (v1.0)
- **4-provider metasearch**: YES24 (Korean primary) · Kakao (Korean recall) · Google Books (foreign primary) · Open Library (foreign covers/ISBN)
- **Two strategies**: Sequential fallback (default) or parallel Fanout with ISBN13 dedupe
- **Commands**: Search books · Search by ISBN · Search based on current note · Update book info · Migration helper
- **Template file** support with `{{variable}}` substitution — Templater `<% %>` blocks are preserved for post-creation execution
- **Frontmatter customization**: `useDefaultFrontmatter` toggle · key case (`as-is` / `camelCase` / `snake_case` / `kebab-case`) · additional YAML fragment with `{{variable}}` substitution
- **Cover image download** to a configurable folder
- **37 ISO 639-1 locale codes** for cross-provider language filtering
- **API keys masked** in settings with click-to-reveal
- **Cover thumbnails** in search results (opt-in)
- **Naver EOL migration**: opt-in helper detects an existing `obsidian-book-search-plugin` config and guides users through Aladin setup

### v1.1 additions
- **Auto-filled Abstract / Description section** — new notes get the provider's book description written into the `## Abstract / Description` block (HTML stripped). "Update book info in current note" refreshes it while preserving edits outside the auto-block markers.
- **ISBN13 vault-wide duplicate detection** — before creating a note, the plugin scans the vault. On match, `DuplicateModal` offers: open existing / update existing / create anyway / cancel. Backed by an incremental `VaultBookIndex`.
- **Reading Log** — three commands ("Mark book as wishlist / reading / read") with automatic `startedAt` / `finishedAt` date stamping (idempotent). New notes get a configurable initial status (default: `wishlist`).
- **Insert book citation at cursor** — editor command that emits a wikilink to an existing vault note (if any) or an unresolved link. Two link styles.
- **Aladin used-book price check** (opt-in) — surfaces used-book minimum prices as a Notice or appended `## Price Watch` section.
- **Redacted error diagnostics** — healthcheck / migration failures auto-write a diagnostics note with secrets masked, so users can attach it to bug reports.

See [`CHANGELOG.md`](CHANGELOG.md) for the full v1.1.0 changelog.

## Provider setup

Only YES24 and Kakao require API keys (both free, instant issuance). Google Books works without a key at a lower rate limit. Open Library needs no auth.

| Provider | Auth | Free tier | Where to get a key |
|----------|------|-----------|--------------------|
| YES24 | API Key (required) | 20,000/day | [developers.yes24.com](https://developers.yes24.com/docs/apikey) |
| Kakao | REST API Key (required) | 30,000/day | [developers.kakao.com](https://developers.kakao.com/) |
| Google Books | API Key (optional) | 1,000/day with key, low limit without | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) — enable Books API first |
| Open Library | No auth | Effectively unlimited | — |
| ~~Aladin~~ | TTB Key | ~~5,000/day~~ | **API shut down 2026-10-30** — see below |

After installing, open **Settings → Book Metasearch → Providers**, paste keys, and hit **Healthcheck** on each provider.

## Aladin OpenAPI shutdown

Aladin [announced](https://blog.aladin.co.kr/cscenter/17483675) the end of its Open API: **new key issuance stopped 2026-09-04, and existing keys stop working 2026-10-30.** YES24 is now the Korean primary provider, and it covers everything Aladin supplied plus a table of contents and physical dimensions.

If you already hold a working TTB Key, the Aladin provider keeps functioning until the shutdown date — it is simply no longer first in `priorityOrder`. Move `yes24` into your provider order and add a YES24 key when convenient; the Aladin code is removed in v2.0.0, after the shutdown.

The one feature with no replacement is the **used-book price check** — no Korean bookstore exposes used listings through an API, and all three block the corresponding pages in `robots.txt`. It goes away with the Aladin provider.

## Attribution

- **Aladin**: Book DB by Aladin ([aladin.co.kr](https://www.aladin.co.kr))

The Aladin OpenAPI general-tier terms don't strictly mandate a credit link, but keeping the "Book DB by Aladin" footer in generated notes is the polite (and forward-compatible if you ever upgrade to the premium tier). Leave the credit toggle on unless you have a specific reason.

## Development

Prerequisites: Node 22.12+, npm.

```bash
git clone https://github.com/bongho/obsidian-book-metasearch.git
cd obsidian-book-metasearch
npm install

# dev — build directly into your vault's plugin folder
export VAULT_PLUGIN_DIR="/path/to/your/vault/.obsidian/plugins/book-metasearch"
mkdir -p "$VAULT_PLUGIN_DIR"
cp manifest.json styles.css "$VAULT_PLUGIN_DIR/"
OUTDIR="$VAULT_PLUGIN_DIR" npm run dev

# production build
npm run build
```

For hot-reload, install [pjeby/hot-reload](https://github.com/pjeby/hot-reload) via BRAT and create an empty `.hotreload` file in the plugin folder.

## License

MIT © 2026 BongHo Lee
