import { useCallback, useEffect, useMemo, useState } from "react";
import { CRTOverlay } from "./components/CRTOverlay";
import { Starfield, type StarfieldMode } from "./components/Starfield";
import { buildWave } from "./game/waves";
import { DEMO_PR } from "./lib/demo";
import type { HunkReview } from "./lib/exportReview";
import { fetchMe, fetchPr, logout, parsePrUrl } from "./lib/github";
import { parsePr } from "./lib/parseDiff";
import { sfx } from "./lib/sound";
import {
  EMPTY_STATS,
  type GitHubUser,
  type Hunk,
  type PRData,
  type Review,
  type SessionStats,
} from "./lib/types";
import { BriefingScreen } from "./screens/BriefingScreen";
import { DebriefScreen } from "./screens/DebriefScreen";
import { ReviewScreen } from "./screens/ReviewScreen";
import { TitleScreen } from "./screens/TitleScreen";
import { WaveScreen, type WaveOutcome } from "./screens/WaveScreen";

const HISCORE_KEY = "spacediffs_hiscore";

type Phase = "title" | "loading" | "briefing" | "review" | "wave" | "debrief";

interface Mission {
  pr: PRData;
  hunks: Hunk[];
  unscannable: number;
}

export default function App() {
  const [phase, setPhase] = useState<Phase>("title");
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mission, setMission] = useState<Mission | null>(null);
  const [current, setCurrent] = useState(0);
  const [reviews, setReviews] = useState<(Review | null)[]>([]);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [multiplier, setMultiplier] = useState(1);
  const [stats, setStats] = useState<SessionStats>(EMPTY_STATS);
  const [hiScore, setHiScore] = useState(() => Number(localStorage.getItem(HISCORE_KEY)) || 0);
  const [isNewHiScore, setIsNewHiScore] = useState(false);
  const [muted, setMuted] = useState(sfx.muted);

  useEffect(() => {
    void fetchMe().then(setUser);
  }, []);

  // Arcade keyboard UX: all shortcuts are global window handlers, so drop
  // focus after any button click — otherwise Enter/Space re-triggers the
  // last-clicked button on the next screen.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest("button, a");
      if (el instanceof HTMLElement) el.blur();
    };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, []);

  const startMission = useCallback((pr: PRData) => {
    const { hunks, unscannable } = parsePr(pr.files);
    if (hunks.length === 0) {
      setError("This PR has no reviewable text diffs (binary or oversized files only).");
      setPhase("title");
      return;
    }
    setMission({ pr, hunks, unscannable });
    setReviews(new Array(hunks.length).fill(null));
    setCurrent(0);
    setScore(0);
    setLives(3);
    setMultiplier(1);
    setStats(EMPTY_STATS);
    setIsNewHiScore(false);
    setError(null);
    setPhase("briefing");
  }, []);

  const handleLaunch = useCallback(
    async (input: string) => {
      const ref = parsePrUrl(input);
      if (!ref) {
        setError("That doesn't look like a GitHub PR link (github.com/owner/repo/pull/123).");
        return;
      }
      // GitHub-style shareable URL: spacediffs.com/<owner>/<repo>/pull/<n>
      window.history.replaceState(null, "", `/${ref.owner}/${ref.repo}/pull/${ref.number}`);
      if (ref.owner === DEMO_PR.owner && ref.repo === DEMO_PR.repo) {
        startMission(DEMO_PR);
        return;
      }
      setError(null);
      setPhase("loading");
      try {
        const pr = await fetchPr(ref);
        startMission(pr);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load PR.");
        window.history.replaceState(null, "", "/");
        setPhase("title");
      }
    },
    [startMission],
  );

  // GitHub-style deep links: pasting a PR URL with github.com swapped for
  // spacediffs.com lands on /<owner>/<repo>/pull/<n> and boots the mission.
  useEffect(() => {
    if (parsePrUrl(window.location.pathname)) void handleLaunch(window.location.pathname);
  }, [handleLaunch]);

  const handleReview = useCallback(
    (review: Review) => {
      setReviews((prev) => {
        const next = [...prev];
        next[current] = review;
        return next;
      });
      setPhase("wave");
    },
    [current],
  );

  const goToDebrief = useCallback(
    (finalScore: number) => {
      const clamped = Math.max(finalScore, 0);
      if (clamped > hiScore) {
        setHiScore(clamped);
        setIsNewHiScore(true);
        localStorage.setItem(HISCORE_KEY, String(clamped));
      }
      setPhase("debrief");
    },
    [hiScore],
  );

  const handleWaveOutcome = useCallback(
    (outcome: WaveOutcome) => {
      const { result, continuesUsed, skipped, aborted } = outcome;
      const newScore = Math.max(score + result.scoreDelta - continuesUsed * 500, 0);
      setScore(newScore);
      setLives(continuesUsed > 0 ? result.livesLeft || 3 : Math.max(result.livesLeft, 1));
      setStats((prev) => ({
        shotsFired: prev.shotsFired + result.shots,
        shotsHit: prev.shotsHit + result.hits,
        wavesCleared: prev.wavesCleared + (result.cleared ? 1 : 0),
        wavesSkipped: prev.wavesSkipped + (skipped ? 1 : 0),
        deaths: prev.deaths + result.deaths,
        continuesUsed: prev.continuesUsed + continuesUsed,
        ufosKilled: prev.ufosKilled + result.ufosKilled,
      }));
      setMultiplier((prev) =>
        result.cleared && result.deaths === 0 && !skipped ? Math.min(prev + 0.25, 3) : 1,
      );

      if (aborted) {
        goToDebrief(newScore);
        return;
      }
      const next = current + 1;
      if (next >= (mission?.hunks.length ?? 0)) {
        goToDebrief(newScore);
      } else {
        setCurrent(next);
        setPhase("review");
      }
    },
    [score, current, mission, goToDebrief],
  );

  const handleRestart = useCallback(() => {
    window.history.replaceState(null, "", "/");
    setMission(null);
    setError(null);
    setPhase("title");
  }, []);

  const starfieldMode: StarfieldMode =
    phase === "loading" ? "warp" : phase === "wave" ? "battle" : "drift";

  const entries: HunkReview[] = useMemo(
    () => (mission ? mission.hunks.map((hunk, i) => ({ hunk, review: reviews[i] ?? null })) : []),
    [mission, reviews],
  );

  const currentHunk = mission?.hunks[current] ?? null;
  const currentReview = reviews[current] ?? null;
  const waveConfig = useMemo(
    () =>
      currentHunk && currentReview && mission
        ? buildWave(currentHunk, currentReview, current, mission.hunks.length)
        : null,
    [currentHunk, currentReview, current, mission],
  );

  return (
    <div className="app" onPointerDown={() => sfx.ensure()} onKeyDown={() => sfx.ensure()}>
      <Starfield mode={starfieldMode} />

      <main className="stage">
        {phase === "title" && (
          <TitleScreen
            user={user}
            hiScore={hiScore}
            error={error}
            busy={false}
            onLaunch={handleLaunch}
            onDemo={() => handleLaunch(`${DEMO_PR.owner}/${DEMO_PR.repo}/pull/${DEMO_PR.number}`)}
            onLogout={() => {
              void logout().then(() => setUser(null));
            }}
          />
        )}

        {phase === "loading" && (
          <div className="screen loading-screen">
            <p className="overlay-title blink">SCANNING PR...</p>
            <p className="term overlay-sub">ENTERING HYPERSPACE</p>
          </div>
        )}

        {phase === "briefing" && mission && (
          <BriefingScreen
            pr={mission.pr}
            hunks={mission.hunks}
            unscannable={mission.unscannable}
            onStart={() => setPhase("review")}
          />
        )}

        {phase === "review" && currentHunk && mission && (
          <ReviewScreen
            hunk={currentHunk}
            hunkIndex={current}
            totalHunks={mission.hunks.length}
            score={score}
            lives={lives}
            multiplier={multiplier}
            onSubmit={handleReview}
          />
        )}

        {phase === "wave" && waveConfig && (
          <WaveScreen
            key={waveConfig.hunkId}
            wave={waveConfig}
            entryScore={score}
            entryLives={lives}
            multiplier={multiplier}
            onOutcome={handleWaveOutcome}
          />
        )}

        {phase === "debrief" && mission && (
          <DebriefScreen
            pr={mission.pr}
            entries={entries}
            score={score}
            hiScore={hiScore}
            isNewHiScore={isNewHiScore}
            stats={stats}
            onRestart={handleRestart}
          />
        )}
      </main>

      <button
        className="mute-btn term"
        onClick={() => {
          sfx.ensure();
          setMuted(sfx.toggleMute());
        }}
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted ? "🔇" : "🔊"}
      </button>

      <CRTOverlay />
    </div>
  );
}
