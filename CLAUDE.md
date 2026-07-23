# File Scripts

> A Raycast extension

## What this is

A Raycast extension: React + TypeScript, built and run by the `ray` CLI (ships with the Raycast app). `bun` for install, ESLint (`@raycast` config) for lint. No test suite — verification is lint + build + manual run in Raycast.

## Mental model

```
package.json        # Raycast manifest — commands[], preferences[], deps
src/
├── hello.tsx       # one file per command (name matches commands[].name)
└── lib/prefs.ts    # typed preferences + PATH builder
assets/
└── command-icon.png
```

Each entry in `package.json` → `commands[]` maps to a `src/<name>.tsx` file whose default export is the command. Preferences declared in the manifest are read via `getPreferenceValues` (wrapped in `src/lib/prefs.ts`).

## Invariants

- `package.json` **is** the Raycast manifest — commands and preferences live there, not in code.
- Raycast spawns processes with a bare env: **no user PATH**. Any spawned binary must be resolved via the `extraPath` preference + `buildPath()` (`src/lib/prefs.ts`), never assumed on PATH.
- Spawn with argv arrays (`execFile`), never shell strings — filenames contain spaces/unicode.
- ESLint with the `@raycast` config is the only linter; `ray lint` runs it.

## Common change patterns

- **Add a command** → new `src/<name>.tsx` with a default-export component + entry in `commands[]` in `package.json`.
- **Add a preference** → entry in `preferences[]` + extend the `Prefs` interface in `src/lib/prefs.ts`.
- **Add a dependency** → `bun add <pkg>`.

## Verification

```sh
bun run lint       # ray lint
bun run build      # ray build — catches type/bundle errors
```

No tests. Verify behavior manually: `bun run dev` registers the extension in Raycast with hot reload.

## Related context

- [agent.md](agent.md) — verify loop, common tasks, boundaries
- `.claude/` — Claude Code settings, scaffold-update hook, library-freshness hook

<!-- agent-log:policy -->
### Shared agent journal

Use `./agent-log` (a shim for `atlas agent-log` — both are identical) for short-lived
operational awareness between concurrent agents. It is not chat and not a task tracker: the
issue tracker remains the source of truth for ownership, blockers, and durable findings.

- Run `./agent-log recent` before interpreting shared state.
- Before an action that can change another agent's observations, write an intent with every
  affected scope. This includes shared-worktree edits, generated artifacts, git/index
  mutations, and shared ports, processes, or services.
- Run builds, tests, and deployments through the wrapper so start, commit, dirty state,
  duration, exit code, and outcome are recorded even on failure:
  `./agent-log run build|test|deploy --scope <resource> [--bead <id>] -- <command...>`.
- For manual operations, use `./agent-log begin <operation> --scope <resource> [--bead <id>]
  -- <summary>` and always close the returned id with `./agent-log end <id> --outcome
  ok|failed|cancelled -- <result>`.
- Record a temporary result-affecting discovery with `./agent-log finding --scope <resource>
  --evidence <fact> [--bead <id>] -- <summary>`. Promote lasting knowledge to the issue
  tracker or the relevant doc.
- Intents expire after 20 minutes and findings after 4 hours unless `--ttl` overrides them.
  Renew by closing and reopening an intent; never treat an expired entry as current.
- Keep summaries factual and short. Do not reply, ask questions, mention agents, narrate
  routine progress, or log isolated reads/edits/tests that cannot affect anyone else.

Canonical scopes are `path:<repo-relative-path>`, `artifact:<name>`, `service:<name>`,
`host:<name>`, `port:<number>`, and `git:<worktree-or-ref>`; a repo may define additional
canonical scopes of its own. Add multiple `--scope` flags when needed. The journal SQLite db
lives in the git common directory, so linked worktrees share it without dirtying the repo.
