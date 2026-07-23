import { Clipboard } from "@raycast/api";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const execFileP = promisify(execFile);

export type SelectionKind = "single" | "multiple" | "folder";
export type SelectionSource = "finder" | "clipboard" | "none";

export interface Selection {
  kind: SelectionKind;
  /** Files after folder expansion (folders expanded one level, files only). */
  targets: string[];
  source: SelectionSource;
  finderError?: string;
  clipboardError?: string;
}

function expandHome(p: string): string {
  return p.replace(/^~(?=\/|$)/, homedir());
}

function decodeFileUrl(p: string): string {
  if (!p.startsWith("file://")) return p;
  try {
    return decodeURI(p.replace(/^file:\/\/(localhost)?/, ""));
  } catch {
    return p;
  }
}

function normalizePath(raw: string): string {
  const unquoted = raw.trim().replace(/^["']|["']$/g, "");
  return expandHome(decodeFileUrl(unquoted));
}

type PathKind = "file" | "dir" | null;

function pathKind(p: string): PathKind {
  if (!p || !p.startsWith("/")) return null;
  try {
    const st = statSync(p);
    if (st.isFile()) return "file";
    if (st.isDirectory()) return "dir";
    return null;
  } catch {
    return null;
  }
}

function directChildFiles(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((name) => !name.startsWith("."))
      .map((name) => join(dir, name))
      .filter((p) => pathKind(p) === "file")
      .sort();
  } catch {
    return [];
  }
}

const FINDER_SCRIPT = `
tell application "Finder"
  set _sel to selection
  set _out to {}
  repeat with _i in _sel
    try
      set end of _out to POSIX path of (_i as alias)
    end try
  end repeat
end tell
set AppleScript's text item delimiters to linefeed
return _out as text
`;

export function isAutomationError(msg: string | undefined): boolean {
  if (!msg) return false;
  return /not authorized|-1743|not allowed/i.test(msg);
}

async function getFinderSelection(): Promise<{
  paths: string[];
  error?: string;
}> {
  try {
    const { stdout } = await execFileP("osascript", ["-e", FINDER_SCRIPT], {
      timeout: 3_000,
    });
    const paths = stdout
      .split("\n")
      .map(normalizePath)
      .filter((p) => pathKind(p) !== null);
    return { paths };
  } catch (e: unknown) {
    const err = e as { stderr?: string; message?: string };
    const msg = (err.stderr || err.message || "osascript failed")
      .trim()
      .split("\n")[0];
    return { paths: [], error: msg };
  }
}

async function getClipboardPaths(): Promise<{
  paths: string[];
  error?: string;
}> {
  try {
    const text = (await Clipboard.readText()) || "";
    if (!text) return { paths: [] };
    const lines = text.split(/\r?\n/).map(normalizePath).filter(Boolean);
    const paths = lines.filter((p) => pathKind(p) !== null);
    if (lines.length > 0 && paths.length === 0) {
      return {
        paths: [],
        error: `Clipboard had ${lines.length} line(s), none resolved to existing paths`,
      };
    }
    return { paths };
  } catch (e: unknown) {
    const err = e as { message?: string };
    return { paths: [], error: err.message || "clipboard read failed" };
  }
}

/**
 * 1 dir → "folder" (targets = its direct child files);
 * 1 file → "single"; else "multiple" (dirs expanded one level).
 */
function classify(paths: string[]): Pick<Selection, "kind" | "targets"> {
  const unique = [...new Set(paths)];
  if (unique.length === 1 && pathKind(unique[0]) === "dir") {
    return { kind: "folder", targets: directChildFiles(unique[0]) };
  }
  if (unique.length === 1) {
    return { kind: "single", targets: unique };
  }
  const targets = unique.flatMap((p) =>
    pathKind(p) === "dir" ? directChildFiles(p) : [p],
  );
  return { kind: "multiple", targets: [...new Set(targets)] };
}

/** Finder selection first, clipboard paths as fallback. */
export async function resolveSelection(): Promise<Selection> {
  const finder = await getFinderSelection();
  if (finder.paths.length > 0) {
    return { ...classify(finder.paths), source: "finder" };
  }
  const clip = await getClipboardPaths();
  if (clip.paths.length > 0) {
    return {
      ...classify(clip.paths),
      source: "clipboard",
      finderError: finder.error,
    };
  }
  return {
    kind: "single",
    targets: [],
    source: "none",
    finderError: finder.error,
    clipboardError: clip.error,
  };
}
