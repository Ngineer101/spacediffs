import { useEffect, useMemo, useRef, useState } from "react";
import { buildMarkdown, hunkLocation, type HunkReview } from "../lib/exportReview";
import {
  stashPendingSubmission,
  submitScore,
  type ScoreSubmission,
  type SubmitResult,
} from "../lib/leaderboard";
import { sfx } from "../lib/sound";
import type { GitHubUser, PRData, SessionStats } from "../lib/types";

export function DebriefScreen({
  pr,
  entries,
  score,
  hiScore,
  isNewHiScore,
  stats,
  user,
  isDemo,
  submission,
  onRestart,
  onLeaderboard,
}: {
  pr: PRData;
  entries: HunkReview[];
  score: number;
  hiScore: number;
  isNewHiScore: boolean;
  stats: SessionStats;
  user: GitHubUser | null;
  isDemo: boolean;
  submission: ScoreSubmission;
  onRestart: () => void;
  onLeaderboard: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [transmit, setTransmit] = useState<
    | { state: "idle" }
    | { state: "sending" }
    | { state: "done"; result: SubmitResult }
    | { state: "error"; message: string }
  >({ state: "idle" });

  const transmitScore = async () => {
    setTransmit({ state: "sending" });
    try {
      const result = await submitScore(submission);
      sfx.powerup();
      setTransmit({ state: "done", result });
    } catch (err) {
      setTransmit({
        state: "error",
        message: err instanceof Error ? err.message : "Transmission failed.",
      });
    }
  };

  // Signed-in pilots transmit automatically — the manual button was pure
  // friction, not a security control (all abuse defenses are server-side).
  // The ref guards against StrictMode's double-mounted effects.
  const autoSent = useRef(false);
  useEffect(() => {
    if (autoSent.current || isDemo || !user || submission.score <= 0) return;
    autoSent.current = true;
    void transmitScore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const markdown = useMemo(
    () => buildMarkdown(pr, entries, score, stats),
    [pr, entries, score, stats],
  );

  const flagged = entries.filter((e) => e.review?.verdict === "flag");
  const reviewed = entries.filter((e) => e.review !== null).length;
  const accuracy = stats.shotsFired > 0 ? Math.round((stats.shotsHit / stats.shotsFired) * 100) : 0;

  const copy = async () => {
    sfx.uiSelect();
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail outside secure contexts; show the raw text.
      window.prompt("Copy your review:", markdown);
    }
  };

  return (
    <div className="screen debrief-screen">
      <h2 className="screen-heading">■ MISSION DEBRIEF ■</h2>
      {isNewHiScore && <p className="amber blink new-hiscore">★ NEW HI-SCORE ★</p>}

      <div className="debrief-stats">
        <div className="stat-cell">
          <p className="stat-value">{score.toLocaleString()}</p>
          <p className="stat-label term">FINAL SCORE</p>
        </div>
        <div className="stat-cell">
          <p className="stat-value">
            {reviewed}/{entries.length}
          </p>
          <p className="stat-label term">HUNKS REVIEWED</p>
        </div>
        <div className="stat-cell">
          <p className="stat-value">{flagged.length}</p>
          <p className="stat-label term">FLAGS RAISED</p>
        </div>
        <div className="stat-cell">
          <p className="stat-value">{accuracy}%</p>
          <p className="stat-label term">ACCURACY</p>
        </div>
        <div className="stat-cell">
          <p className="stat-value">{stats.wavesCleared}</p>
          <p className="stat-label term">WAVES CLEARED</p>
        </div>
        <div className="stat-cell">
          <p className="stat-value">{stats.deaths}</p>
          <p className="stat-label term">CANNONS LOST</p>
        </div>
      </div>

      <div className="panel transmit-panel">
        <p className="panel-label">GALACTIC RANKINGS</p>
        {isDemo ? (
          <p className="term dim">TRAINING SCORES STAY LOCAL — FLY A REAL PR TO RANK.</p>
        ) : transmit.state === "done" ? (
          <p className="term amber">
            {transmit.result.improved
              ? `★ SCORE TRANSMITTED — RANK #${transmit.result.rank} ★`
              : `PERSONAL BEST REMAINS ${transmit.result.best.toLocaleString()} (RANK #${transmit.result.rank})`}
          </p>
        ) : user ? (
          submission.score <= 0 ? (
            <p className="term dim">NO POINTS ON THE BOARD — NOTHING TO TRANSMIT.</p>
          ) : transmit.state === "error" ? (
            <div className="transmit-row">
              <button
                className="btn"
                onClick={() => {
                  sfx.uiSelect();
                  void transmitScore();
                }}
              >
                ▸ RETRY TRANSMISSION
              </button>
              <p className="error-text term">✖ {transmit.message}</p>
            </div>
          ) : (
            <p className="term blink">TRANSMITTING SCORE...</p>
          )
        ) : (
          <a
            className="btn btn-ghost"
            href="/api/auth/login"
            onClick={() => {
              sfx.uiSelect();
              stashPendingSubmission(submission);
            }}
          >
            ▸ SIGN IN WITH GITHUB TO TRANSMIT
          </a>
        )}
      </div>

      {flagged.length > 0 && (
        <div className="panel flags-panel">
          <p className="panel-label red">🚩 FLAGGED FOR HUMAN ATTENTION</p>
          <ul className="term flag-list">
            {flagged.map(({ hunk, review }) => (
              <li key={hunk.id}>
                <span className="sector-file">{hunk.file}</span>{" "}
                <span className="dim">({hunkLocation(hunk)})</span>
                {review?.comment.trim() && (
                  <p className="flag-comment">▸ {review.comment.trim()}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="panel markdown-panel">
        <div className="markdown-header">
          <p className="panel-label">TRANSMISSION (MARKDOWN)</p>
          <button className="btn" onClick={copy}>
            {copied ? "✔ COPIED" : "COPY REVIEW"}
          </button>
        </div>
        <pre className="markdown-preview term">{markdown}</pre>
      </div>

      <div className="debrief-actions">
        <button
          className="btn btn-ghost"
          onClick={() => {
            sfx.uiSelect();
            onLeaderboard();
          }}
        >
          VIEW RANKINGS
        </button>
        <a
          className="btn btn-ghost"
          href={pr.htmlUrl}
          target="_blank"
          rel="noreferrer"
          onClick={() => sfx.uiSelect()}
        >
          OPEN PR ON GITHUB ↗
        </a>
        <button
          className="btn btn-large"
          onClick={() => {
            sfx.uiSelect();
            onRestart();
          }}
        >
          ▸ NEW MISSION
        </button>
      </div>
      <p className="hi-score term">HI-SCORE {hiScore.toLocaleString()}</p>
    </div>
  );
}
