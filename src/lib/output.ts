import { existsSync, renameSync, unlinkSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";

export interface OutputPlan {
  /** Final output path — sibling of the input, never colliding, never the original. */
  outPath: string;
  /** Encode target; renamed to outPath on success, unlinked on failure/cancel. */
  tmpPath: string;
}

function tmpFor(outPath: string): string {
  const ext = extname(outPath);
  const stem = basename(outPath, ext);
  return join(dirname(outPath), `${stem}.tmp${ext}`);
}

/**
 * `demo.mov` + `.fps15` → `demo.fps15.mov`; if taken, `demo.fps15-2.mov`, `-3`, …
 * Both the output path and its tmp sibling must be free — originals are never overwritten.
 */
export function planOutput(inPath: string, suffix: string): OutputPlan {
  const ext = extname(inPath);
  const stem = basename(inPath, ext);
  const dir = dirname(inPath);
  for (let n = 1; ; n++) {
    const dedup = n === 1 ? "" : `-${n}`;
    const outPath = join(dir, `${stem}${suffix}${dedup}${ext}`);
    const tmpPath = tmpFor(outPath);
    if (!existsSync(outPath) && !existsSync(tmpPath)) {
      return { outPath, tmpPath };
    }
  }
}

/** Atomically publish a finished encode. */
export function commitOutput(plan: OutputPlan): void {
  renameSync(plan.tmpPath, plan.outPath);
}

/** Remove tmp residue after a failed or cancelled encode. */
export function discardOutput(plan: OutputPlan): void {
  try {
    unlinkSync(plan.tmpPath);
  } catch {
    // never created or already gone
  }
}
