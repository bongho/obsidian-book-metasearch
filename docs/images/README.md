# Screenshot / GIF assets

Store screenshots and GIFs here. Reference them from the root `README.md`
using **absolute raw.githubusercontent.com URLs** so Obsidian community-plugin
pages (which don't clone the repo) render them correctly:

```md
![Search modal](https://raw.githubusercontent.com/bongho/obsidian-book-metasearch/main/docs/images/search-modal.png)
```

## Wishlist (v1.1.0)

Priority order matches the "first impression" of the plugin:

1. **`search-modal.png`** — `Search books` command with a live query, showing 2-3 results with cover thumbnails
2. **`create-flow.gif`** — search → pick → new note opens with frontmatter + `## Abstract / Description` populated (M0-D)
3. **`duplicate-modal.png`** — DuplicateModal 4-button UI (M1-A) with a real ISBN match
4. **`reading-log.png`** — before/after `Mark book as reading` command, showing `status` + `startedAt` frontmatter (M1-B)
5. **`settings-tab.png`** — full settings tab with all sections visible (Providers · Notes · Covers · Search UI · Attribution · Tools · Reading Log · Citation · Duplicates · Price Check · Diagnostics)
6. **`migration-modal.png`** — Naver → Aladin migration helper (opt-in for anpigon users)

## Guidelines

- **Resolution**: retina (2x) source, ~1200px wide max for GIFs
- **Format**: PNG for stills, GIF for flows (< 5MB to keep GitHub render responsive)
- **Content redaction**: mask any personal vault paths or reading history that shouldn't be public
- **Theme**: use Obsidian's default theme for consistency across contributors

## GIF recording

macOS: `Cmd+Shift+5` → "Record Selected Portion" → export as MOV → convert to GIF (e.g. `ffmpeg -i input.mov -vf "fps=15,scale=1200:-1" -loop 0 output.gif`).
