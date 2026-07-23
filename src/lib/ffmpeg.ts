import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export interface ProbeInfo {
  /** null when the container reports no duration (progress becomes indeterminate). */
  durationSec: number | null;
  hasAudio: boolean;
  width: number | null;
  height: number | null;
}

interface FfprobeStream {
  codec_type?: string;
  width?: number;
  height?: number;
}

interface FfprobeOutput {
  format?: { duration?: string };
  streams?: FfprobeStream[];
}

export async function probe(
  ffprobePath: string,
  file: string,
): Promise<ProbeInfo> {
  const { stdout } = await execFileP(
    ffprobePath,
    [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      file,
    ],
    { timeout: 15_000, maxBuffer: 4 * 1024 * 1024 },
  );
  const data = JSON.parse(stdout) as FfprobeOutput;
  const rawDuration = parseFloat(data.format?.duration ?? "");
  const video = data.streams?.find((s) => s.codec_type === "video");
  return {
    durationSec:
      Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : null,
    hasAudio: !!data.streams?.some((s) => s.codec_type === "audio"),
    width: video?.width ?? null,
    height: video?.height ?? null,
  };
}

export class EncodeError extends Error {
  stderrTail: string;
  exitCode: number | null;
  constructor(message: string, stderrTail: string, exitCode: number | null) {
    super(message);
    this.name = "EncodeError";
    this.stderrTail = stderrTail;
    this.exitCode = exitCode;
  }
}

export interface EncodeOptions {
  ffmpegPath: string;
  inPath: string;
  /** Encode target (the caller's tmp path). Never an existing file — `-n` refuses overwrite. */
  outPath: string;
  /** Codec/filter args placed between `-i <in>` and the output path. */
  args: string[];
  durationSec: number | null;
  signal: AbortSignal;
  /** pct 0–100, or null when duration is unknown (indeterminate). Throttled. */
  onProgress: (pct: number | null) => void;
}

const STDERR_RING_MAX = 4_000;

/** Parse one `-progress pipe:1` block line. ffmpeg's `out_time_ms` is µs too — use `out_time_us`. */
function parseOutTimeSec(line: string): number | null {
  const us = line.match(/^out_time_us=(\d+)/);
  if (us) return parseInt(us[1], 10) / 1e6;
  const tc = line.match(/^out_time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (tc) {
    return (
      parseInt(tc[1], 10) * 3600 + parseInt(tc[2], 10) * 60 + parseFloat(tc[3])
    );
  }
  return null;
}

export function runEncode(opts: EncodeOptions): Promise<void> {
  const argv = [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-progress",
    "pipe:1",
    "-nostats",
    "-n",
    "-i",
    opts.inPath,
    ...opts.args,
    "-movflags",
    "+faststart",
    opts.outPath,
  ];

  return new Promise<void>((resolve, reject) => {
    if (opts.signal.aborted) {
      const err = new Error("cancelled");
      err.name = "AbortError";
      reject(err);
      return;
    }

    const child = spawn(opts.ffmpegPath, argv, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderrRing = "";
    let stdoutBuf = "";
    let lastPct = -1;
    let lastTick = 0;
    let indeterminateSent = false;

    const onAbort = () => child.kill("SIGKILL");
    opts.signal.addEventListener("abort", onAbort, { once: true });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrRing = (stderrRing + chunk.toString()).slice(-STDERR_RING_MAX);
    });

    child.stdout.on("data", (chunk: Buffer) => {
      if (opts.durationSec === null) {
        if (!indeterminateSent) {
          indeterminateSent = true;
          opts.onProgress(null);
        }
        return;
      }
      stdoutBuf += chunk.toString();
      const lines = stdoutBuf.split("\n");
      stdoutBuf = lines.pop() ?? "";
      for (const line of lines) {
        const sec = parseOutTimeSec(line);
        if (sec === null) continue;
        const pct = Math.min(100, (sec / opts.durationSec) * 100);
        const now = Date.now();
        if (pct - lastPct >= 1 || now - lastTick >= 250) {
          lastPct = pct;
          lastTick = now;
          opts.onProgress(pct);
        }
      }
    });

    child.on("error", (e) => {
      opts.signal.removeEventListener("abort", onAbort);
      reject(new EncodeError(e.message, stderrRing, null));
    });

    child.on("close", (code) => {
      opts.signal.removeEventListener("abort", onAbort);
      if (opts.signal.aborted) {
        const err = new Error("cancelled");
        err.name = "AbortError";
        reject(err);
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      const firstLine =
        stderrRing.trim().split("\n")[0] || `ffmpeg exited with code ${code}`;
      reject(new EncodeError(firstLine, stderrRing, code));
    });
  });
}
