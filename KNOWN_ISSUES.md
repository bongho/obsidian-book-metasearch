# Known Issues

Recurring friction observed while working on this repo. Each entry tracks hit
count; at 3+ hits it becomes a candidate for promotion to a skill, command, or
rule. Log only patterns that actually recurred — one occurrence is a note, not
a pattern.

Durable constraints (things that are simply true about this repo) belong in
`CONTRIBUTING.md` under "Known constraints" instead. This file is for friction
that might be worth automating away.

---

## KI-001 — Dependabot lockfile-conflict cascade

**Hits:** 1 (2026-08-09)

Merging one dependabot PR flips every other open one to `CONFLICTING`, because
they all touch `package-lock.json`. Clearing a batch of 7 meant: merge one →
comment `@dependabot rebase` on the rest → poll `mergeable` until it leaves
`UNKNOWN` → merge the next. GitHub reports `UNKNOWN` for ~30s after each merge
while it recomputes, so the polling isn't optional.

PRs touching only `.github/workflows/*.yml` don't conflict and can be merged
back-to-back first, which shortens the cascade.

**If this recurs:** a `/dependabot-clear` command doing check-rollup → rebase →
poll → report is the shape. Merge decisions stay human.

---

## KI-002 — Trusting CI green on a dependency bump

**Hits:** 1 (2026-08-09)

CI passing on a dependabot PR means the lockfile resolved and the suite ran
against it — not that the bump is safe to take as a batch. Reproducing all six
pending bumps locally on one branch and running `npm run verify` caught that
`@eslint/js@10` could never resolve, before any merge happened.

**If this recurs:** fold "reproduce locally, then verify" into the pre-merge
step rather than automating the judgment.

---

## KI-003 — Fixing lint warnings unmasks more

**Hits:** 1 (2026-08-09)

`obsidianmd/ui/sentence-case` didn't report every violation at once. After
clearing 48 warnings, a 49th appeared (`Search UI` → `Search ui`) that had been
hidden. Re-run lint after a fix batch before calling the count final.

Related: sorting these warnings into "rule is wrong, configure it" vs "rule is
right, fix the source" is judgment, not mechanics — worth keeping human even
if the surrounding steps get automated.
