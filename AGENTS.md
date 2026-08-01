<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

# SpaceDiffs — project context

SpaceDiffs (spacediffs.com) is a Space Invaders × code review arcade: the user
pastes a GitHub PR URL, reads each diff hunk in a CRT-styled review console,
approves or flags it, and then plays an arcade wave where that hunk's changed
lines descend as invaders. It ends in a debrief with copyable markdown review
output.

## Commands

- `vp dev` — dev server on http://localhost:5173 (Worker + SPA in one process).
  Never start it with plain `npm run dev`: `devEngines` pins npm 12 and the
  system npm may be older. `.claude/launch.json` runs `vp dev` for previews.
- `vp check` / `vp check --fix` — format + lint (Oxfmt/Oxlint). A pre-staged
  hook in `vite.config.ts` runs `vp check --fix` on staged files.
- `vp run check` — `tsc -b` type check (three project refs: app, worker, node).
- `vp run deploy` — build + `wrangler deploy`.

## Architecture

One Cloudflare Worker serves everything: static SPA assets + a Hono API.
`@cloudflare/vite-plugin` runs the same Worker in dev.

- `worker/index.ts` — Hono app. GitHub OAuth (web flow; token sealed with
  AES-GCM into HttpOnly cookie `sd_session`, never sent to the browser) and
  `/api/pr` proxy (PR meta + files, paginated 100/page, capped at 300 files).
  Anonymous GitHub API is used when not signed in, so public PRs work with
  zero config. Secrets: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`,
  `SESSION_SECRET` (locally via `.dev.vars`).
  Security posture (keep these invariants): default sign-in requests NO OAuth
  scope (public read-only); `repo` scope only via the explicit
  `/api/auth/login?scope=repo` opt-in, and the granted scope is stored in the
  session (`privateAccess` on `/api/me`). The sealed cookie payload is
  `{t, iat, s}` JSON — `getSession` rejects blobs older than 30 days, so a
  captured cookie cannot be replayed forever. `/api/pr` rejects owners with
  dots and dot-only repo names to prevent path traversal into other GitHub
  API endpoints.
- `src/App.tsx` — phase state machine: `title → loading → briefing →
(review → wave)* → debrief`, plus a `leaderboard` phase. Owns session state
  (score, lives, multiplier, stats, reviews). Also: global click-blur listener
  (see gotchas), GitHub-style deep-link handling, and the pending-submission
  flow (a debrief run stashed in sessionStorage before the OAuth redirect is
  auto-transmitted once the user returns signed in).
- `src/screens/` — one component per phase. `WaveScreen` hosts the engine and
  its overlays (READY / WAVE CLEAR / GAME OVER with continues).
- `src/game/engine.ts` — self-contained Canvas-2D game engine (no React):
  formation march, bombs, destructible bunkers, UFO, elite bug, particles,
  score popups. Logical resolution 448×512, scaled via CSS. All tuning
  constants live at the top of this file.
- `src/game/waves.ts` — hunk → invader formation. Additions = squids (30),
  deletions = crabs (20), context padding = octopi (10); flagged hunks add a
  3-HP elite bug (300) and arm the spread cannon. Caps at 30 invaders/wave.
- `src/game/sprites.ts` — pixel art as string grids, rendered to offscreen
  canvases; `spriteDataUri` feeds the DOM `PixelIcon` component.
- `src/lib/` — `parseDiff.ts` (unified-patch → hunks), `github.ts` (client
  API and `parsePrUrl`), `demo.ts` (bundled offline demo PR), `sound.ts` (all
  audio synthesized with WebAudio — zero assets), `exportReview.ts` (debrief
  markdown).
- `src/components/` — `Starfield` (three.js background, mode: drift/battle/
  warp), `CRTOverlay` (pure-CSS scanlines/vignette/flicker), `PixelIcon`.
- `src/global.css` — the entire stylesheet, organized by commented sections.
  Palette + fonts are CSS vars on `:root` (phosphor green `#33ff66`, amber,
  red; "Press Start 2P" for display, "VT323" for terminal text).

