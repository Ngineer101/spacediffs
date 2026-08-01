# SPACEDIFFS // CODE REVIEW ARCADE

**[spacediffs.com](https://spacediffs.com)** — code review, but it's 1978 and
the diff is invading.

Paste a GitHub PR link, read each hunk in a phosphor-green review console,
pass judgement — then blast that hunk out of the sky, one wave of invaders per
hunk. At the end you get a mission debrief with a copyable markdown review to
paste back on the PR.

## How the mashup works

- **Every hunk is a wave.** Added lines descend as green squids (30 pts),
  deleted lines as red crabs (20 pts); tiny hunks are padded with context-line
  octopi (10 pts). The kill ticker shows the actual line of code each invader
  carried — you are, quite literally, shooting the diff.
- **Review first, shoot second.** You read the hunk calmly (no timer) and
  either **[A] LOOKS GOOD** or **[F] FLAG IT** with a comment. Flagging spawns
  a 300-point elite BUG with 3 HP — and arms your spread cannon for that wave.
- The occasional UFO crossing the top is a **merge conflict** (mystery points).
- Dying costs a cannon; running out means INSERT COIN (−500) or retreating to
  the debrief. Clearing waves without dying builds a score multiplier (up to
  ×3). High score persists in `localStorage`.
- The **debrief** lists every flag with its comment plus your arcade stats,
  and a COPY REVIEW button emits GitHub-flavoured markdown.
- **Galactic Rankings** — a public leaderboard (Cloudflare D1). Signed-in
  pilots transmit automatically when the debrief opens; signed-out pilots get
  a one-click sign-in that transmits the stashed run right after OAuth. The
  board keeps one row per pilot (personal best, real PRs only — training
  missions stay local). Top 10 on the title screen, full top 100 at
  [/leaderboard](https://spacediffs.com/leaderboard). Submissions are
  rate-limited, require a GitHub account at least 30 days old, and are capped
  server-side at the perfect-play ceiling computed from the PR's actual
  hunks.

## GitHub-style URLs

Swap `github.com` for `spacediffs.com` in any PR URL and the mission starts
immediately:

```
https://github.com/cloudflare/workers-sdk/pull/14928
        ↓
https://spacediffs.com/cloudflare/workers-sdk/pull/14928
```

Launching from the home page rewrites the address bar to the same shareable
form. The training mission is one too — and works fully offline:
[`/spacediffs/training-sim/pull/1978`](https://spacediffs.com/spacediffs/training-sim/pull/1978).

## Controls

| Input        | Action                                                             |
| ------------ | ------------------------------------------------------------------ |
| ← → or A/D   | move cannon                                                        |
| Space        | fire                                                               |
| Esc          | skip wave (or the `[SKIP ▸]` button)                               |
| A / F, Enter | review verdicts + launch wave                                      |
| Touch        | drag the playfield to steer + auto-fire, or use the on-screen deck |

## Stack

- React 19 + TypeScript, built with **Vite+** (`vp`), deployed as a single
  **Cloudflare Worker** (static assets + API) via `@cloudflare/vite-plugin`
- Hono on the Worker for GitHub OAuth + a PR proxy — the GitHub token is
  AES-GCM-sealed into an HttpOnly cookie and never reaches the browser
- **D1** (`spacediffs-leaderboard`) for the public leaderboard — schema is
  applied automatically, works in local dev with zero setup
- Canvas 2D game engine (formation marching, destructible bunkers, particles,
  elite bugs, UFOs) at a logical 448×512, CSS-scaled and pixelated
- three.js starfield backdrop with warp-speed transitions between phases
- WebAudio-synthesized sound — the four-note march, shots, explosions, the UFO
  warble; zero audio assets

## Running locally

```sh
vp install
vp dev          # http://localhost:5173
```

Public PRs work immediately with no configuration (anonymous GitHub API,
60 req/hr per IP). The **TRAINING MISSION** on the title screen needs no
network at all.

Validate changes with `vp check` (format + lint) and `vp run check` (types).

### GitHub OAuth (private repos + higher rate limits)

1. Create a GitHub OAuth app at <https://github.com/settings/developers>
   - Homepage URL: `http://localhost:5173`
   - Authorization callback URL: `http://localhost:5173/api/auth/callback`
2. `cp .dev.vars.example .dev.vars` and fill in `GITHUB_CLIENT_ID`,
   `GITHUB_CLIENT_SECRET`, and a random `SESSION_SECRET`.

Sign-in is least-privilege by default: it requests **no OAuth scopes** (public
read-only access, 5k req/hr). Private repositories require the separate
"NEED PRIVATE REPOS?" sign-in, which requests the `repo` scope — GitHub's
classic OAuth has no finer-grained read-only alternative. Sessions expire
after 30 days server-side (the expiry is embedded in the encrypted cookie).

## Scoring reference

| Target                   | Points        |
| ------------------------ | ------------- |
| Squid (added line)       | 30            |
| Crab (deleted line)      | 20            |
| Octopus (context filler) | 10            |
| Elite BUG (flagged hunk) | 300           |
| Merge-conflict UFO       | 50–300        |
| Wave clear               | 100 + 50/wave |
| Accuracy bonus (≥50%)    | up to 200     |
| Continue (insert coin)   | −500          |

May your accuracy exceed your rebase conflicts.
