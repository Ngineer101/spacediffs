import { useCallback, useEffect, useRef, useState } from "react";
import { PixelIcon } from "../components/PixelIcon";
import { GameEngine, type WaveResult } from "../game/engine";
import type { WaveConfig } from "../game/waves";
import { sfx } from "../lib/sound";

const CONTINUE_COST = 500;

export interface WaveOutcome {
  result: WaveResult;
  continuesUsed: number;
  skipped: boolean;
  /** True when the player retreated to the debrief instead of continuing. */
  aborted: boolean;
}

type Overlay = "ready" | "cleared" | "gameover" | null;

export function WaveScreen({
  wave,
  entryScore,
  entryLives,
  multiplier,
  retreatLabel = "RETREAT TO DEBRIEF [ESC]",
  onOutcome,
}: {
  wave: WaveConfig;
  entryScore: number;
  entryLives: number;
  multiplier: number;
  retreatLabel?: string;
  onOutcome: (outcome: WaveOutcome) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [overlay, setOverlay] = useState<Overlay>("ready");
  const [delta, setDelta] = useState(0);
  const [lives, setLives] = useState(entryLives);
  const [ticker, setTicker] = useState("SYSTEMS ONLINE. DEFEND THE CODEBASE.");
  const [continues, setContinues] = useState(0);
  const [engineKey, setEngineKey] = useState(0);
  const resultRef = useRef<WaveResult | null>(null);
  const overlayRef = useRef<Overlay>("ready");
  overlayRef.current = overlay;
  const continuesRef = useRef(0);
  continuesRef.current = continues;

  const finish = useCallback(
    (outcome: WaveOutcome) => {
      engineRef.current?.destroy();
      engineRef.current = null;
      sfx.ufoStop();
      onOutcome(outcome);
    },
    [onOutcome],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const startingLives = engineKey === 0 ? entryLives : 3;
    setLives(startingLives);
    setOverlay("ready");
    setDelta(0);

    const engine = new GameEngine(canvas, { wave, lives: startingLives, multiplier }, (event) => {
      switch (event.type) {
        case "march":
          sfx.march(event.step);
          break;
        case "shoot":
          sfx.shoot();
          break;
        case "invaderKilled":
          sfx.invaderKilled();
          setTicker(`ELIMINATED +${event.points} ▸ ${event.spec.lineText}`);
          break;
        case "eliteHit":
          sfx.eliteHit();
          setTicker("DIRECT HIT ON PRIORITY TARGET!");
          break;
        case "eliteKilled":
          sfx.eliteKilled();
          setTicker(`🐛 BUG SQUASHED +${event.points} ▸ ${event.spec.lineText}`);
          break;
        case "ufoStart":
          sfx.ufoStart();
          setTicker("⚠ MERGE CONFLICT DETECTED IN UPPER ORBIT");
          break;
        case "ufoGone":
          sfx.ufoStop();
          break;
        case "ufoKilled":
          sfx.ufoKilled();
          setTicker(`MERGE CONFLICT RESOLVED +${event.points}`);
          break;
        case "playerHit":
          sfx.playerExplode();
          setLives(event.livesLeft);
          setTicker("CANNON DESTROYED! REBOOTING...");
          break;
        case "score":
          setDelta(event.total);
          break;
        case "waveClear":
          resultRef.current = event.result;
          setDelta(event.result.scoreDelta);
          sfx.waveClear();
          setOverlay("cleared");
          break;
        case "gameOver":
          resultRef.current = event.result;
          sfx.gameOver();
          setOverlay("gameover");
          break;
      }
    });
    engineRef.current = engine;

    const launchTimer = window.setTimeout(() => {
      engine.launch();
      setOverlay(null);
    }, 1700);

    return () => {
      window.clearTimeout(launchTimer);
      engine.destroy();
      engineRef.current = null;
      sfx.ufoStop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineKey, wave.hunkId]);

  const skipWave = useCallback(() => {
    const snapshot = engineRef.current?.snapshot();
    if (snapshot) {
      finish({
        result: snapshot,
        continuesUsed: continuesRef.current,
        skipped: true,
        aborted: false,
      });
    }
  }, [finish]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const current = overlayRef.current;
      if (current === "cleared" && e.key === "Enter") {
        finish({
          result: resultRef.current!,
          continuesUsed: continuesRef.current,
          skipped: false,
          aborted: false,
        });
      } else if (current === "gameover") {
        if (e.key === "Enter" || e.key === "c" || e.key === "C") {
          sfx.powerup();
          setContinues((n) => n + 1);
          setEngineKey((k) => k + 1);
        } else if (e.key === "Escape") {
          finish({
            result: resultRef.current!,
            continuesUsed: continuesRef.current,
            skipped: false,
            aborted: true,
          });
        }
      } else if (current === null && e.key === "Escape") {
        skipWave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish, skipWave]);

  const displayScore = Math.max(entryScore + delta - continues * CONTINUE_COST, 0);
  const result = resultRef.current;

  const pointerToLogicalX = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return ((e.clientX - rect.left) / rect.width) * 448;
  };

  const holdControl = (control: "left" | "right" | "fire") => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      sfx.ensure();
      engineRef.current?.setControl(control, true);
    },
    onPointerUp: () => engineRef.current?.setControl(control, false),
    onPointerCancel: () => engineRef.current?.setControl(control, false),
    onPointerLeave: () => engineRef.current?.setControl(control, false),
  });

  return (
    <div className="screen wave-screen">
      <header className="hud-bar term">
        <span>SCORE {displayScore.toLocaleString()}</span>
        <span className="amber">×{multiplier.toFixed(2)}</span>
        <span className="hud-title">
          WAVE {wave.waveIndex + 1}/{Number.isFinite(wave.totalWaves) ? wave.totalWaves : "∞"} ▸{" "}
          {wave.file.split("/").pop()}
        </span>
        <span className="lives-chip">
          {Array.from({ length: Math.max(lives, 0) }, (_, i) => (
            <PixelIcon key={i} kind="player" scale={1} />
          ))}
        </span>
      </header>

      <div className="playfield-wrap">
        <canvas
          ref={canvasRef}
          className="playfield"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            sfx.ensure();
            engineRef.current?.setPointer(pointerToLogicalX(e));
          }}
          onPointerMove={(e) => {
            if (e.buttons > 0) engineRef.current?.setPointer(pointerToLogicalX(e));
          }}
          onPointerUp={() => engineRef.current?.setPointer(null)}
          onPointerCancel={() => engineRef.current?.setPointer(null)}
        />

        {overlay === "ready" && (
          <div className="playfield-overlay">
            <p className="overlay-title">WAVE {wave.waveIndex + 1}</p>
            <p className="term overlay-sub">{wave.file}</p>
            {wave.flagged && (
              <p className="amber blink overlay-flag">
                ⚠ PRIORITY TARGET DETECTED — SPREAD CANNON ARMED
              </p>
            )}
            <p className="term overlay-hint blink">READY?</p>
          </div>
        )}

        {overlay === "cleared" && result && (
          <div className="playfield-overlay">
            <p className="overlay-title green">WAVE CLEAR</p>
            {result.bonus && (
              <div className="term overlay-bonus">
                <p>CLEAR BONUS ..... +{result.bonus.clear}</p>
                <p>ACCURACY BONUS .. +{result.bonus.accuracy}</p>
                <p>
                  ACCURACY {result.shots > 0 ? Math.round((result.hits / result.shots) * 100) : 0}%
                </p>
              </div>
            )}
            <button
              className="btn btn-large"
              onClick={() =>
                finish({
                  result,
                  continuesUsed: continues,
                  skipped: false,
                  aborted: false,
                })
              }
            >
              ▸ CONTINUE [ENTER]
            </button>
          </div>
        )}

        {overlay === "gameover" && (
          <div className="playfield-overlay">
            <p className="overlay-title red">GAME OVER</p>
            <p className="term overlay-sub">THE INVADERS BREACHED THE CODEBASE</p>
            <div className="overlay-actions">
              <button
                className="btn"
                onClick={() => {
                  sfx.powerup();
                  setContinues((n) => n + 1);
                  setEngineKey((k) => k + 1);
                }}
              >
                INSERT COIN (-{CONTINUE_COST}) [C]
              </button>
              <button
                className="btn btn-ghost"
                onClick={() =>
                  finish({
                    result: result!,
                    continuesUsed: continues,
                    skipped: false,
                    aborted: true,
                  })
                }
              >
                {retreatLabel}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="control-deck" aria-label="touch controls">
        <button className="deck-btn" {...holdControl("left")} aria-label="move left">
          ◀
        </button>
        <button className="deck-btn deck-fire" {...holdControl("fire")} aria-label="fire">
          FIRE
        </button>
        <button className="deck-btn" {...holdControl("right")} aria-label="move right">
          ▶
        </button>
      </div>

      <footer className="ticker term">
        <span className="ticker-text">{ticker}</span>
        <span className="ticker-controls">←→ MOVE · SPACE FIRE</span>
        <button
          className="link-btn term ticker-skip"
          onClick={() => {
            if (overlayRef.current === null) skipWave();
          }}
        >
          [SKIP ▸]
        </button>
      </footer>
    </div>
  );
}
