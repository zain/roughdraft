# Eureka fork of Roughdraft

This repo (`github.com/zain/roughdraft`) is our fork of upstream
[`Lex-Inc/roughdraft`](https://github.com/Lex-Inc/roughdraft). This doc records
why the fork exists, how it diverges from upstream, what we did to get here, and
how to keep it current. It's the "pick back up here" handoff.

_Last updated: 2026-06-20. Fork version at that point: `0.1.10-eureka.1`
(tracking upstream `0.1.10`, tip `686919e`)._

## Why we run a fork

Upstream is not merging our changes (PR #121 has been open and ignored), so we
maintain our own build and install it globally. **We have given up on upstream
merging our code** — we are not waiting on them for anything.

## How the fork diverges from upstream

Only two changes are genuinely ours. Everything else in `main` is plain
upstream `0.1.10`.

| Change | In upstream? | In our fork? | Where |
| --- | --- | --- | --- |
| Headers-timeout fix (bound each watch long-poll to `WATCH_POLL_SECONDS = 240s`, re-poll in a loop, so reviews longer than 5 min don't crash with `UND_ERR_HEADERS_TIMEOUT`) | ❌ no (PR #121 ignored) | ✅ yes | `packages/server/src/cli.ts` |
| Update check/notification removed (we won't upgrade to upstream's published package, so the "update available" nag is pointless) | ❌ no (deliberate) | ✅ yes | see commit `dff8b16` |
| Fork-distinct package metadata (`version`, `repository`, `homepage`, `bugs`) | ❌ no | ✅ yes | `package.json` |

Everything that used to live in our many feature branches (inline-code
comments, link-edit focus, table-header preservation, suggesting-mode bugs,
path-traversal hardening, dark mode, etc.) was **independently fixed by upstream
in 0.1.10** — we verified this by porting each old branch's test onto current
`main` and confirming it passes. So those branches are obsolete and were
deleted.

## What we did on 2026-06-20

1. **Removed the update check end-to-end.** Deleted the server
   `update-status` module + `/api/update-status` endpoint + CLI update-notice
   wiring, the app `UpdateNotice` component + client, related tests, and the
   now-unused `createApp` options (`fetchImpl`, `packageJsonPath`,
   `packageName`). Commit `dff8b16`.
2. **Synced to upstream 0.1.10.** Our `main` had zero divergence from upstream,
   so we fast-forwarded it to `0.1.10` (dark-mode polish, document
   status/handoff, homepage refresh, comment/context-menu/workspace
   improvements, review animations, new e2e tests, setup example doc).
3. **Baked in the headers-timeout fix.** Merged `fix-watch-headers-timeout`
   (PR #121) into `main` (commit `bd73bd6`) so the fix lives in the binary, not
   just in a local shim.
4. **Set fork-distinct metadata.** `0.1.10-eureka.1`; repository/homepage/bugs
   point at `zain/roughdraft` (MIT author attribution kept). Commit `9e8eb78`.
5. **Audited and discarded obsolete branches.** Confirmed 4 candidate bug
   branches were already fixed in 0.1.10, then deleted 51 stale branches from
   the fork (everything provably contained in `main`). Kept `main` and
   `fix-watch-headers-timeout` (the latter backs the still-open PR #121).
6. **Retired the undici wrapper shim.** The 240s poll bound fixes the
   long-review crash at the source, so `~/.claude/scripts/roughdraft-open` and
   `roughdraft-undici-fix.mjs` were deleted and `~/.claude/CLAUDE.md` was
   updated to call `roughdraft open` directly.
7. **Hardened the global install.** Replaced a stray symlink-to-working-clone
   install with a self-contained tarball install (see below).

## Current state

- `main` is synced to `origin/main` and is `upstream/0.1.10` + the three fork
  changes above.
- The globally-installed `roughdraft` CLI is a **standalone tarball copy**
  (decoupled from this working clone), version `0.1.10-eureka.1`.
- 27 old branches remain on the fork. They are most likely also obsolete
  (squash-merged upstream like the audited four) but were **not individually
  verified**, so they were left in place. A future sweep can audit + delete
  them the same way (port each branch's test onto `main`, delete if it passes).
- PR #121 (`fix-watch-headers-timeout` → upstream) is still open. We've given
  up on it being merged; it can be closed at any time with no impact on the
  fork.

## How to maintain the fork

### Pull new upstream changes

```bash
git fetch upstream
git merge upstream/main      # usually a clean merge; our divergence is tiny
pnpm install                 # if deps changed
pnpm check                   # lint + selectors + tests + build
```

If a future upstream version re-introduces an update check, remove it again the
same way as commit `dff8b16`.

### Rebuild and reinstall the global CLI

The global CLI is a copy, so changes here do **not** take effect until you
rebuild, repack, and reinstall:

```bash
pnpm build
npm pack                                   # -> roughdraft-<version>.tgz
npm install -g ./roughdraft-<version>.tgz  # replaces the global copy
rm roughdraft-*.tgz                         # clean up the artifact
roughdraft --version                        # should print the fork version
```

Do **not** use `npm i -g .` — modern npm installs a local directory as a
symlink into this working clone, which then breaks when you switch branches,
run `pnpm dev`, or move the folder. Always install the packed tarball.

### Bump the fork version

Edit `version` in `package.json` (keep the `-eureka.N` suffix so the build
stays distinguishable from upstream), then rebuild + reinstall as above.

## Repo conventions worth knowing

See `AGENTS.md` for the full set. Most relevant when changing code here:

- **Prove It workflow:** reproduce a bug with a failing test before fixing it;
  this is exactly how we audited the old branches.
- **Worktree-local dev CLI:** for repo-local development use
  `roughdraft-dev-<worktree-name>` (installed by `pnpm dev:install-cli`), not
  the global `roughdraft`.
- **Tests:** `pnpm test` (unit), `pnpm test:smoke` (Playwright smoke, run after
  UI/editor/routing changes), `pnpm check` (the full gate).
