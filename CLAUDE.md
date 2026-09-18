# Project: Natalia and Stella's Ranch Life — a lightweight browser farm game

## Environment notes (added at setup, 2026-09-18)
- Project root: `C:\Users\franc\OneDrive\Desktop\ranch-life\` (this folder).
- Python is NOT installed on this machine, so `python -m http.server` does not work.
  Use the dependency-free Node server instead: `node serve.js` → http://localhost:8000
- Node v22 and Git are installed. No npm install is ever needed.

## Setup (done at project start)
1. This brief is saved as CLAUDE.md in the project root so it persists across sessions
   and every sub-agent reads it.
2. `git init` was run and a .gitignore added. Commit at the end of every phase with
   a message like "Phase 1: walk around".
3. Folder structure (index.html, /js, /assets, README.md) was created as empty
   placeholders.
4. Tell the user how to start the local server and what URL to open, then stop and
   wait for their go-ahead.

## How I want you to work
You are the planner and reviewer. Do NOT write game code yourself. Break each
phase into tasks and delegate every build task to sub-agents running Claude Opus.
You review their output against the success check for the phase, fix gaps by
sending them back, and report to me in plain language when a phase is done.

I'm a beginner-to-intermediate technical user. Talk to me like one:
- Explain what you're about to do and why before you do it.
- Work one phase at a time. Do not start the next phase until I've confirmed
  the current one works on my screen.
- Every phase ends with an explicit "how to check it worked" instruction.
- Keep things simple. Prefer fewer files, fewer libraries, and no build tools.

## The game (concept — this is fixed)
Third-person, open-world "mini GTA" feel, but a gentle farm ranch. Must be
simple enough for an 8-year-old to play and understand.

- Player: Natalia, a girl farmer. Simple outfit customization at her house.
- Stella: Natalia's sister, a companion who follows her around the ranch. She is
  a second simple girl character (visibly different hair/dress colors), trails a
  couple of steps behind Natalia, and stops when Natalia stops. She is NOT a horse.
- Horses: she can own several of different kinds. She rides them, feeds them,
  customizes them (saddles, clothes), and can breed them. A foal's coat color
  is random.
- Chickens: she raises them; they need their own chicken feed.
- Economy: coins. She sells chickens at a "market stall" (never a slaughterhouse)
  for instant coins. She buys horse feed at a store that is roughly a 60-second
  horse ride away along a scenic road.
- Neighbors: a small community of neighbor families, each with a distinct house
  and barn specializing in a different animal or crop. She can trade directly
  with them (e.g., eggs for corn, including feed).
- Later: FarmVille-style crops and growing things beyond chickens.

## Technical decisions (fixed — don't relitigate these)
- Three.js for 3D, loaded from a CDN via an import map. Vanilla JavaScript
  ES modules. No React, no bundler, no npm install, no framework.
- A plain static folder: index.html plus a small /js folder. It must run
  locally with a simple static server (here: `node serve.js`) and
  deploy unchanged to Cloudflare Pages.
- Low graphics load: low-poly, flat/simple materials, no heavy post-processing.
  Target smooth play on an ordinary laptop with integrated graphics.
- Art: procedural/simple geometry first (boxes, capsules, cylinders). Free
  low-poly assets (Kenney / Quaternius) only if they are hosted inside the
  project folder — no external asset URLs.
- Save game in localStorage, wrapped in try/catch, so the game still runs if
  storage is empty or blocked.
- Controls: WASD/arrow keys to move, mouse to look, E to interact, Esc for
  menu. Show on-screen hints for an 8-year-old.
- Keep a short README.md updated with: how to run locally, how to deploy,
  and a one-line status per phase.

## Phases (build in this order, one at a time)

Phase 1 — Walk around
Flat ranch ground, a simple girl character, third-person follow camera, WASD
movement, one static horse standing in the world, a placeholder house and barn.
Stella follows Natalia.
Check: I open index.html via the local server and can walk around the horse
and house without the camera going through the ground.

Phase 2 — Feed a horse
Walk up to the horse, press E to feed. Horse has a hunger value that drops
over time and refills when fed. Show hunger as a simple bar above the horse.
Check: the bar visibly drops, I press E, it fills.

Phase 3 — Ride a horse
Press E on a horse to mount; move faster; press E to dismount.
Check: I can ride from the house to the barn noticeably faster than walking.

Phase 4 — Multiple horses + customization + save
Several horses of different kinds, each with its own stats. A barn menu to
change saddle and clothes. Everything persists after refresh.
Check: I customize a horse, refresh the page, the customization is still there.

Phase 5 — Chickens, coins, market stall, store
Chickens with their own feed, a market stall that sells chickens for coins, a
store ~60 seconds' ride away along a scenic road where I buy horse feed.
Check: I sell a chicken, ride to the store, buy feed, ride back, feed a horse.

Phase 6 — Neighbors and trading
3–4 neighbor houses with distinct barns/specialties and a simple trade dialog.
Check: I trade eggs for corn with a neighbor and my inventory updates.

Phase 7 — Breeding + crops
Breed two horses to get a foal with a random coat color. Add one or two
plantable crops.
Check: a foal appears in the barn with a coat color I didn't choose.

Phase 8 — Polish and deploy
Kid-friendly UI, sound toggle, a title screen showing "Natalia and Stella's
Ranch Life", and deploy instructions for Cloudflare Pages.
Check: the game opens from a public URL on my phone and laptop.
