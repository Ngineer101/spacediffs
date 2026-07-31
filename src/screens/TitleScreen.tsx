import { useEffect, useState } from "react";
import { PixelIcon } from "../components/PixelIcon";
import { fetchLeaderboard, type LeaderboardEntry } from "../lib/leaderboard";
import { sfx } from "../lib/sound";
import type { GitHubUser } from "../lib/types";

export function TitleScreen({
  user,
  hiScore,
  error,
  busy,
  transmitNote,
  onLaunch,
  onDemo,
  onLogout,
  onLeaderboard,
}: {
  user: GitHubUser | null;
  hiScore: number;
  error: string | null;
  busy: boolean;
  transmitNote: string | null;
  onLaunch: (input: string) => void;
  onDemo: () => void;
  onLogout: () => void;
  onLeaderboard: () => void;
}) {
  const [input, setInput] = useState("");
  const [authNote, setAuthNote] = useState<string | null>(null);
  const [top, setTop] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    fetchLeaderboard(10)
      .then(setTop)
      .catch(() => setTop([]));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("auth_error");
    if (authError) {
      setAuthNote(
        authError === "not_configured"
          ? "OAuth is not configured on this deployment — public PRs still work without signing in."
          : `GitHub sign-in failed (${authError}).`,
      );
      window.history.replaceState(null, "", "/");
    }
  }, []);

  const submit = () => {
    if (!input.trim() || busy) return;
    sfx.uiSelect();
    onLaunch(input);
  };

  return (
    <div className="screen title-screen">
      <header className="title-auth">
        {user ? (
          <div className="auth-chip">
            <img src={user.avatarUrl} alt="" className="auth-avatar" />
            <span className="term">PILOT: {user.login.toUpperCase()}</span>
            {!user.privateAccess && (
              <a
                className="link-btn term"
                href="/api/auth/login?scope=repo"
                onClick={() => sfx.uiSelect()}
                title="Re-authorize with access to private repositories"
              >
                [+ PRIVATE REPOS]
              </a>
            )}
            <button
              className="link-btn term"
              onClick={() => {
                sfx.uiMove();
                onLogout();
              }}
            >
              [EJECT]
            </button>
          </div>
        ) : (
          <div className="auth-chip auth-signin">
            <a className="btn btn-ghost" href="/api/auth/login" onClick={() => sfx.uiSelect()}>
              ▸ SIGN IN WITH GITHUB
            </a>
            <a
              className="link-btn term"
              href="/api/auth/login?scope=repo"
              onClick={() => sfx.uiSelect()}
              title="Grants the 'repo' scope so private PRs can be reviewed"
            >
              [ NEED PRIVATE REPOS? ]
            </a>
          </div>
        )}
      </header>

      <p className="presents term">SPACEDIFFS.COM PRESENTS</p>
      <h1 className="logo">
        <span className="logo-space">SPACE</span>
        <span className="logo-diffs">DIFFS</span>
      </h1>
      <div className="invader-parade" aria-hidden="true">
        <PixelIcon kind="crab" scale={2} />
        <PixelIcon kind="squid" scale={2} />
        <PixelIcon kind="octopus" scale={2} />
        <PixelIcon kind="squid" scale={2} />
        <PixelIcon kind="crab" scale={2} />
      </div>

      <table className="score-table term">
        <tbody>
          <tr>
            <td>
              <PixelIcon kind="squid" scale={2} />
            </td>
            <td>ADDED LINE</td>
            <td>= 30 PTS</td>
          </tr>
          <tr>
            <td>
              <PixelIcon kind="crab" scale={2} />
            </td>
            <td>DELETED LINE</td>
            <td>= 20 PTS</td>
          </tr>
          <tr>
            <td>
              <PixelIcon kind="bug" scale={2} />
            </td>
            <td>FLAGGED BUG</td>
            <td>= 300 PTS</td>
          </tr>
          <tr>
            <td>
              <PixelIcon kind="ufo" scale={2} />
            </td>
            <td>MERGE CONFLICT</td>
            <td>= ??? PTS</td>
          </tr>
        </tbody>
      </table>

      <div className="pr-input-row">
        <span className="prompt-char term">&gt;</span>
        <input
          className="pr-input term"
          type="text"
          placeholder="PASTE GITHUB PR URL"
          spellCheck={false}
          value={input}
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        <button className="btn" onClick={submit} disabled={busy || !input.trim()}>
          {busy ? "SCANNING..." : "ENGAGE"}
        </button>
      </div>

      {error && <p className="error-text term">✖ {error}</p>}
      {authNote && <p className="error-text term">✖ {authNote}</p>}

      <button
        className="link-btn term demo-link"
        onClick={() => {
          sfx.uiSelect();
          onDemo();
        }}
        disabled={busy}
      >
        [ NO PR HANDY? RUN TRAINING MISSION ]
      </button>

      {transmitNote && <p className="term transmit-note amber">★ {transmitNote} ★</p>}

      {top.length > 0 && (
        <div className="panel title-board">
          <p className="panel-label">GALACTIC RANKINGS — TOP {top.length}</p>
          <ol className="title-board-list term">
            {top.map((entry) => (
              <li key={entry.login} className={entry.rank === 1 ? "rank-gold" : ""}>
                <span className="title-board-rank">#{entry.rank}</span>
                <span className="title-board-pilot">{entry.login.toUpperCase()}</span>
                <span className="title-board-score">{entry.score.toLocaleString()}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <button
        className="link-btn term"
        onClick={() => {
          sfx.uiSelect();
          onLeaderboard();
        }}
      >
        [ VIEW FULL RANKINGS ]
      </button>

      <p className="hi-score term">HI-SCORE {hiScore.toLocaleString()}</p>
      <p className="blink insert-coin">INSERT PR TO START</p>
      <p className="footnote term">
        REVIEW THE DIFF · FLAG THE BUGS · SHOOT THE CHANGES · © 1978-2026
      </p>
    </div>
  );
}
