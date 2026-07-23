import { getPreferenceValues } from "@raycast/api";
import { homedir } from "node:os";

export type HevcEncoder = "libx265" | "hevc_videotoolbox";

export interface Prefs {
  ffmpegPath: string;
  ffprobePath: string;
  extraPath: string;
  hevcEncoder: HevcEncoder;
  repoPath: string;
}

function expand(p: string): string {
  return p.replace(/^\$HOME/, homedir()).replace(/^~/, homedir());
}

export function prefs(): Prefs {
  const raw = getPreferenceValues<Prefs>();
  return {
    ffmpegPath: expand(raw.ffmpegPath || "/opt/homebrew/bin/ffmpeg"),
    ffprobePath: expand(raw.ffprobePath || "/opt/homebrew/bin/ffprobe"),
    hevcEncoder:
      raw.hevcEncoder === "hevc_videotoolbox" ? "hevc_videotoolbox" : "libx265",
    repoPath: expand(
      raw.repoPath ||
        "$HOME/Documents/development/raycast/raycast-ext-file-scripts",
    ),
    extraPath: (raw.extraPath || "")
      .split(":")
      .map(expand)
      .filter(Boolean)
      .join(":"),
  };
}

/** Raycast spawns processes with a bare env — no user PATH. Build one from the extraPath pref. */
export function buildPath(extra: string): string {
  const base = "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";
  return extra ? `${extra}:${base}` : base;
}
