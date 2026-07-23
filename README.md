# File Scripts

Run scripts on the current Finder selection. Detects what you selected (single file / multiple files / a folder), offers the scripts that apply to those file types, and runs them with live per-file progress. Ships with ffmpeg compression presets for macOS screen recordings — frame-rate reduction, CRF recompress, 50% downscale, HEVC conversion, and a max-squeeze combo. Outputs are new sibling files (`demo.mov` → `demo.fps15.mov`); originals are never touched.

## Requirements

- [Bun](https://bun.sh/) (or npm)
- [Raycast](https://raycast.com/) (the `ray` CLI ships with the app)
- ffmpeg (`brew install ffmpeg`) — paths configurable in the extension preferences

## Getting Started

```bash
bun install
bun run dev    # ray develop — registers + hot-reloads in Raycast
```

## Common Commands

| Command | Description |
|---------|-------------|
| `bun install` | Install dependencies |
| `bun run dev` | ray develop (hot reload in Raycast) |
| `bun run build` | ray build |
| `bun run lint` | ray lint |
| `bun run fix-lint` | ray lint --fix |

## Project Structure

```
src/
  run-script.tsx           # View command: detect → pick script → run → live progress
  lib/
    prefs.ts               # Typed preferences (ffmpeg paths, HEVC encoder) + PATH builder
    selection.ts           # Finder selection via osascript, clipboard fallback
    output.ts              # Sibling output naming, collision dedup, tmp-file protocol
    ffmpeg.ts              # ffprobe metadata + ffmpeg encode with live progress
    registry.ts            # Script definitions + selection matching
    scripts/
      ffmpeg-presets.ts    # The compression preset table
assets/
  command-icon.png
package.json               # Raycast manifest (commands, preferences)
```
