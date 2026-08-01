import { buildWave, type WaveConfig } from "../game/waves";
import type { DiffLine, Hunk, Review } from "./types";

export type ErrorKind = "404" | "500";

// Endless "anomaly" waves for the 404/500 pages. Each wave is a randomized
// synthetic hunk fed through the real buildWave pipeline, so the arcade
// (sprites, points, elite bugs, spread cannon) behaves exactly like a PR
// mission — it just never touches the leaderboard.

interface ErrorTheme {
  file: string;
  adds: string[];
  dels: string[];
  context: string[];
  eliteComments: string[];
  /** Chance per wave that an elite bug spawns (and arms the spread cannon). */
  eliteChance: number;
}

const THEMES: Record<ErrorKind, ErrorTheme> = {
  "404": {
    file: "void/sector-404.log",
    adds: [
      "ERROR 404: sector not charted",
      "scanning adjacent quadrants... vacuum",
      "telemetry lost beyond this point",
      "if (page === null) drift(forever)",
      "last known coordinates: /dev/null",
      "distress beacon deployed. no response.",
      "star charts end here. so does the URL.",
      "navcom suggests turning back",
      "long-range sensors report: nothing",
      "echo... echo... echo...",
    ],
    dels: [
      "route.match(request.path) // undefined",
      "expected: page — found: vacuum",
      "hyperlink decayed into cosmic dust",
      "breadcrumbs eaten by space crabs",
      "this sector was deleted in a rebase",
      "page drifted out of the observable web",
      "wormhole collapsed mid-request",
    ],
    context: [
      "// you are here. nothing else is.",
      "· * ·   ·  *   ·   · *",
      "...",
      "// abandon URL, all ye who enter",
      "~ silence ~",
    ],
    eliteComments: [
      "the broken link that led you here",
      "rogue redirect detected in the void",
      "dead link — terminate with prejudice",
    ],
    eliteChance: 0.35,
  },
  "500": {
    file: "core/meltdown-500.log",
    adds: [
      'throw new Error("core meltdown")',
      "UNHANDLED PROMISE REJECTION AT 0x1F4",
      "reactor.temperature > MAX_SAFE_INTEGER",
      "PANIC: segmentation fault in sector 7G",
      "stack overflow spilled into cargo bay",
      "coolant.leak() returned undefined",
      "kernel weeping quietly in module 3",
      "have you tried turning it off and on",
      "ERR_INTERNAL: gremlins in the mainframe",
    ],
    dels: [
      "at handleRequest (worker/index.ts:500)",
      "at async invadeCodebase (engine.ts:42)",
      "at reactorCore.ignite (core.ts:1978)",
      "stack trace corrupted by cosmic rays",
      "at JSON.parse (<anonymous>)",
      "at processTicksAndRejections (node:11)",
      "try { everything } catch { nothing }",
    ],
    context: [
      "// TODO: add error handling (someday)",
      "retrying... retrying... retrying...",
      "// this never happened in staging",
      "core dump follows:",
      "// works on my machine",
    ],
    eliteComments: [
      "THE bug that took the server down",
      "unhandled exception — squash on sight",
      "null pointer with a bad attitude",
    ],
    eliteChance: 1,
  },
};

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/** Random take of `n` lines, recycling the pool when a wave outgrows it. */
function take(pool: string[], n: number): string[] {
  const out: string[] = [];
  while (out.length < n) out.push(...shuffle(pool).slice(0, n - out.length));
  return out;
}

export function buildErrorWave(kind: ErrorKind, waveIndex: number): WaveConfig {
  const theme = THEMES[kind];

  // Waves grow with depth: start gentle, ramp toward the 30-invader cap.
  const addCount = Math.min(4 + waveIndex * 2 + Math.floor(Math.random() * 4), 18);
  const delCount = Math.min(3 + waveIndex + Math.floor(Math.random() * 3), 12);

  const lines: DiffLine[] = [
    ...take(theme.adds, addCount).map(
      (text, i): DiffLine => ({ type: "add", text, oldLine: null, newLine: i + 1 }),
    ),
    ...take(theme.dels, delCount).map(
      (text, i): DiffLine => ({ type: "del", text, oldLine: i + 1, newLine: null }),
    ),
    ...theme.context.map(
      (text, i): DiffLine => ({ type: "context", text, oldLine: i + 100, newLine: i + 100 }),
    ),
  ];

  const hunk: Hunk = {
    id: `${kind}-anomaly-${waveIndex}-${Math.random().toString(36).slice(2, 8)}`,
    file: theme.file,
    fileStatus: "modified",
    header: `@@ -${kind},${delCount} +${kind},${addCount} @@ anomaly depth ${waveIndex + 1}`,
    indexInFile: 0,
    hunksInFile: 1,
    lines,
    additions: addCount,
    deletions: delCount,
  };

  const flagged = Math.random() < theme.eliteChance;
  const review: Review = flagged
    ? { verdict: "flag", comment: pick(theme.eliteComments) }
    : { verdict: "approve", comment: "" };

  return buildWave(hunk, review, waveIndex, Infinity);
}
