import { getPreferenceValues } from "@raycast/api";
import { homedir } from "node:os";

export interface Prefs {
  extraPath: string;
}

function expand(p: string): string {
  return p.replace(/^\$HOME/, homedir()).replace(/^~/, homedir());
}

export function prefs(): Prefs {
  const raw = getPreferenceValues<Prefs>();
  return {
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
