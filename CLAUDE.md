# CLAUDE.md

`CONTRIBUTING.md` is the real document — dev setup, the test/lint/build loop,
known constraints, adding a provider, and the release process all live there.
Read it first. This file only holds what is specific to working here as an
agent, which is currently one thing: why `.claude/settings.json` looks the way
it does. JSON takes no comments, so the reasoning has nowhere else to go.

## Permission tiers in `.claude/settings.json`

**`ask` — outward-facing or hard to undo.** `git push`, `gh pr create|merge`,
`gh release`, and `npm install` all reach past this working copy. `git tag` is
on the list for a non-obvious reason: `.github/workflows/release.yml` triggers
on tag push, so a tag is a deploy. `data.json` is `ask` rather than `deny`
because it holds the live YES24 and Aladin API keys — reading it is sometimes
legitimately needed, but never incidentally.

**`deny` — no legitimate agent use.** `npm publish` (this is a community
plugin; publishing is a maintainer action outside Claude Code) and `.env`
reads.

**Deliberately absent: force-push, hard resets, discarding tracked changes.**
These are destructive and they are *not* missing by oversight — the global
`~/.claude/scripts/danger-guard.sh` hook already blocks them deterministically,
before the permission layer is consulted. Re-declaring them here would add a
second place to maintain the same rule without changing any outcome. If an
audit of this file flags them as a gap, that audit is wrong.

One consequence worth knowing: `danger-guard.sh` matches against the whole
Bash command string, heredoc bodies included. Writing a file whose *contents*
name those commands gets blocked too — which is why the paragraph above
describes them instead of quoting them. Use the Write tool for that, not a
heredoc.
