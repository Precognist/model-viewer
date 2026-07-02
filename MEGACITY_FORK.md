# MCS Model Viewer — MegaCity.Studio fork

Fork of **PlayCanvas model-viewer** (MIT) → the **deck-asset showroom** for megacity.studio. It views
a deck card's 3D asset (orbit / animation / environment / inspect) and presents it as a **collectible
card**. `upstream` remote = `playcanvas/model-viewer` (pull engine/PCUI updates). Owner: **CLAUDE.Design**
(see `../CLAUDE_DESIGN.md`).

## Why this instead of building a viewer
The model-viewer already does the hard part (glTF/GLB + splats, orbit cam, anim playback, env, node
inspect) and its **controls are built in PCUI** — the exact toolkit we chose (`../simulacrum-pc-viewer/
PCUI_EVAL.md`). So this is a **reskin + control redesign + card framing**, not a rebuild.

## Redesign surface (where to work)
- **Brand:** `static/` (logo/favicon/skybox/icons), `src/index.html` (title/meta), `src/manifest.json`.
- **Theme:** `src/style.scss` + `src/fonts.css` → the MegaCity tokens (gold/mono/dark; see the design
  system in `../simulacrum-pc-viewer/src/App.css`). Extract a shared token set.
- **Controls / UI (PCUI-React):** `src/ui/` — `left-panel/`, `load-controls.tsx`, `popup-panel/`,
  `selected-node.tsx`, `components/`. Redesign for clarity + brand.
- **Viewer core (leave mostly alone):** `src/viewer.ts`, `src/camera-controls.ts`, `src/app.ts`.

## To add (MCS-specific)
1. **Card framing** — an overlay/panel presenting the asset as a card: name, deck, **rarity tier**,
   poly/anim/material metadata (from the deck's `deck.json`).
2. **Deck-asset loading** — load by `?load=<deck art url>` from the `decks/` repo (art cards are GLBs).
3. **Embed hook** — a clean way to drop this into megacity.studio (iframe/route + `?load=`).

## Run
```
npm install
npm run develop     # rollup watch + serve on localhost:3000
# load an asset: http://localhost:3000/?load=<glb url>
```

## UI direction — Marmoset Toolbag viewer (Doug)
Target the feel of **Marmoset Toolbag's viewer**: a pro look-dev tool — **viewport-centric**, dark and
flat, **docked side panels** (scene/hierarchy one side, properties/material/render the other) instead of
scattered floating popups, a slim **top toolbar** for view/render/lighting, and restrained, legible
controls. The card overlay reads as a clean Marmoset-style **info/property panel** (name / deck /
rarity / poly·anim·material stats). Keep it premium and calm — not the busy default model-viewer chrome.

## Status
- Forked + oriented + **primed** (2026-07-01, builds clean).
- **Tokens matched to the LIVE megacity.group/stack CSS** (dark + light: ink/panel/gold/alpha/building/
  planned/live, --card-grad, --glow1/2, --grid, --grain, --shadow; Archivo variable + IBM Plex Mono).
- **Next (CLAUDE.Design):** the Marmoset-style layout redesign (dock the panels + top toolbar), the
  card framing (reuse the stack's `.card`/`.card-name`/`.card-idx`/`.card-desc` design + `--card-grad`),
  logo/favicon swap, and deck-asset loading (`?load=`).
