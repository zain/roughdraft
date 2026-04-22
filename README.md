# Roughdraft

An infinite canvas for writing.

Fork your prose. Explore every direction. Keep every version.

```
npx roughdraft
```

https://github.com/user-attachments/assets/placeholder.mp4

## What is this?

Roughdraft gives you a spatial canvas where each page is a markdown document. Drag pages around, fork them into variations, and diff any two versions side by side.

It's version control for prose — designed for writers who think by exploring.

## How it works

- **Infinite canvas** — Arrange your pages spatially, like a whiteboard
- **Fork any page** — Right-click to create a variation. Try a different angle without losing what you had
- **Drag to diff** — Drag one page onto another to see exactly what changed
- **Markdown files on disk** — Everything is just `.md` files in a folder. Use any editor alongside Roughdraft
- **Works with your AI agent** — Installs a skill so Claude Code (or any local agent) can read, edit, fork, and annotate your pages
- **Comments & suggestions** — Inline annotations using CriticMarkup syntax
- **No cloud, no account, no telemetry** — Runs entirely on your machine

## Quick start

```bash
npx roughdraft
```

This opens Roughdraft in your browser and creates a project in the current directory.

```bash
npx roughdraft ~/writing/my-essay
```

Open a specific project folder.

## Local development

```bash
./scripts/setup.sh
./scripts/run.sh
```

`./scripts/setup.sh` installs workspace dependencies and builds the app and server. `./scripts/run.sh` serves the built app at `http://localhost:3000`.

The two scripts coordinate through a lock file, so it's safe to start `./scripts/run.sh` while `./scripts/setup.sh` is still in progress. `run` will wait for setup to finish, or trigger setup itself if nothing has been built yet.

If you prefer package scripts, the same commands are available as `pnpm setup` and `pnpm start`.

## What's in the folder

```
my-essay/
  roughdraft.json       # Canvas layout and metadata
  draft-1.md            # Your writing — plain markdown
  draft-1-alt.md        # A fork you made
  draft-2.md            # Another page on the canvas
```

Every page is a regular markdown file. Edit them in VS Code, Vim, or anything else — Roughdraft picks up changes automatically.

## Agent skill

Roughdraft includes a skill for Claude Code that lets your agent:

- Read and edit pages on your canvas
- Fork a page and rewrite it with a different approach
- Add inline comments and suggested changes
- Rearrange the canvas layout

```bash
# The skill is installed automatically when you run roughdraft
claude code --skill roughdraft
```

## CriticMarkup

Roughdraft uses [CriticMarkup](https://criticmarkup.com) for inline annotations:

```markdown
This is {--deleted--} text.
This is {++inserted++} text.
This is {~~old~>new~~} substituted text.
This is {>>a comment<<} in the margin.
This is {==highlighted==} text.
```

## Try the demo

Don't want to install anything? Try the [live demo](https://roughdraft.page) — it runs entirely in your browser using local storage.

## License

MIT

---

Built by [Nathan Baschez](https://twitter.com/nbashaw)