## Leaderboard (D1)

Public leaderboard backed by the `spacediffs-leaderboard` D1 database
(binding `DB` in `wrangler.jsonc`; local dev gets an auto-created local copy —
the worker lazily applies `CREATE TABLE IF NOT EXISTS` once per isolate, so
there is no migration step). Tables: `leaderboard` (one row per GitHub login,
personal best only) and `submit_limits` (fixed-window rate limiting).

- `GET /api/leaderboard?limit=N` — public, top 100 max, `Cache-Control` 30s.
- `POST /api/leaderboard` — requires a session. Identity (login + avatar)
  comes from GitHub's `/user`, never from the request body. Rejections:
  training missions (`spacediffs/*`), >12 submissions/hour/login, GitHub
  accounts younger than 30 days (anti-sybil), PRs that don't exist on GitHub,
  and scores above the perfect-play ceiling computed from the PR's actual
  hunks (`maxScoreFromPatches` — mirrors wave generation: ≤30 invaders/hunk,
  elite + UFO allowance, ×3 multiplier, clear/accuracy bonuses). A forger can
  fake a plausible score but not an absurd one; continue-farming beyond the
  ceiling is knowingly sacrificed. Best-per-player is enforced with an upsert
  guarded by `improved = score > existing`.
- Submission is AUTOMATIC: the debrief auto-transmits for signed-in users
  (score > 0, real PR; StrictMode-guarded with a ref), with a RETRY button on
  failure. Signed-out users get the sign-in stash flow. The manual button was
  removed deliberately — it wasn't a security control, and it cost real
  scores; don't reintroduce it.
- Client: `src/lib/leaderboard.ts` (fetch/submit + the sessionStorage
  pending-submission stash), `src/screens/LeaderboardScreen.tsx` (full board
  at `/leaderboard`), top-10 panel on the title screen, transmit panel on the
  debrief.
- Seed local test data with
  `./node_modules/.bin/wrangler d1 execute spacediffs-leaderboard --local --command "INSERT ..."`
  (plain `npx wrangler` fails under the npm 12 devEngines pin).

## URL structure

GitHub-style deep links: `/<owner>/<repo>/pull/<n>` boots a mission directly
(i.e. replace `github.com` with `spacediffs.com` in any PR URL). Launching
from the title input rewrites the address bar to that form via
`history.replaceState`. The demo mission is `/spacediffs/training-sim/pull/1978`
and needs no network — use it for manual testing. `parsePrUrl` accepts full
URLs from any host, bare paths, and `owner/repo#123` shorthand.

## Gotchas (hard-won, do not regress)

- **`run_worker_first: ["/api/*"]` in `wrangler.jsonc` is load-bearing.** The
  SPA `not_found_handling` otherwise serves `index.html` for `/api/*` HTML
  navigations (fetch calls worked, but the OAuth redirect silently broke).
- **rAF fallback**: `engine.ts` and `Starfield.tsx` fall back to `setTimeout`
  when `document.hidden` — browsers stop rAF for hidden tabs, which froze the
  game in headless/preview contexts. Keep the fallback when touching loops.
- **Global click-blur** (`App.tsx`): keyboard shortcuts are window-level
  handlers; without blurring buttons after click, Enter/Space re-activates the
  last-focused button on the next screen (double-navigation bug).
- **Pointer controls are a feature, not a hack**: drag-to-steer + hold-to-fire
  on the canvas plus the on-screen deck exist for mobile _and_ because browser
  automation can't synthesize `e.key` values — clicks are the only way
  automated tests can play. Don't remove them.
- GitHub `files` API: `patch` is `null` for binary/oversized files (they're
  counted as "unscannable" and excluded); PRs are capped at 300 files
  (`truncated` flag).
- React StrictMode double-mounts effects: `WaveScreen` creates/destroys the
  engine twice in dev — engine construction must stay idempotent and
  `destroy()` complete.
- localStorage keys: `spacediffs_hiscore`, `spacediffs_muted`.
