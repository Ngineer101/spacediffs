export interface PRFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

export interface PRData {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string | null;
  htmlUrl: string;
  state: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  author: string;
  baseRef: string;
  headRef: string;
  truncated: boolean;
  files: PRFile[];
}

export type DiffLineType = "add" | "del" | "context";

export interface DiffLine {
  type: DiffLineType;
  text: string;
  oldLine: number | null;
  newLine: number | null;
}

export interface Hunk {
  id: string;
  file: string;
  fileStatus: string;
  header: string;
  indexInFile: number;
  hunksInFile: number;
  lines: DiffLine[];
  additions: number;
  deletions: number;
}

export type Verdict = "approve" | "flag";

export interface Review {
  verdict: Verdict;
  comment: string;
}

export interface GitHubUser {
  login: string;
  name: string | null;
  avatarUrl: string;
  /** True when the session was granted the "repo" scope (private repos). */
  privateAccess: boolean;
}

export interface SessionStats {
  shotsFired: number;
  shotsHit: number;
  wavesCleared: number;
  wavesSkipped: number;
  deaths: number;
  continuesUsed: number;
  ufosKilled: number;
}

export const EMPTY_STATS: SessionStats = {
  shotsFired: 0,
  shotsHit: 0,
  wavesCleared: 0,
  wavesSkipped: 0,
  deaths: 0,
  continuesUsed: 0,
  ufosKilled: 0,
};
