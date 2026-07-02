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

## UI SPEC — the minimal Marmoset **Viewer** (Doug, from reference images in his Downloads)
NOT the Toolbag *app* (no toolbar, no docks, no scene-tree). The **embeddable Marmoset Viewer**:
clean full viewport + gradient bg, everything else is minimal overlays.

- **Top-right button column** (vertical icon stack; the model title sits above it):
  1. **Logo** (top) — the MegaCity light mark (`static/mcs-logo.png`) — **click → megacity.studio**.
  2. **Fullscreen** toggle.
  3. **Passes** — toggles the material-pass view: a diagonal wipe across the model labeled
     **Normals · Albedo · Reflectivity · Gloss · Topology** (Topology = wireframe), with
     **Triangles / Vertices** stats bottom-left. *(Advanced — real render passes.)*
  4. **Help** — opens the modal.
- **Bottom: animation play-controls bar** (full width): speed (1.0x) left · **play/pause** · **scrub
  timeline** with a playhead · **bottom-right = the animation dropdown** (pick the clip, e.g. "Flying Idle").
- **Help modal** (rebrand Marmoset's): control legend — **rotate** (LMB drag) · **zoom** (wheel) ·
  **reset camera** (dbl-click) · **rotate lights** (shift+drag); MegaCity wordmark + megacity.studio link.
  **NO "move"** — Doug: *rotation + zoom only*.
- **Camera: ORBIT ONLY** — rotate + zoom. **No WASD / move / fly / directional.** Remove fly mode.
- **Strip:** the left scene/settings panel + header (viewer shows ONE deck asset — no tree needed).
- **Card framing (MCS-specific):** the title area carries deck-card metadata (name / deck / rarity),
  reusing the stack's `.card`/`.card-name`/`.card-idx`/`.card-desc` design + `--card-grad`.

## Status
- Forked + **primed** + **tokens matched to the live megacity.group/stack CSS** (dark+light).
- **DONE (2026-07-02):** logo → `static/mcs-logo.png` (the light mark); **header removed**; the
  toolbar+docks rough-in was dropped (wrong Marmoset — it's the Viewer, not the app).
- **NEXT (CLAUDE.Design polish):** build the top-right button column (logo→web / fullscreen / passes /
  help), the passes render mode, the branded help modal, the bottom anim bar + dropdown, orbit-only
  camera, strip the left panel, and the card framing. Skin/tokens/logo are in place.
