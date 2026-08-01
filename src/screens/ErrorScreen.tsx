import { useCallback, useEffect, useMemo, useState } from "react";
import { PixelIcon } from "../components/PixelIcon";
import { buildErrorWave, type ErrorKind } from "../lib/errorMission";
import { sfx } from "../lib/sound";
import { WaveScreen, type WaveOutcome } from "./WaveScreen";

const VOID_HISCORE_KEY = "spacediffs_void_hiscore";

const COPY: Record<
  ErrorKind,
  { presents: string; title: string; sub: (detail: string | null) => string; engage: string }
> = {
  "404": {
    presents: "SPACEDIFFS.COM ANOMALY REPORT",
    title: "SECTOR NOT FOUND",
    sub: (detail) =>
      detail
        ? `NAVCOM QUERY "${detail}" RETURNED VACUUM`
        : "THE PAGE YOU SEEK HAS DRIFTED INTO DEEP SPACE",
    engage: "▸ ENGAGE THE VOID [ENTER]",
  },
  "500": {
    presents: "SPACEDIFFS.COM INCIDENT REPORT",
    title: "CORE MELTDOWN",
    sub: (detail) =>
      detail ? `LAST TRANSMISSION: ${detail}` : "AN UNHANDLED EXCEPTION BREACHED THE HULL",
    engage: "▸ FIGHT THE MELTDOWN [ENTER]",
  },
};

/**
 * 404 / 500 page: an unsanctioned combat zone. Endless randomized waves via
 * buildErrorWave + the regular WaveScreen; scores stay local (void record)
 * and are never transmitted to the leaderboard.
 */
export function ErrorScreen({
  kind,
  detail,
  onHome,
  onBattleChange,
}: {
  kind: ErrorKind;
  detail: string | null;
  onHome: () => void;
  onBattleChange?: (battle: boolean) => void;
}) {
  const [mode, setMode] = useState<"intro" | "battle">("intro");
  const [waveIndex, setWaveIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [multiplier, setMultiplier] = useState(1);
  const [lastRun, setLastRun] = useState<number | null>(null);
  const [voidRecord, setVoidRecord] = useState(
    () => Number(localStorage.getItem(VOID_HISCORE_KEY)) || 0,
  );
  const copy = COPY[kind];

  useEffect(() => {
    onBattleChange?.(mode === "battle");
  }, [mode, onBattleChange]);

  const engage = useCallback(() => {
    sfx.uiSelect();
    setScore(0);
    setLives(3);
    setMultiplier(1);
    setWaveIndex(0);
    setLastRun(null);
    setMode("battle");
  }, []);

  useEffect(() => {
    if (mode !== "intro") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") engage();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, engage]);

  const wave = useMemo(
    () => (mode === "battle" ? buildErrorWave(kind, waveIndex) : null),
    [mode, kind, waveIndex],
  );

  const handleOutcome = useCallback(
    (outcome: WaveOutcome) => {
      const { result, continuesUsed, aborted, skipped } = outcome;
      const newScore = Math.max(score + result.scoreDelta - continuesUsed * 500, 0);
      setScore(newScore);
      setLives(continuesUsed > 0 ? result.livesLeft || 3 : Math.max(result.livesLeft, 1));
      setMultiplier((prev) =>
        result.cleared && result.deaths === 0 && !skipped ? Math.min(prev + 0.25, 3) : 1,
      );
      if (aborted) {
        setLastRun(newScore);
        if (newScore > voidRecord) {
          setVoidRecord(newScore);
          localStorage.setItem(VOID_HISCORE_KEY, String(newScore));
        }
        setMode("intro");
        return;
      }
      setWaveIndex((i) => i + 1);
    },
    [score, voidRecord],
  );

  if (mode === "battle" && wave) {
    return (
      <WaveScreen
        key={wave.hunkId}
        wave={wave}
        entryScore={score}
        entryLives={lives}
        multiplier={multiplier}
        retreatLabel="ABANDON ANOMALY [ESC]"
        onOutcome={handleOutcome}
      />
    );
  }

  return (
    <div className={`screen error-screen error-${kind}`}>
      <p className="presents term">{copy.presents}</p>
      <h1 className="error-code" data-text={kind}>
        {kind}
      </h1>
      <p className="error-title">{copy.title}</p>
      <p className="term error-sub">{copy.sub(detail)}</p>

      <div className="invader-parade" aria-hidden="true">
        {kind === "404" ? (
          <>
            <PixelIcon kind="octopus" scale={2} />
            <PixelIcon kind="squid" scale={2} />
            <PixelIcon kind="ufo" scale={2} />
            <PixelIcon kind="squid" scale={2} />
            <PixelIcon kind="octopus" scale={2} />
          </>
        ) : (
          <>
            <PixelIcon kind="crab" scale={2} />
            <PixelIcon kind="bug" scale={2} />
            <PixelIcon kind="bug" scale={2} />
            <PixelIcon kind="bug" scale={2} />
            <PixelIcon kind="crab" scale={2} />
          </>
        )}
      </div>

      <div className="panel error-panel">
        <p className="panel-label">UNSANCTIONED COMBAT ZONE</p>
        <div className="term error-protocol">
          <p>▸ ANOMALY WAVES ARE RANDOM AND ENDLESS</p>
          <p>▸ SCORES ARE NOT TRANSMITTED TO GALACTIC RANKINGS</p>
          <p>▸ FIGHT FOR THE FUN OF IT — RETREAT WITH [ESC]</p>
        </div>
      </div>

      {lastRun !== null && (
        <p className="term error-lastrun amber">
          ★ SORTIE COMPLETE — {lastRun.toLocaleString()} PTS (VAPORIZED WITH HONOR) ★
        </p>
      )}
      {voidRecord > 0 && (
        <p className="term void-record">VOID RECORD {voidRecord.toLocaleString()}</p>
      )}

      <div className="error-actions">
        <button className="btn btn-large" onClick={engage}>
          {copy.engage}
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => {
            sfx.uiMove();
            onHome();
          }}
        >
          RETURN TO BASE
        </button>
      </div>

      <p className="footnote term">
        {kind === "404"
          ? "LOST PAGES MAKE EXCELLENT TARGET PRACTICE · © 1978-2026"
          : "OUR ENGINEERS HAVE BEEN NOTIFIED. PROBABLY. · © 1978-2026"}
      </p>
    </div>
  );
}
