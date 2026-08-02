# Book Metasearch

Book note maker with metasearch across **Aladin · Kakao · Google Books · Open Library**, queried in parallel. Korean-first with foreign fallback.

Successor to [anpigon/obsidian-book-search-plugin](https://github.com/anpigon/obsidian-book-search-plugin) (unmaintained). Built to solve the Naver Book Search API EOL (2026-08-01) and provide a proper Korean-first book note workflow.

## Install

From the community plugin directory:

1. In Obsidian, open **Settings → Community plugins**
2. Turn off **Restricted mode** if enabled
3. Click **Browse** and search for `Book Metasearch`
4. Click **Install**, then **Enable**

## Features

- **4-provider metasearch**: Aladin (Korean primary) · Kakao (Korean recall) · Google Books (foreign primary) · Open Library (foreign covers/ISBN)
- **Two strategies**: Sequential fallback (default) or parallel Fanout with ISBN13 dedupe
- **Commands**: Search books · Search by ISBN · Search based on current note · Update book info · Migration helper
- **Template file** support with `{{variable}}` substitution — Templater `<% %>` blocks are preserved for post-creation execution
- **Frontmatter customization**: `useDefaultFrontmatter` toggle · key case (`as-is` / `camelCase` / `snake_case` / `kebab-case`) · additional YAML fragment with `{{variable}}` substitution
- **Cover image download** to a configurable folder
- **37 ISO 639-1 locale codes** for cross-provider language filtering
- **API keys masked** in settings with click-to-reveal
- **Cover thumbnails** in search results (opt-in)
- **Naver EOL migration**: opt-in helper detects an existing `obsidian-book-search-plugin` config and guides users through Aladin setup

## Provider setup

Only Aladin and Kakao require API keys (both free, instant issuance). Google Books works without a key at a lower rate limit. Open Library needs no auth.

| Provider | Auth | Free tier | Where to get a key |
|----------|------|-----------|--------------------|
| Aladin | TTB Key (required) | 5,000/day | [aladin.co.kr/ttb](https://www.aladin.co.kr/ttb/wblog_manage.aspx) |
| Kakao | REST API Key (required) | 30,000/day | [developers.kakao.com](https://developers.kakao.com/) |
| Google Books | API Key (optional) | 1,000/day with key, low limit without | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) — enable Books API first |
| Open Library | No auth | Effectively unlimited | — |

After installing, open **Settings → Book Metasearch → Providers**, paste keys, and hit **Healthcheck** on each provider.

## Attribution

- **Aladin**: Book DB by Aladin ([aladin.co.kr](https://www.aladin.co.kr))

The Aladin OpenAPI terms require linking each search result back to Aladin's product page. Leave the credit link toggle on if you keep the Aladin provider enabled.

## Development

Prerequisites: Node 20+, npm.

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
