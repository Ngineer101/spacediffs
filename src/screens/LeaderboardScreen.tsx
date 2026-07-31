import { useEffect, useState } from "react";
import { fetchLeaderboard, type LeaderboardEntry } from "../lib/leaderboard";
import { sfx } from "../lib/sound";
import type { GitHubUser } from "../lib/types";

const RANK_CLASS: Record<number, string> = { 1: "rank-gold", 2: "rank-silver", 3: "rank-bronze" };

export function LeaderboardScreen({
  user,
  onBack,
}: {
  user: GitHubUser | null;
  onBack: () => void;
}) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLeaderboard(100)
      .then(setEntries)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Unavailable."));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  return (
    <div className="screen leaderboard-screen">
      <h2 className="screen-heading amber">★ GALACTIC RANKINGS ★</h2>

      <div className="panel board-panel">
        {error && <p className="error-text term">✖ {error}</p>}
        {!entries && !error && (
          <p className="term blink board-loading">RECEIVING TRANSMISSION...</p>
        )}
        {entries && entries.length === 0 && (
          <p className="term board-loading">NO PILOTS RANKED YET — BE THE FIRST.</p>
        )}
        {entries && entries.length > 0 && (
          <table className="board-table term">
            <thead>
              <tr>
                <th>RANK</th>
                <th>PILOT</th>
                <th className="board-right">SCORE</th>
                <th className="board-right">ACC</th>
                <th className="board-hide-sm">LAST MISSION</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.login}
                  className={`${RANK_CLASS[entry.rank] ?? ""} ${
                    user?.login === entry.login ? "board-you" : ""
                  }`}
                >
                  <td>#{entry.rank}</td>
                  <td>
                    <img src={entry.avatarUrl} alt="" className="board-avatar" />
                    {entry.login.toUpperCase()}
                    {user?.login === entry.login && <span className="amber"> ◄ YOU</span>}
                  </td>
                  <td className="board-right">{entry.score.toLocaleString()}</td>
                  <td className="board-right">{entry.accuracy}%</td>
                  <td className="board-hide-sm board-mission">
                    <a
                      href={`/${entry.prOwner}/${entry.prRepo}/pull/${entry.prNumber}`}
                      onClick={() => sfx.uiSelect()}
                    >
                      {entry.prOwner}/{entry.prRepo}#{entry.prNumber}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <button
        className="btn btn-large"
        onClick={() => {
          sfx.uiSelect();
          onBack();
        }}
      >
        ◄ BACK TO BASE [ESC]
      </button>
    </div>
  );
}
