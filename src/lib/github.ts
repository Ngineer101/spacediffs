import type { GitHubUser, PRData } from "./types";

export interface PrRef {
  owner: string;
  repo: string;
  number: number;
}

export function parsePrUrl(input: string): PrRef | null {
  // Accepts github.com or spacediffs.com PR URLs, bare "/owner/repo/pull/123"
  // paths (our GitHub-style deep links), and "owner/repo#123" shorthand.
  // Strips any scheme://host[:port]/ prefix first; GitHub owners can't
  // contain dots, so a bare owner/repo path is never mistaken for a host.
  const trimmed = input
    .trim()
    .replace(/^(?:https?:\/\/)?(?:www\.)?(?:[\w-]+(?:\.[\w-]+)+|localhost)(?::\d+)?\//, "")
    .replace(/^\//, "");
  const match =
    /^([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/.exec(trimmed) ??
    /^([\w.-]+)\/([\w.-]+)#(\d+)$/.exec(trimmed);
  if (!match) return null;
  return { owner: match[1], repo: match[2], number: Number(match[3]) };
}

export class PrFetchError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PrFetchError";
  }
}

export async function fetchPr(ref: PrRef): Promise<PRData> {
  const params = new URLSearchParams({
    owner: ref.owner,
    repo: ref.repo,
    number: String(ref.number),
  });
  const response = await fetch(`/api/pr?${params}`);
  const data = (await response.json().catch(() => ({}))) as { pr?: PRData; error?: string };
  if (!response.ok || !data.pr) {
    throw new PrFetchError(
      data.error ?? `Failed to load PR (${response.status}).`,
      response.status,
    );
  }
  return data.pr;
}

export async function fetchMe(): Promise<GitHubUser | null> {
  try {
    const response = await fetch("/api/me");
    if (!response.ok) return null;
    const data = (await response.json()) as { user: GitHubUser | null };
    return data.user;
  } catch {
    return null;
  }
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}
