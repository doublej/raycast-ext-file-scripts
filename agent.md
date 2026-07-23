# File Scripts

> Run scripts on the current Finder selection — ffmpeg compression presets for screen recordings, with live progress.

## Stack

- TypeScript, React, Raycast API (`@raycast/api`), `ray` CLI
- Bun for install; ESLint (`@raycast` config) for lint

## Commands

- `bun install` — install dependencies
- `bun run dev` — `ray develop` (registers + hot-reloads in Raycast; agent must not run this)
- `bun run build` — `ray build`
- `bun run lint` / `bun run fix-lint` — `ray lint` / `ray lint --fix`

## Project Structure

```
src/
├── run-script.tsx  # view command: detect → pick script → run → live progress
└── lib/            # prefs, selection, output, ffmpeg, registry, scripts/
package.json        # Raycast manifest: commands, preferences, deps
tsconfig.json       # strict, react-jsx, noEmit
```

## Conventions

- `package.json` is the Raycast manifest — declare commands/preferences there first, then implement.
- Strict TypeScript; no `any` without justification.
- Spawn binaries with argv arrays and a PATH built via `buildPath()` — Raycast has no user PATH.
- Keep functions small; prefer explicit, readable code over cleverness.

## Agent

### Verify Loop

1. `bun run lint`
2. `bun run build`

No test suite — verify manually in Raycast after `bun run dev`.

### Common Tasks

- Add a command: create `src/<name>.tsx` (default-export component) and add the matching `commands[]` entry in `package.json`
- Add a preference: add to `preferences[]` in `package.json`, extend `Prefs` in `src/lib/prefs.ts`
- Add a script family: new file in `src/lib/scripts/` exporting `ScriptDef[]`, spread into `ALL_SCRIPTS` in `src/lib/registry.ts` (see CLAUDE.md)
- Add a dependency: `bun add <package>`

### Boundaries

- Do not run `bun run dev` (long-running; user runs it)
- Do not publish to the Raycast store
