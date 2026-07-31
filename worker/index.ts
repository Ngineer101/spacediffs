import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";

type Env = {
  ASSETS: Fetcher;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
};

const SESSION_COOKIE = "sd_session";
const STATE_COOKIE = "sd_oauth_state";
const GITHUB_API = "https://api.github.com";
const USER_AGENT = "spacediffs-code-review-arcade";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

// ---------------------------------------------------------------------------
// Session cookie sealing (AES-GCM keyed off SESSION_SECRET)
// ---------------------------------------------------------------------------

async function deriveKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function seal(secret: string, value: string): Promise<string> {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value)),
  );
  const packed = new Uint8Array(iv.length + ciphertext.length);
  packed.set(iv);
  packed.set(ciphertext, iv.length);
  return toBase64Url(packed);
}

async function unseal(secret: string, sealed: string): Promise<string | null> {
  try {
    const packed = fromBase64Url(sealed);
    const key = await deriveKey(secret);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: packed.slice(0, 12) },
      key,
      packed.slice(12),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// GitHub helpers
// ---------------------------------------------------------------------------

interface Session {
  token: string;
  /** OAuth scopes GitHub actually granted (comma-separated, "" = public read-only). */
  scope: string;
}

/**
 * The sealed payload carries its own issued-at so a captured cookie blob
 * expires server-side too — the cookie Max-Age only governs the browser.
 */
async function getSession(c: { req: { raw: Request } }, env: Env): Promise<Session | null> {
  if (!env.SESSION_SECRET) return null;
  const cookie = getCookie(c as never, SESSION_COOKIE);
  if (!cookie) return null;
  const plaintext = await unseal(env.SESSION_SECRET, cookie);
  if (!plaintext) return null;
  try {
    const data = JSON.parse(plaintext) as { t?: unknown; iat?: unknown; s?: unknown };
    if (typeof data.t !== "string" || typeof data.iat !== "number") return null;
    if (Date.now() - data.iat > SESSION_MAX_AGE_SECONDS * 1000) return null;
    return { token: data.t, scope: typeof data.s === "string" ? data.s : "" };
  } catch {
    return null;
  }
}

function hasPrivateAccess(session: Session): boolean {
  return session.scope.split(",").some((s) => s.trim() === "repo");
}

function githubHeaders(token: string | null): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": USER_AGENT,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = new Hono<{ Bindings: Env }>();

app.get("/api/auth/login", async (c) => {
  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, SESSION_SECRET } = c.env;
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET || !SESSION_SECRET) {
    return c.redirect("/?auth_error=not_configured");
  }
  const origin = new URL(c.req.url).origin;
  const state = crypto.randomUUID();
  setCookie(c, STATE_COOKIE, state, {
    httpOnly: true,
    secure: origin.startsWith("https"),
    sameSite: "Lax",
    path: "/",
    maxAge: 600,
  });
  // Least privilege: an empty scope grants read-only access to public data
  // (plus the authenticated 5k/hr rate limit), which is all the app needs.
  // "repo" — the only escalation we accept — is requested solely when the
  // user explicitly opts in for private repositories.
  const scope = c.req.query("scope") === "repo" ? "repo" : "";
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", GITHUB_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", `${origin}/api/auth/callback`);
  if (scope) authorize.searchParams.set("scope", scope);
  authorize.searchParams.set("state", state);
  return c.redirect(authorize.toString());
});

app.get("/api/auth/callback", async (c) => {
  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, SESSION_SECRET } = c.env;
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET || !SESSION_SECRET) {
    return c.redirect("/?auth_error=not_configured");
  }
  const code = c.req.query("code");
  const state = c.req.query("state");
  const expectedState = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: "/" });
  if (!code || !state || !expectedState || state !== expectedState) {
    return c.redirect("/?auth_error=state_mismatch");
  }

  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
    }),
  });
  const tokenData = (await tokenResponse.json()) as {
    access_token?: string;
    scope?: string;
    error?: string;
  };
  if (!tokenData.access_token) {
    return c.redirect(`/?auth_error=${tokenData.error ?? "token_exchange"}`);
  }

  const origin = new URL(c.req.url).origin;
  const payload = JSON.stringify({
    t: tokenData.access_token,
    iat: Date.now(),
    s: tokenData.scope ?? "",
  });
  setCookie(c, SESSION_COOKIE, await seal(SESSION_SECRET, payload), {
    httpOnly: true,
    secure: origin.startsWith("https"),
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return c.redirect("/");
});

