import { extname } from "node:path";
import type { Selection, SelectionKind } from "./selection";
import { ffmpegPresetScripts } from "./scripts/ffmpeg-presets";

export interface RunContext {
  signal: AbortSignal;
  /** pct 0–100, or null for indeterminate. Already throttled by the runner. */
  onProgress: (pct: number | null) => void;
}

export interface RunResult {
  outPath: string;
  inBytes: number;
  outBytes: number;
}

export interface ScriptDef {
  id: string;
  /** Grouping label — one List.Section per family in the picker. */
  family: string;
  title: string;
  /** Strategy one-liner shown as the list item subtitle. */
  subtitle: string;
  matcher: {
    /** Lowercase, dot-prefixed (".mov"). */
    extensions: string[];
    kinds: SelectionKind[];
  };
  run(file: string, ctx: RunContext): Promise<RunResult>;
}

export interface ApplicableScript {
  script: ScriptDef;
  /** Targets whose extension the script matches. */
  matched: string[];
  /** Targets in the selection the script does not apply to. */
  skipped: number;
}

/** New script family = one file in src/lib/scripts/ + one spread here. */
export const ALL_SCRIPTS: ScriptDef[] = [...ffmpegPresetScripts()];

export function applicableScripts(sel: Selection): ApplicableScript[] {
  return ALL_SCRIPTS.flatMap((script) => {
    if (!script.matcher.kinds.includes(sel.kind)) return [];
    const matched = sel.targets.filter((p) =>
      script.matcher.extensions.includes(extname(p).toLowerCase()),
    );
    if (matched.length === 0) return [];
    return [{ script, matched, skipped: sel.targets.length - matched.length }];
  });
}
