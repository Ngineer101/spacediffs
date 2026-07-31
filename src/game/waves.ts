import type { Hunk, Review } from "../lib/types";
import type { SpriteKind } from "./sprites";

export interface InvaderSpec {
  kind: Extract<SpriteKind, "squid" | "crab" | "octopus" | "bug">;
  lineText: string;
  points: number;
  hp: number;
}

export interface WaveConfig {
  hunkId: string;
  file: string;
  waveIndex: number;
  totalWaves: number;
  flagged: boolean;
  /** Row-major, top-left first. */
  invaders: InvaderSpec[];
  cols: number;
  rows: number;
  elite: InvaderSpec | null;
}

const MAX_INVADERS = 30;
const MIN_INVADERS = 6;

const POINTS: Record<InvaderSpec["kind"], number> = {
  squid: 30,
  crab: 20,
  octopus: 10,
  bug: 300,
};

function trimText(text: string): string {
  const t = text.trim();
  return t.length > 60 ? `${t.slice(0, 57)}...` : t || "(blank line)";
}

/** Evenly sample n items from a list, preserving order. */
function sample<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  const out: T[] = [];
  for (let i = 0; i < n; i++) {
    out.push(items[Math.floor((i * items.length) / n)]);
  }
  return out;
}

export function buildWave(
  hunk: Hunk,
  review: Review,
  waveIndex: number,
  totalWaves: number,
): WaveConfig {
  const adds = hunk.lines.filter((l) => l.type === "add");
  const dels = hunk.lines.filter((l) => l.type === "del");
  const context = hunk.lines.filter((l) => l.type === "context");

  const invaders: InvaderSpec[] = [];
  const changed = adds.length + dels.length;
  const addBudget =
    changed > MAX_INVADERS
      ? Math.max(1, Math.round((adds.length / changed) * MAX_INVADERS))
      : adds.length;
  const delBudget = Math.min(dels.length, MAX_INVADERS - Math.min(addBudget, MAX_INVADERS));

  // Additions descend as squids (top rows), deletions as crabs (bottom rows),
  // padded with octopi built from context lines when a hunk is tiny.
  for (const line of sample(adds, addBudget)) {
    invaders.push({ kind: "squid", lineText: trimText(line.text), points: POINTS.squid, hp: 1 });
  }
  for (const line of sample(dels, delBudget)) {
    invaders.push({ kind: "crab", lineText: trimText(line.text), points: POINTS.crab, hp: 1 });
  }
  let filler = 0;
  while (invaders.length < MIN_INVADERS) {
    const ctx = context[filler % Math.max(context.length, 1)];
    invaders.push({
      kind: "octopus",
      lineText: ctx ? trimText(ctx.text) : "(context)",
      points: POINTS.octopus,
      hp: 1,
    });
    filler++;
  }

  const n = invaders.length;
  const rows = Math.min(4, Math.max(1, Math.round(Math.sqrt(n / 2))));
  const cols = Math.ceil(n / rows);

  const flagged = review.verdict === "flag";
  const elite: InvaderSpec | null = flagged
    ? {
        kind: "bug",
        lineText: review.comment.trim() || "flagged for review",
        points: POINTS.bug,
        hp: 3,
      }
    : null;

  return {
    hunkId: hunk.id,
    file: hunk.file,
    waveIndex,
    totalWaves,
    flagged,
    invaders,
    cols,
    rows,
    elite,
  };
}