app.post("/api/auth/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

app.get("/api/me", async (c) => {
  const session = await getSession(c, c.env);
  if (!session) return c.json({ user: null });
  const response = await fetch(`${GITHUB_API}/user`, {
    headers: githubHeaders(session.token),
  });
  if (!response.ok) {
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ user: null });
  }
  const user = (await response.json()) as {
    login: string;
    name: string | null;
    avatar_url: string;
  };
  return c.json({
    user: {
      login: user.login,
      name: user.name,
      avatarUrl: user.avatar_url,
      privateAccess: hasPrivateAccess(session),
    },
  });
});

const MAX_FILE_PAGES = 3; // 300 files ought to be enough invaders for anyone

app.get("/api/pr", async (c) => {
  const owner = c.req.query("owner");
  const repo = c.req.query("repo");
  const number = c.req.query("number");
  if (!owner || !repo || !number || !/^\d+$/.test(number)) {
    return c.json({ error: "Expected owner, repo and number query params." }, 400);
  }
  // GitHub owners are alphanumeric/hyphen (no dots); repo names may contain
  // dots but never consist solely of them. Rejecting "." / ".." keeps dot
  // segments from rewriting the proxied API path.
  if (!/^[\w-]+$/.test(owner) || !/^[\w.-]+$/.test(repo) || /^\.+$/.test(repo)) {
    return c.json({ error: "Invalid owner or repo." }, 400);
  }

  const session = await getSession(c, c.env);
  const headers = githubHeaders(session?.token ?? null);
  const base = `${GITHUB_API}/repos/${owner}/${repo}/pulls/${number}`;

  const prResponse = await fetch(base, { headers });
  if (prResponse.status === 404) {
    let hint = "PR not found. If it lives in a private repo, sign in with GitHub first.";
    if (session) {
      hint = hasPrivateAccess(session)
        ? "PR not found (or your account has no access to it)."
        : "PR not found. If it's in a private repo, re-sign-in with private repo access.";
    }
    return c.json({ error: hint }, 404);
  }
  if (prResponse.status === 403 || prResponse.status === 429) {
    return c.json({ error: "GitHub rate limit hit. Sign in with GitHub for a higher limit." }, 429);
  }
  if (!prResponse.ok) {
    return c.json({ error: `GitHub error (${prResponse.status}).` }, 502);
  }
  const pr = (await prResponse.json()) as {
    title: string;
    body: string | null;
    html_url: string;
    state: string;
    additions: number;
    deletions: number;
    changed_files: number;
    user: { login: string };
    base: { ref: string };
    head: { ref: string };
  };

  type GitHubFile = {
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    patch?: string;
  };
  const files: GitHubFile[] = [];
  let truncated = false;
  for (let page = 1; page <= MAX_FILE_PAGES; page++) {
    const filesResponse = await fetch(`${base}/files?per_page=100&page=${page}`, {
      headers,
    });
    if (!filesResponse.ok) {
      return c.json({ error: `GitHub error fetching files (${filesResponse.status}).` }, 502);
    }
    const pageFiles = (await filesResponse.json()) as GitHubFile[];
    files.push(...pageFiles);
    if (pageFiles.length < 100) break;
    if (page === MAX_FILE_PAGES) truncated = true;
  }

  return c.json({
    pr: {
      owner,
      repo,
      number: Number(number),
      title: pr.title,
      body: pr.body?.slice(0, 2000) ?? null,
      htmlUrl: pr.html_url,
      state: pr.state,
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changed_files,
      author: pr.user.login,
      baseRef: pr.base.ref,
      headRef: pr.head.ref,
      truncated,
      files: files.map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch ?? null,
      })),
    },
  });
});

app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

export default app;
