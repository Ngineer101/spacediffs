import { useEffect, useMemo, useRef, useState } from "react";
import { PixelIcon } from "../components/PixelIcon";
import { sfx } from "../lib/sound";
import type { Hunk, Review, Verdict } from "../lib/types";

const THREAT_LEVELS: Array<[number, string, string]> = [
  [6, "LOW", "#7fd694"],
  [15, "MODERATE", "#33ff66"],
  [25, "HIGH", "#ffb000"],
  [Infinity, "CRITICAL", "#ff4466"],
];

export function ReviewScreen({
  hunk,
  hunkIndex,
  totalHunks,
  score,
  lives,
  multiplier,
  onSubmit,
}: {
  hunk: Hunk;
  hunkIndex: number;
  totalHunks: number;
  score: number;
  lives: number;
  multiplier: number;
  onSubmit: (review: Review) => void;
}) {
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [comment, setComment] = useState("");
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const diffRef = useRef<HTMLDivElement>(null);

  const changed = hunk.additions + hunk.deletions;
  const threat = THREAT_LEVELS.find(([max]) => changed < max)!;

  useEffect(() => {
    setVerdict(null);
    setComment("");
    diffRef.current?.scrollTo(0, 0);
  }, [hunk.id]);

  useEffect(() => {
    if (verdict === "flag") commentRef.current?.focus();
  }, [verdict]);

  const launch = () => {
    if (!verdict) return;
    sfx.uiSelect();
    onSubmit({ verdict, comment: verdict === "flag" ? comment : "" });
  };

  const pick = (v: Verdict) => {
    setVerdict(v);
    if (v === "approve") sfx.approveStamp();
    else sfx.flagStamp();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement;
      if (typing && !(e.key === "Enter" && (e.ctrlKey || e.metaKey))) return;
      if (e.key === "a" || e.key === "A") pick("approve");
      else if (e.key === "f" || e.key === "F") pick("flag");
      else if (e.key === "Enter") launch();
      else return;
      // Stop the shortcut keystroke from also typing into the comment box
      // the moment it receives focus.
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verdict, comment, hunk.id]);

  const manifest = useMemo(
    () => [
      { kind: "squid" as const, count: hunk.additions, label: "SQUIDS (+)" },
      { kind: "crab" as const, count: hunk.deletions, label: "CRABS (-)" },
    ],
    [hunk],
  );

  return (
    <div className="screen review-screen">
      <header className="hud-bar term">
        <span>SCORE {score.toLocaleString()}</span>
        <span className="amber">×{multiplier.toFixed(2)}</span>
        <span className="hud-title">REVIEW CONSOLE</span>
        <span>
          WAVE {hunkIndex + 1}/{totalHunks}
        </span>
        <span className="lives-chip">
          {Array.from({ length: Math.max(lives, 0) }, (_, i) => (
            <PixelIcon key={i} kind="player" scale={1} />
          ))}
        </span>
      </header>

      <div className="review-columns">
        <section className="panel diff-panel">
          <div className="diff-header term">
            <span className="sector-file">
              ▤ {hunk.file}
              {hunk.hunksInFile > 1 && ` [${hunk.indexInFile + 1}/${hunk.hunksInFile}]`}
            </span>
            <span>
              <span className="stat-add">+{hunk.additions}</span>{" "}
              <span className="stat-del">-{hunk.deletions}</span>
            </span>
          </div>
          <div className="diff-scroll term" ref={diffRef}>
            <div className="diff-line diff-hunk-header">{hunk.header}</div>
            {hunk.lines.map((line, i) => (
              <div key={i} className={`diff-line diff-${line.type}`}>
                <span className="diff-lineno">{line.oldLine ?? ""}</span>
                <span className="diff-lineno">{line.newLine ?? ""}</span>
                <span className="diff-marker">
                  {line.type === "add" ? "+" : line.type === "del" ? "-" : " "}
                </span>
                <span className="diff-text">{line.text || " "}</span>
              </div>
            ))}
          </div>
        </section>

        <aside className="tactical-column">
          <div className="panel tactical-panel">
            <p className="panel-label">THREAT ASSESSMENT</p>
            <p className="threat-level term" style={{ color: threat[2] }}>
              ▲ {threat[1]}
            </p>
            <ul className="manifest term">
              {manifest.map(({ kind, count, label }) => (
                <li key={kind}>
                  <PixelIcon kind={kind} scale={2} />
                  <span>
                    {count} × {label}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="panel verdict-panel">
            <p className="panel-label">VERDICT</p>
            <div className="verdict-buttons">
              <button
                className={`btn btn-approve ${verdict === "approve" ? "selected" : ""}`}
                onClick={() => pick("approve")}
              >
                [A] LOOKS GOOD
              </button>
              <button
                className={`btn btn-flag ${verdict === "flag" ? "selected" : ""}`}
                onClick={() => pick("flag")}
              >
                [F] FLAG IT
              </button>
            </div>
            {verdict === "flag" && (
              <textarea
                ref={commentRef}
                className="comment-box term"
                placeholder="LOG THE ISSUE... (what's wrong here?)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
              />
            )}
            {verdict === "flag" && (
              <p className="footnote term amber">
                ⚠ FLAGGING SPAWNS A 300PT BUG + GRANTS SPREAD CANNON
              </p>
            )}
            <button className="btn btn-large" disabled={!verdict} onClick={launch}>
              ▸ LAUNCH WAVE {verdict === "flag" ? "[CTRL+ENTER]" : "[ENTER]"}
            </button>
          </div>

          <p className="footnote term">READ THE DIFF. JUDGE IT. THEN BLAST IT OUT OF THE SKY.</p>
        </aside>
      </div>
    </div>
  );
}
