import {
  Action,
  ActionPanel,
  Color,
  Detail,
  Icon,
  List,
  openExtensionPreferences,
  showToast,
  Toast,
} from "@raycast/api";
import { getProgressIcon } from "@raycast/utils";
import { existsSync } from "node:fs";
import { basename, dirname, extname } from "node:path";
import { useEffect, useRef, useState } from "react";
import { EncodeError } from "./lib/ffmpeg";
import { prefs } from "./lib/prefs";
import {
  applicableScripts,
  type ApplicableScript,
  type ScriptDef,
} from "./lib/registry";
import {
  isAutomationError,
  resolveSelection,
  type Selection,
} from "./lib/selection";

type RowStatus = "pending" | "running" | "done" | "failed" | "cancelled";

interface Row {
  path: string;
  status: RowStatus;
  pct: number | null;
  outPath?: string;
  inBytes?: number;
  outBytes?: number;
  errorDetail?: string;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function sizeDelta(inBytes: number, outBytes: number): string {
  const pct = Math.round(((outBytes - inBytes) / inBytes) * 100);
  const sign = pct > 0 ? "+" : "";
  return `${fmtBytes(inBytes)} → ${fmtBytes(outBytes)} (${sign}${pct}%)`;
}

function errDetail(e: unknown): string {
  if (e instanceof EncodeError) {
    const parts = [`message: ${e.message}`];
    if (e.exitCode !== null) parts.push(`exit code: ${e.exitCode}`);
    if (e.stderrTail) parts.push(`stderr:\n${e.stderrTail}`);
    return parts.join("\n\n");
  }
  const err = e as { message?: string };
  return err.message || String(e);
}

function selectionSummary(sel: Selection): string {
  const exts = [
    ...new Set(
      sel.targets.map((p) => extname(p).toLowerCase()).filter(Boolean),
    ),
  ];
  const files = `${sel.targets.length} file${sel.targets.length === 1 ? "" : "s"}`;
  const kind = sel.kind === "folder" ? "folder · " : "";
  return exts.length
    ? `${kind}${files} · ${exts.join(" ")}`
    : `${kind}${files}`;
}

function rowIcon(row: Row) {
  if (row.status === "done")
    return { source: Icon.CheckCircle, tintColor: Color.Green };
  if (row.status === "failed")
    return { source: Icon.XMarkCircle, tintColor: Color.Red };
  if (row.status === "cancelled")
    return { source: Icon.MinusCircle, tintColor: Color.SecondaryText };
  if (row.status === "running") {
    if (row.pct === null)
      return { source: Icon.CircleProgress, tintColor: Color.Yellow };
    return getProgressIcon(row.pct / 100);
  }
  return { source: Icon.Circle, tintColor: Color.SecondaryText };
}

function rowAccessories(row: Row): List.Item.Accessory[] {
  if (row.status === "done" && row.inBytes && row.outBytes) {
    return [{ text: sizeDelta(row.inBytes, row.outBytes) }];
  }
  if (row.status === "running") {
    return [{ text: row.pct === null ? "…" : `${Math.round(row.pct)}%` }];
  }
  if (row.status === "failed") {
    return [{ tag: { value: "failed", color: Color.Red } }];
  }
  if (row.status === "cancelled") {
    return [{ tag: { value: "cancelled", color: Color.SecondaryText } }];
  }
  return [{ tag: { value: "pending", color: Color.SecondaryText } }];
}

function updateRow(rows: Row[], index: number, patch: Partial<Row>): Row[] {
  return rows.map((r, i) => (i === index ? { ...r, ...patch } : r));
}

export default function Command() {
  const p = prefs();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [activeScript, setActiveScript] = useState<ScriptDef | null>(null);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function detect() {
    setLoading(true);
    setSelection(await resolveSelection());
    setLoading(false);
  }

  useEffect(() => {
    detect();
    return () => abortRef.current?.abort();
  }, []);

  async function startRun(app: ApplicableScript) {
    if (running) return;
    setRunning(true);
    setActiveScript(app.script);
    const ac = new AbortController();
    abortRef.current = ac;
    const files = app.matched;
    setRows(files.map((path) => ({ path, status: "pending", pct: null })));

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: `[1/${files.length}] ${basename(files[0])} · 0% · ${app.script.title}`,
      primaryAction: { title: "Cancel", onAction: () => ac.abort() },
    });

