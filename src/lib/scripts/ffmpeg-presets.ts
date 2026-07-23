import { statSync } from "node:fs";
import { probe, runEncode } from "../ffmpeg";
import { commitOutput, discardOutput, planOutput } from "../output";
import { prefs, type Prefs } from "../prefs";
import type { RunResult, ScriptDef } from "../registry";
import type { SelectionKind } from "../selection";

interface FfmpegPreset {
  id: string;
  title: string;
  /** The one distinct compression strategy this preset applies. */
  strategy: string;
  suffix: string;
  video: (p: Prefs) => string[];
  /** "copy" → `-c:a copy`; array → explicit args. Both gated on the input having audio. */
  audio: "copy" | string[];
}

// trunc(iw/4)*2 halves while guaranteeing even dimensions (odd sizes break yuv420p encoders).
const SCALE_HALF = "scale=trunc(iw/4)*2:trunc(ih/4)*2:flags=lanczos";

const X264_FAST = [
  "-c:v",
  "libx264",
  "-crf",
  "23",
  "-preset",
  "veryfast",
  "-pix_fmt",
  "yuv420p",
];

// libx265 default: HW (videotoolbox) is ~10× faster but bitrate-oriented — worse
// size-per-quality on static screen content. -tag:v hvc1 is mandatory for QuickTime.
function hevcArgs(p: Prefs, crf: string): string[] {
  if (p.hevcEncoder === "hevc_videotoolbox") {
    return [
      "-c:v",
      "hevc_videotoolbox",
      "-q:v",
      "45",
      "-allow_sw",
      "1",
      "-tag:v",
      "hvc1",
      "-pix_fmt",
      "yuv420p",
    ];
  }
  return [
    "-c:v",
    "libx265",
    "-crf",
    crf,
    "-preset",
    "fast",
    "-tag:v",
    "hvc1",
    "-pix_fmt",
    "yuv420p",
  ];
}

const PRESETS: FfmpegPreset[] = [
  {
    id: "fps-15",
    title: "Reduce Frame Rate",
    strategy: "fps 60→15, quality kept",
    suffix: ".fps15",
    video: () => ["-vf", "fps=15", ...X264_FAST],
    audio: "copy",
  },
  {
    id: "crf-28",
    title: "Recompress Quality",
    strategy: "CRF 28, resolution/fps kept",
    suffix: ".crf28",
    video: () => [
      "-c:v",
      "libx264",
      "-crf",
      "28",
      "-preset",
      "slow",
      "-pix_fmt",
      "yuv420p",
    ],
    audio: "copy",
  },
  {
    id: "half-res",
    title: "Downscale 50%",
    strategy: "resolution halved (lanczos)",
    suffix: ".half",
    video: () => ["-vf", SCALE_HALF, ...X264_FAST],
    audio: "copy",
  },
  {
    id: "hevc",
    title: "Convert to HEVC",
    strategy: "codec change to H.265 (hvc1)",
    suffix: ".hevc",
    video: (p) => hevcArgs(p, "28"),
    audio: "copy",
  },
  {
    id: "max-squeeze",
    title: "Max Squeeze",
    strategy: "10fps + half res + HEVC + mono audio",
    suffix: ".min",
    video: () => [
      "-vf",
      `fps=10,${SCALE_HALF}`,
      "-c:v",
      "libx265",
      "-crf",
      "30",
      "-preset",
      "fast",
      "-tag:v",
      "hvc1",
      "-pix_fmt",
      "yuv420p",
    ],
    audio: ["-c:a", "aac", "-b:a", "64k", "-ac", "1"],
  },
];

const VIDEO_EXTENSIONS = [".mov", ".mp4"];
const ALL_KINDS: SelectionKind[] = ["single", "multiple", "folder"];

function presetToScript(preset: FfmpegPreset): ScriptDef {
  return {
    id: preset.id,
    family: "FFmpeg Compress",
    title: preset.title,
    subtitle: preset.strategy,
    matcher: { extensions: VIDEO_EXTENSIONS, kinds: ALL_KINDS },
    async run(file, ctx): Promise<RunResult> {
      const p = prefs();
      const info = await probe(p.ffprobePath, file);
      const plan = planOutput(file, preset.suffix);
      // -c:a copy is container-safe: the suffix keeps the original extension.
      const audio = !info.hasAudio
        ? []
        : preset.audio === "copy"
          ? ["-c:a", "copy"]
          : preset.audio;
      try {
        await runEncode({
          ffmpegPath: p.ffmpegPath,
          inPath: file,
          outPath: plan.tmpPath,
          args: [...preset.video(p), ...audio],
          durationSec: info.durationSec,
          signal: ctx.signal,
          onProgress: ctx.onProgress,
        });
        commitOutput(plan);
        return {
          outPath: plan.outPath,
          inBytes: statSync(file).size,
          outBytes: statSync(plan.outPath).size,
        };
      } catch (e) {
        discardOutput(plan);
        throw e;
      }
    },
  };
}

export function ffmpegPresetScripts(): ScriptDef[] {
  return PRESETS.map(presetToScript);
}
