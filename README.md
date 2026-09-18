# Natalia and Stella's Ranch Life

A gentle, low-poly 3D farm game in the browser. Vanilla JavaScript + Three.js from a CDN.
No build tools, no npm install. Plays with keyboard + mouse on a laptop and with
thumbs on a phone or tablet.

## Run locally

1. Open a terminal in this folder.
2. Run: `node serve.js`
3. Open http://localhost:8000 in Chrome or Edge.
4. Press Ctrl+C in the terminal to stop the server.

(If you have Python installed, `python -m http.server 8000` in this folder works too.)

### Try the phone controls without a phone

- Open http://localhost:8000/?touch=1 — the `?touch=1` forces the thumb controls on.
  Hold the mouse down on the left half and drag to walk; drag on the right half to look.
- Or in Chrome press F12, click the little phone icon (Ctrl+Shift+M), pick a phone,
  and reload.

### Try it on a real phone before deploying (same Wi-Fi)

1. With `node serve.js` running, run `ipconfig` on the laptop and find the Wi-Fi
   IPv4 address (something like `192.168.1.23`).
2. On the phone open `http://192.168.1.23:8000` (your number, keep the `:8000`).
3. If nothing loads, Windows Firewall is blocking Node: allow it on Private networks.

## Deploy to Cloudflare Pages

The folder deploys exactly as it is. There is no build step.

1. Push this folder to GitHub (`git push`). The repo is
   `franciskoa/natalia-and-stellas-ranch-life`.
2. Go to https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages**
   → **Connect to Git**, and pick the repo. (If the dashboard opens on the Workers
   tab, look for the "Pages" tab or "Looking to deploy Pages? Get started" link.)
3. Settings: Production branch `main` · Framework preset **None** · Build command
   **leave empty** · Build output directory **/**
4. Press **Save and Deploy**. After about a minute you get a public address like
   `https://natalia-and-stellas-ranch-life.pages.dev`.
5. Open that address on the laptop and on the phone. Every later `git push`
   redeploys by itself.

Good to know:

- `_headers` is a Cloudflare Pages settings file, not part of the game. It tells
  browsers to check for a new version on each visit, so a phone never ends up with
  half of yesterday's game. Keep it in the project root.
- Cloudflare is case-sensitive about file names and Windows is not: `./js/Horse.js`
  would work here and break there. Keep every file name lowercase.
- Three.js comes from cdn.jsdelivr.net, so the first load needs internet. Everything
  else (art, sounds, icons) is made in code. `serve.js` is only for local play;
  Pages ignores it.
- The save lives in each browser's own storage. The ranch saved on the laptop does
  not appear on the phone, and the other way round. That is expected.

## Controls

| | Laptop | Phone / tablet |
|---|---|---|
| Walk / ride | W A S D or arrow keys | left thumb: joystick (appears where you press) |
| Look | drag the mouse | right thumb: drag |
| Use, ride, open, plant, pick, trade | E | big green button |
| Feed, plant carrots | F | amber button |
| Menu | Esc or ☰ | ☰ |
| Sound on/off | 🔊 button | 🔊 button |

## Phase status

| Phase | What | Status |
|---|---|---|
| 1 | Walk around | done — ranch yard, house, barn, horse, Natalia + Stella, WASD/arrows, drag-to-look camera |
| 2 | Feed a horse | done — hunger bar above the horse drains over ~90 s, walk up and press F to feed |
| 3 | Ride a horse | done — E to ride / get off (about 2.4x walking speed), F to feed, horse legs animate, Stella keeps up |
| 4 | Multiple horses + customization + save | done — 3 horse kinds with own speed/hunger, barn menu (E at barn door) for saddle + blanket colours, autosave to localStorage, Start over button |
| 5 | Chickens, coins, market stall, store | done — coins + inventory HUD, feed costs feed, chicken coop with eggs and growing chicks, market stall (sell chickens/eggs), ~50 s scenic road to the feed store, compass, all saved |
| 6 | Neighbors and trading | done — four neighbour farms down signposted lanes (Garcia corn, Miller milk, Nguyen wool, Okafor apples), E on foot to trade eggs and goods, new goods on the HUD, market stall buys them, all saved |
| 7 | Breeding + crops | done — barn menu "Foals": pick a mum and dad, a foal with a surprise coat (11 coats) is born by the barn, grows up in ~4 min, then rideable; vegetable garden with 6 plots for corn and carrots (E/F to plant, E to pick), seeds at the store, carrots sell at the stall and work as a horse treat, all saved |
| 8 | Polish and deploy | game side done — title screen, Esc/☰ pause menu, synthesised sounds with a 🔊 toggle, kid-friendly icons, phone layout, touch controls (joystick + action buttons), Cloudflare `_headers`. Remaining: push to GitHub and connect Cloudflare Pages (steps above) |
