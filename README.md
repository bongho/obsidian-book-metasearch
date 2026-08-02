# Obsidian Book Metasearch

Book note maker with metasearch across **Aladin · Kakao · Google Books · Open Library**, queried in parallel.

Successor to [anpigon/obsidian-book-search-plugin](https://github.com/anpigon/obsidian-book-search-plugin) (22 months unmaintained · 78 open issues). Built to solve the Naver Book Search API EOL (2026-08-01) and provide a proper Korean-first book note workflow.

> ⚠️ **Status**: Sprint S1 development in progress (2026-08). Not yet ready for BRAT install. First public release planned 2026-11.

## Features (planned)

### MVP (S1–S9, 2026-08 ~ 2026-12)

- **4-provider metasearch**: Aladin (Korean primary) · Kakao (Korean recall) · Google Books (foreign primary) · Open Library (foreign covers/ISBN)
- **Naver EOL migration UX**: detects existing anpigon config and guides one-click migration to Aladin
- **Frontmatter presets**: Minimal / Standard / Extended / Custom — field on/off + user-defined fields
- **Regenerate with edit preservation**: `<!-- BOOKSEARCH:AUTO-START/END -->` markers protect user edits
- **Path variables**: `{{author}}`, `{{title}}`, `{{isbn}}`, `{{category}}` in save paths
- **HQ cover with fallback**: Google Books zoom removal, Open Library CDN, iPadOS support

### v1.1+ (2027)

- **data4library integration**: public library availability display
- **Kyobo scraper**: 800px+ cover quality, eBook links
- **SEOJI validation backend**: ISBN authoritative check (National Library of Korea)

## Why a new plugin?

The upstream `anpigon/obsidian-book-search-plugin` has 78 open issues (many unaddressed for 2+ years) covering: Google Books API breakage (400/429/403 errors), frontmatter customization, regenerate edit preservation, cover folder auto-creation, path variables, multi-author support. Combined with the Naver Book Search API discontinuation on 2026-08-01, Korean Obsidian users have no working native option. This plugin is a clean-room rewrite that addresses those gaps.

See [PRD](../reference/prd.md) for full spec.

## Development

Prerequisites: Node 20+, npm.

```bash
# clone & install
git clone https://github.com/bongho/obsidian-book-metasearch.git
cd obsidian-book-metasearch
npm install

# dev — build directly into vault plugin folder
export VAULT_PLUGIN_DIR="/path/to/your/vault/.obsidian/plugins/obsidian-book-metasearch"
mkdir -p "$VAULT_PLUGIN_DIR"
cp manifest.json styles.css "$VAULT_PLUGIN_DIR/"
OUTDIR="$VAULT_PLUGIN_DIR" npm run dev

# production build
npm run build
```

For hot-reload, install [pjeby/hot-reload](https://github.com/pjeby/hot-reload) via BRAT and create an empty `.hotreload` file in the plugin folder.

## Data source attribution

- **Aladin**: Book DB by Aladin — https://www.aladin.co.kr

Aladin OpenAPI requires linking each search result back to Aladin's product page. Do not remove the credit link at the bottom of generated notes if you keep the Aladin provider enabled.

## License

MIT © 2026 BongHo Lee
