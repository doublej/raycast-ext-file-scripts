# File Scripts

Run scripts on the current Finder selection. Detects what you selected (single file / multiple files / a folder), offers the scripts that apply to those file types, and runs them with live per-file progress. Ships with ffmpeg compression presets for macOS screen recordings — frame-rate reduction (15/30 fps), CRF recompress, 50% downscale, a 30fps+half-res combo, HEVC conversion, and a max-squeeze combo. Outputs are new sibling files (`demo.mov` → `demo.fps15.mov`); originals are never touched.

## Requirements

- [Bun](https://bun.sh/) (or npm)
- [Raycast](https://raycast.com/) (the `ray` CLI ships with the app)
- ffmpeg (`brew install ffmpeg`) — paths configurable in the extension preferences

## Getting Started

```bash
bun install
bun run dev    # ray develop — registers + hot-reloads in Raycast
```

## Presets

All presets match `.mov` and `.mp4` files. The suffix names the output sibling.

| Preset | What it does | Output |
|--------|--------------|--------|
| Reduce Frame Rate 15 | 60 → 15 fps, picture quality kept | `demo.fps15.mov` |
| Reduce Frame Rate 30 | 60 → 30 fps, picture quality kept | `demo.fps30.mov` |
| Recompress Quality | CRF 28 re-encode, resolution and fps kept | `demo.crf28.mov` |
| Downscale 50% | resolution halved (lanczos) | `demo.half.mov` |
| 30fps + Downscale 50% | 30 fps and half resolution in one pass | `demo.fps30half.mov` |
| Convert to HEVC | H.265 with the `hvc1` tag, plays in QuickTime | `demo.hevc.mov` |
| Max Squeeze | 10 fps, half resolution, HEVC, mono 64k audio | `demo.min.mov` |

## Examples

- **Shrink one recording for Slack.** Select `demo.mov` in Finder, open *Run Script on Selection*, pick *Max Squeeze*. A 60 MB screen recording typically lands around a few MB as `demo.min.mov`, and the row shows the size delta (`61.2 MB → 4.8 MB (-92%)`).
- **Batch a whole folder.** Select one folder of recordings. The extension targets every video directly inside it and encodes them one at a time, with a progress icon per file and a live toast (`[2/5] demo.mov · 42% · Max Squeeze`).
- **Mixed selections are fine.** Select `demo.mov`, `notes.png`, and `clip.mp4` together. Presets run on the two videos and the picker shows `1 file(s) skipped (no match)`.
- **Re-runs never overwrite.** Run the same preset twice and the second output becomes `demo.fps15-2.mov`, then `-3`, and so on. Originals are never touched.
- **Cancel without leftovers.** The toast has a *Cancel* action. The current encode is killed and its partial temp file is removed; finished files stay.
- **Pick your HEVC trade-off.** The *HEVC encoder* preference switches *Convert to HEVC* from `libx265` (smallest files) to `hevc_videotoolbox` (hardware, roughly 10× faster, larger files).
- **Paths from the clipboard.** No Finder selection? Copy absolute file paths (one per line) and the extension uses those instead.
- **Silent recordings just work.** Audio flags are only added when the source actually has an audio track, so mic-less screen recordings encode without errors.

## Extending

A script family is one file in `src/lib/scripts/` exporting `ScriptDef[]`, plus one spread in `ALL_SCRIPTS` (`src/lib/registry.ts`). Matching is declarative: `matcher: { extensions, kinds }` where kinds are `single`, `multiple`, `folder`. See `CLAUDE.md` for the recipe. Ideas that fit the model: image resize/optimize presets (sips or ImageMagick), PDF compression (Ghostscript), audio extraction (`-vn` to `.m4a`), GIF conversion for short clips.

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
