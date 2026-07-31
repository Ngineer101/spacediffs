export interface LeaderboardEntry {
  rank: number;
  login: string;
  avatarUrl: string;
  score: number;
  prOwner: string;
  prRepo: string;
  prNumber: number;
  accuracy: number;
  wavesCleared: number;
  flags: number;
  updatedAt: number;
}

export interface ScoreSubmission {
  score: number;
  prOwner: string;
  prRepo: string;
  prNumber: number;
  accuracy: number;
  wavesCleared: number;
  flags: number;
}

export interface SubmitResult {
  improved: boolean;
  best: number;
  rank: number;
}

/** Stashes a run across the OAuth redirect so it can be transmitted after sign-in. */
const PENDING_KEY = "sd_pending_submit";

export async function fetchLeaderboard(limit = 100): Promise<LeaderboardEntry[]> {
  const response = await fetch(`/api/leaderboard?limit=${limit}`);
  if (!response.ok) throw new Error(`Leaderboard unavailable (${response.status}).`);
  const data = (await response.json()) as { entries: LeaderboardEntry[] };
  return data.entries;
}

export async function submitScore(submission: ScoreSubmission): Promise<SubmitResult> {
  const response = await fetch("/api/leaderboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(submission),
  });
  const data = (await response.json()) as SubmitResult & { error?: string };
  if (!response.ok) throw new Error(data.error ?? `Transmission failed (${response.status}).`);
  return data;
}

export function stashPendingSubmission(submission: ScoreSubmission): void {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(submission));
}

export function takePendingSubmission(): ScoreSubmission | null {
  const raw = sessionStorage.getItem(PENDING_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(PENDING_KEY);
  try {
    return JSON.parse(raw) as ScoreSubmission;
  } catch {
    return null;
  }
}
