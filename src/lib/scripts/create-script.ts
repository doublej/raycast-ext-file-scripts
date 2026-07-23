import { execFile } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { promisify } from "node:util";
import { prefs } from "../prefs";
import type { RunResult, ScriptDef } from "../registry";

const execFileP = promisify(execFile);

// Ghostty 1.3+ AppleScript dictionary — the only sanctioned automation channel
// on macOS (never invoke the ghostty binary; it boots a second app instance).
// The prompt goes through a file + $(cat …) so no prompt text is inlined here.
const OPEN_TAB_SCRIPT = `
on run argv
  set repoPath to item 1 of argv
  set promptFile to item 2 of argv
  tell application "Ghostty"
    activate
    set cfg to new surface configuration
    set initial working directory of cfg to repoPath
    set initial input of cfg to "cld \\"$(cat " & quoted form of promptFile & ")\\"" & linefeed
    if (count of windows) is 0 then
      new window with configuration cfg
    else
      new tab in window 1 with configuration cfg
    end if
  end tell
end run
`;

function buildPrompt(ext: string, exampleName: string): string {
  return [
    `I ran "Create New Script" in the file-scripts Raycast extension on a ${ext} file (example: ${exampleName}). There is no suitable script for this file type yet - I want to add one.`,
    ``,
    `Your task: interview me first, then implement.`,
    ``,
    `1. Ask me what the script should do with ${ext} files: which tool, which variants/presets, output naming (suffix), and which selection kinds apply (single / multiple / folder). Keep it to a few pointed questions.`,
    `2. Read CLAUDE.md (section "Adding a script family") before coding.`,
    `3. Implement it as a new script family: one file in src/lib/scripts/ exporting ScriptDef[], spread into ALL_SCRIPTS in src/lib/registry.ts. Follow src/lib/scripts/ffmpeg-presets.ts as the pattern. Outputs must be new sibling files - never overwrite originals.`,
    `4. Run bun run lint and bun run build, then commit.`,
  ].join("\n");
}

export function createScriptScripts(): ScriptDef[] {
  return [
    {
      id: "create-script",
      family: "Meta",
      title: "Create New Script…",
      subtitle:
        "open cld in a Ghostty tab to scaffold a script for this file type",
      matcher: {
        extensions: ["*"],
        kinds: ["single", "multiple", "folder"],
      },
      runOnce: true,
      async run(file): Promise<RunResult> {
        const p = prefs();
        const ext = extname(file).toLowerCase() || "(no extension)";
        const promptPath = join(
          tmpdir(),
          `file-scripts-new-script-${Date.now()}.md`,
        );
        writeFileSync(promptPath, buildPrompt(ext, basename(file)), "utf8");
        await execFileP(
          "osascript",
          ["-e", OPEN_TAB_SCRIPT, p.repoPath, promptPath],
          { timeout: 15_000 },
        );
        return {};
      },
    },
  ];
}
