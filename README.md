# Natalia and Stella's Ranch Life

A gentle, low-poly 3D farm game in the browser. Vanilla JavaScript + Three.js from a CDN.
No build tools, no npm install.

## Run locally

1. Open a terminal in this folder.
2. Run: `node serve.js`
3. Open http://localhost:8000 in Chrome or Edge.
4. Press Ctrl+C in the terminal to stop the server.

(If you have Python installed, `python -m http.server 8000` in this folder works too.)

## Deploy to Cloudflare Pages

1. Push this folder to a GitHub repository.
2. In the Cloudflare dashboard: Workers & Pages → Create → Pages → Connect to Git.
3. Pick the repo. Framework preset: **None**. Build command: leave empty.
   Build output directory: `/` (the repo root).
4. Deploy. The game is served exactly as-is from `index.html`.

## Phase status

| Phase | What | Status |
|---|---|---|
| 1 | Walk around | done — ranch yard, house, barn, horse, Natalia + Stella, WASD/arrows, drag-to-look camera |
| 2 | Feed a horse | done — hunger bar above the horse drains over ~90 s, walk up and press E to feed |
| 3 | Ride a horse | done — E to ride / get off (about 2.4x walking speed), F to feed, horse legs animate, Stella keeps up |
| 4 | Multiple horses + customization + save | done — 3 horse kinds with own speed/hunger, barn menu (E at barn door) for saddle + blanket colours, autosave to localStorage, Start over button |
| 5 | Chickens, coins, market stall, store | done — coins + inventory HUD, feed costs feed, chicken coop with eggs and growing chicks, market stall (sell chickens/eggs), ~50 s scenic road to the feed store, compass, all saved |
| 6 | Neighbors and trading | done — four neighbour farms down signposted lanes (Garcia corn, Miller milk, Nguyen wool, Okafor apples), E on foot to trade eggs and goods, new goods on the HUD, market stall buys them, all saved |
| 7 | Breeding + crops | not started |
| 8 | Polish and deploy | not started |