    let done = 0;
    let failed = 0;
    let cancelled = 0;
    // Sequential encodes — one ffmpeg at a time for predictable CPU/thermals.
    for (let i = 0; i < files.length; i++) {
      if (ac.signal.aborted) {
        cancelled += files.length - i;
        setRows((prev) =>
          (prev ?? []).map((r) =>
            r.status === "pending" ? { ...r, status: "cancelled" } : r,
          ),
        );
        break;
      }
      const file = files[i];
      setRows((prev) => updateRow(prev ?? [], i, { status: "running" }));
      toast.title = `[${i + 1}/${files.length}] ${basename(file)} · 0% · ${app.script.title}`;
      try {
        const res = await app.script.run(file, {
          signal: ac.signal,
          onProgress: (pct) => {
            setRows((prev) => updateRow(prev ?? [], i, { pct }));
            const pctLabel = pct === null ? "…" : `${Math.round(pct)}%`;
            toast.title = `[${i + 1}/${files.length}] ${basename(file)} · ${pctLabel} · ${app.script.title}`;
          },
        });
        done++;
        setRows((prev) =>
          updateRow(prev ?? [], i, {
            status: "done",
            pct: 100,
            outPath: res.outPath,
            inBytes: res.inBytes,
            outBytes: res.outBytes,
          }),
        );
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          cancelled++;
          setRows((prev) => updateRow(prev ?? [], i, { status: "cancelled" }));
        } else {
          failed++;
          setRows((prev) =>
            updateRow(prev ?? [], i, {
              status: "failed",
              errorDetail: errDetail(e),
            }),
          );
        }
      }
    }

    setRunning(false);
    abortRef.current = null;
    toast.primaryAction = undefined;
    if (cancelled > 0) {
      toast.style = Toast.Style.Failure;
      toast.title = `Cancelled — ${done}/${files.length} done`;
    } else if (failed > 0) {
      toast.style = Toast.Style.Failure;
      toast.title = `${done}/${files.length} done · ${failed} failed`;
    } else {
      toast.style = Toast.Style.Success;
      toast.title = `${done}/${files.length} done`;
    }
  }

  // --- health gates ---
  const missingBinary = !existsSync(p.ffmpegPath)
    ? p.ffmpegPath
    : !existsSync(p.ffprobePath)
      ? p.ffprobePath
      : null;
  if (missingBinary) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.ExclamationMark}
          title="ffmpeg not found"
          description={`No binary at ${missingBinary}\nInstall: brew install ffmpeg\nThen point the extension preferences at it.`}
          actions={
            <ActionPanel>
              <Action
                title="Open Extension Preferences"
                icon={Icon.Gear}
                onAction={openExtensionPreferences}
              />
              <Action
                title="Reload"
                icon={Icon.ArrowClockwise}
                onAction={detect}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  // --- run phase ---
  if (rows !== null && activeScript !== null) {
    const doneCount = rows.filter((r) => r.status === "done").length;
    return (
      <List
        navigationTitle={`${activeScript.title} · ${doneCount}/${rows.length}`}
      >
        {rows.map((r) => (
          <List.Item
            key={r.path}
            icon={rowIcon(r)}
            title={basename(r.path)}
            subtitle={dirname(r.path)}
            accessories={rowAccessories(r)}
            actions={
              <ActionPanel>
                {running ? (
                  <Action
                    title="Cancel"
                    icon={Icon.XMarkCircle}
                    onAction={() => abortRef.current?.abort()}
                  />
                ) : (
                  <Action
                    title="Back to Scripts"
                    icon={Icon.ArrowLeft}
                    onAction={() => {
                      setRows(null);
                      setActiveScript(null);
                    }}
                  />
                )}
                {r.outPath ? (
                  <Action.ShowInFinder
                    title="Show Output in Finder"
                    path={r.outPath}
                    shortcut={{ modifiers: ["cmd"], key: "o" }}
                  />
                ) : null}
                {r.errorDetail ? (
                  <Action.Push
                    title="Show Error Detail"
                    icon={Icon.ExclamationMark}
                    shortcut={{ modifiers: ["cmd"], key: "e" }}
                    target={
                      <ErrorDetail
                        row={r}
                        script={activeScript}
                        detail={r.errorDetail}
                      />
                    }
                  />
                ) : null}
                <Action.ShowInFinder
                  title="Show Source in Finder"
                  path={r.path}
                />
              </ActionPanel>
            }
          />
        ))}
      </List>
    );
  }

  // --- pick phase ---
  const sel = selection;
  const apps = sel ? applicableScripts(sel) : [];
  const families = new Map<string, ApplicableScript[]>();
  for (const app of apps) {
    families.set(app.script.family, [
      ...(families.get(app.script.family) ?? []),
      app,
    ]);
  }
  const automationHint = isAutomationError(sel?.finderError);

  return (
    <List
      isLoading={loading}
      navigationTitle={
        sel && sel.targets.length > 0 ? selectionSummary(sel) : "File Scripts"
      }
    >
      {!loading && (!sel || sel.source === "none") ? (
        <List.EmptyView
          icon={automationHint ? Icon.Lock : Icon.Finder}
          title={
            automationHint ? "Finder access not authorized" : "No selection"
          }
          description={
            automationHint
              ? "System Settings › Privacy & Security › Automation → enable Raycast → Finder, then reload."
              : [
                  sel?.finderError
                    ? `Finder: ${sel.finderError}`
                    : "Finder: no selection",
                  sel?.clipboardError
                    ? `Clipboard: ${sel.clipboardError}`
                    : "Clipboard: no paths",
                  "",
                  "Select files in Finder (or copy paths), then reload.",
                ].join("\n")
          }
          actions={
            <ActionPanel>
              <Action
                title="Reload"
                icon={Icon.ArrowClockwise}
                onAction={detect}
              />
            </ActionPanel>
          }
        />
      ) : !loading && sel && apps.length === 0 ? (
        <List.EmptyView
          icon={Icon.Document}
          title="No scripts match this selection"
          description={`${selectionSummary(sel)}\nScripts exist for: .mov .mp4`}
          actions={
            <ActionPanel>
              <Action
                title="Reload"
                icon={Icon.ArrowClockwise}
                onAction={detect}
              />
            </ActionPanel>
          }
        />
      ) : (
        [...families.entries()].map(([family, familyApps]) => (
          <List.Section
            key={family}
            title={family}
            subtitle={
              familyApps[0].skipped > 0
                ? `${familyApps[0].skipped} file(s) skipped (no match)`
                : undefined
            }
          >
            {familyApps.map((app) => (
              <List.Item
                key={app.script.id}
                icon={Icon.Wand}
                title={app.script.title}
                subtitle={app.script.subtitle}
                accessories={[
                  {
                    text: `${app.matched.length} file${app.matched.length === 1 ? "" : "s"}`,
                  },
                ]}
                actions={
                  <ActionPanel>
                    <Action
                      title={`Run on ${app.matched.length} File${app.matched.length === 1 ? "" : "s"}`}
                      icon={Icon.Play}
                      onAction={() => startRun(app)}
                    />
                    <Action
                      title="Reload Detection"
                      icon={Icon.ArrowClockwise}
                      shortcut={{ modifiers: ["cmd"], key: "r" }}
                      onAction={detect}
                    />
                  </ActionPanel>
                }
              />
            ))}
          </List.Section>
        ))
      )}
    </List>
  );
}

function ErrorDetail({
  row,
  script,
  detail,
}: {
  row: Row;
  script: ScriptDef;
  detail: string;
}) {
  const md = [
    `# Script failed`,
    ``,
    `**File:** \`${row.path}\``,
    `**Script:** ${script.title} (\`${script.id}\`)`,
    ``,
    `## Details`,
    ``,
    "```",
    detail,
    "```",
  ].join("\n");
  return (
    <Detail
      markdown={md}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="Copy Error" content={detail} />
          <Action.ShowInFinder title="Show Source File" path={row.path} />
        </ActionPanel>
      }
    />
  );
}
