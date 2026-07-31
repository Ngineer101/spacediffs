import { useEffect, useMemo } from "react";
import { sfx } from "../lib/sound";
import type { Hunk, PRData } from "../lib/types";

export function BriefingScreen({
  pr,
  hunks,
  unscannable,
  onStart,
}: {
  pr: PRData;
  hunks: Hunk[];
  unscannable: number;
  onStart: () => void;
}) {
  const sectors = useMemo(() => {
    const byFile = new Map<string, { hunks: number; add: number; del: number }>();
    for (const hunk of hunks) {
      const entry = byFile.get(hunk.file) ?? { hunks: 0, add: 0, del: 0 };
      entry.hunks++;
      entry.add += hunk.additions;
      entry.del += hunk.deletions;
      byFile.set(hunk.file, entry);
    }
    return [...byFile.entries()];
  }, [hunks]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        sfx.uiSelect();
        onStart();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStart]);

  return (
    <div className="screen briefing-screen">
      <h2 className="screen-heading amber">★ MISSION BRIEFING ★</h2>

      <div className="panel briefing-panel">
        <p className="briefing-title">{pr.title}</p>
        <p className="term briefing-meta">
          {pr.owner}/{pr.repo} · PR #{pr.number} · CMDR {pr.author.toUpperCase()} · {pr.headRef} →{" "}
          {pr.baseRef}
        </p>
        {pr.body && (
          <p className="term briefing-body">
            {pr.body.slice(0, 280)}
            {pr.body.length > 280 ? "…" : ""}
          </p>
        )}
        <div className="briefing-stats term">
          <span className="stat-add">+{pr.additions}</span>
          <span className="stat-del">-{pr.deletions}</span>
          <span>{pr.changedFiles} FILES</span>
          <span>{hunks.length} WAVES INBOUND</span>
        </div>
      </div>

      <div className="panel sector-panel">
        <p className="panel-label">HOSTILE SECTORS</p>
        <ul className="sector-list term">
          {sectors.map(([file, info]) => (
            <li key={file}>
              <span className="sector-file">{file}</span>
              <span className="sector-info">
                {info.hunks}W <span className="stat-add">+{info.add}</span>{" "}
                <span className="stat-del">-{info.del}</span>
              </span>
            </li>
          ))}
        </ul>
        {unscannable > 0 && (
          <p className="term footnote">
            {unscannable} FILE{unscannable > 1 ? "S" : ""} UNSCANNABLE (BINARY / TOO LARGE) —
            EXCLUDED FROM COMBAT
          </p>
        )}
        {pr.truncated && (
          <p className="term footnote">WARNING: PR EXCEEDS 300 FILES — SHOWING FIRST 300</p>
        )}
      </div>

      <button
        className="btn btn-large"
        onClick={() => {
          sfx.uiSelect();
          onStart();
        }}
      >
        ▸ START MISSION [ENTER]
      </button>
    </div>
  );
}
