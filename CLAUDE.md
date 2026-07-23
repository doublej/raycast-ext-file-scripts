# File Scripts

> Run scripts on the current Finder selection — ffmpeg compression presets for screen recordings, with live progress.

## What this is

A Raycast extension: detect the Finder selection (clipboard paths as fallback), offer the scripts applicable to the selected extensions + selection kind (single / multiple / folder), run them sequentially with per-file live progress. First script family: ffmpeg presets that compress macOS screen recordings — each preset one distinct strategy (fps, CRF, downscale, codec, combo).

## Architecture

```
package.json                  # Raycast manifest — run-script command, ffmpeg prefs
src/
├── run-script.tsx            # single view command: detect → pick script → run → live progress
└── lib/
    ├── prefs.ts              # ffmpegPath/ffprobePath/extraPath expansion, buildPath()
    ├── selection.ts          # osascript Finder selection, clipboard fallback, classify()
    ├── output.ts             # sibling naming + collision dedup + tmp-file protocol
    ├── ffmpeg.ts             # ffprobe probe(); runEncode() with -progress parsing + abort
    ├── registry.ts           # ScriptDef/RunContext/RunResult + applicableScripts()
    └── scripts/
        └── ffmpeg-presets.ts # preset data table + presetToScript() adapter
```

- **selection.ts** — `classify()`: 1 dir → `folder` (targets = its direct child files); 1 file → `single`; else `multiple` (dirs expanded one level). Paths normalized (`file://` URLs, `~`).
- **output.ts** — outputs are siblings with a suffix (`demo.mov` → `demo.fps15.mov`), collisions auto-dedup (`-2`, `-3`…). Encodes go to `<stem><suffix>.tmp<ext>`, renamed on exit 0, unlinked on fail/cancel. Originals are never overwritten (`ffmpeg -n` backstop).
- **ffmpeg.ts** — progress via `-progress pipe:1 -nostats`; pct = out_time / probed duration (indeterminate when duration is N/A); stderr kept in a ring buffer for error detail; AbortSignal SIGKILLs the child.
- **run-script.tsx** — sequential encodes (one ffmpeg at a time — predictable CPU/thermals); one Animated toast mutated per tick (`[2/5] demo.mov · 42% · Max Squeeze`), flipped to Success/Failure at the end; cancel via toast primary action or the row action.

## Gotchas

1. **Raycast has no user PATH.** ffmpeg/ffprobe are resolved from absolute-path preferences (`ffmpegPath`/`ffprobePath`), never from PATH. Anything else spawned goes through `buildPath()` (`src/lib/prefs.ts`).
2. **ffmpeg's `out_time_ms` is actually microseconds.** Progress parsing uses `out_time_us` (with the `out_time` timecode as fallback) — do not "fix" it to read `out_time_ms` as milliseconds.
3. **Finder selection needs Automation permission.** osascript fails with `Not authorized` (-1743) until System Settings › Privacy & Security › Automation → Raycast → Finder is enabled. The empty-state hints at this; keep `isAutomationError()` in sync with the error text.

## Adding a script family

One file + one array entry:

1. Create `src/lib/scripts/<family>.ts` exporting `ScriptDef[]` (see `ffmpeg-presets.ts` — a declarative data table + adapter).
2. Spread it into `ALL_SCRIPTS` in `src/lib/registry.ts`.

Matching is declarative via `matcher: { extensions, kinds }`; the picker groups by `family` and shows `subtitle` as the strategy line.

## Invariants

- `package.json` **is** the Raycast manifest — commands and preferences live there, not in code.
- Spawn with argv arrays (`execFile`/`spawn`), never shell strings — filenames contain spaces/unicode.
- Never write over an input file; all outputs are new siblings.
- ESLint with the `@raycast` config is the only linter; `ray lint` runs it (Prettier included).

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
