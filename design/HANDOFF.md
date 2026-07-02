# Handoff: MegaCity Deck Viewer (Marmoset-style embed)

## Overview
A redesign of the MegaCity.Studio Deck Viewer — a fork of PlayCanvas `model-viewer` (repo: `Precognist/model-viewer`, PlayCanvas engine + PCUI/React). It presents ONE 3D asset ("a card in a deck") that buyers orbit and inspect. The design targets a minimal Marmoset-Viewer-style embed: the model fills the viewport; all UI is a quiet overlay. Calm, premium, pro look-dev. **No** top toolbar, no left scene tree, no docked panels, no header.

## About the Design Files
`Deck Viewer.dc.html` is a **design reference created in HTML** — an interactive prototype showing intended look and behavior, not production code. The task is to **recreate this design inside the existing fork** (`src/ui/*` PCUI/React components, `src/style.scss`, `src/viewer.ts`), reusing its observer-driven state (`observer.set('animation.playing', …)` etc.) and existing render-pass debug modes. The prototype's "model" is a CSS cube stand-in; in production it is the real PlayCanvas canvas.

## Fidelity
**High-fidelity** for all overlay UI (colors, type, spacing, states are final — recreate pixel-perfectly). The cube/backdrop is a stand-in; keep the real engine rendering, but match the backdrop tone.

## Design Tokens
- ink (page bg) `#090c12` · panel `#0f141d` (overlays use `rgba(15,20,29,0.85)` + `backdrop-filter: blur(6px)`)
- gold `#d6a64b` · gold-soft `#e8c684` · text `#e7ecf6` · dim `#8a93a8` · live `#4dc08c`
- hairline `rgba(176,194,228,0.12)` (borders); track line `rgba(176,194,228,0.16)`
- gold tints: bg `rgba(214,166,75,0.08)`, border `rgba(214,166,75,0.25)`, hover border `rgba(214,166,75,0.55)`
- Type: **Archivo** (UI/body; Google Fonts 400–700), **IBM Plex Mono** (labels/meters/stats; 400/500)
- Radii: overlay buttons 8px, bar controls 6px, modal 14px, chips 5px
- Backdrop: `radial-gradient(140% 110% at 50% 18%, #141a27 0%, #0b0f17 52%, #05070b 100%)` + bottom scrim `linear-gradient(to top, rgba(3,4,7,0.55), transparent)` over lower 34%

## Screens / Views

### 1. Viewer (default)
- **Viewport**: full-window canvas. Cursor `grab` / `grabbing` while dragging.
- **Top-left — model stats** (visible in Passes mode in the prototype; position fixed at `left:22px; top:20px`): IBM Plex Mono 12px, `letter-spacing:0.08em`, line-height 1.9, labels in dim `#8a93a8`, values in gold-soft `#e8c684`. Rows: TRIANGLES, VERTICES, FACES, BONES.
- **Top-right — title block** (`top:18px; right:18px`, right-aligned):
  - Asset name: Archivo 600 15px `#e7ecf6`
  - Meta line: Plex Mono 10px, `letter-spacing:0.14em`, dim; deck name + `MEGACITY.STUDIO` link in gold `#d6a64b`, no underline.
- **Top-right — vertical icon column** (below title, gap 8px; buttons 42×42, bg `rgba(15,20,29,0.85)`, 1px hairline border, radius 8, blur 6; hover: border `rgba(214,166,75,0.55)`):
  1. **Logo** — MegaCity light mark (24px img), links to `https://megacity.studio` (new tab)
  2. **Fullscreen** — 4 corner brackets, 1.5px stroke `#e7ecf6`; toggles `requestFullscreen`
  3. **Passes** — 5 diagonal 1.5px strokes; active state = 1px `#d6a64b` inset ring overlay
  4. **Help** — "?" Plex Mono 15px; opens modal
- **Bottom — animation bar** (full width, `padding:14px 18px 16px`, flex, gap 14):
  - Speed button: Plex Mono 12px, min-width 52, h 32; click cycles 0.5× → 1.0× → 1.5× → 2.0×
  - Play/pause: 32×32; pause = two 3×11px bars, play = triangle; Space also toggles
  - Scrub track (flex:1, 28px hit area): 2px line; progress fill `linear-gradient(90deg, rgba(214,166,75,0.35), #d6a64b)`; playhead 11px circle `#e8c684` with `0 0 0 3px rgba(214,166,75,0.22), 0 0 12px rgba(214,166,75,0.45)` glow. Click/drag seeks (pauses advance while scrubbing).
  - Clip dropdown (far right): Plex Mono 12px button (h 32) with ▲ caret in dim 9px; menu opens **upward** (`bottom:40px`, panel `#0f141d`, hairline border, radius 8, padding 5, shadow `0 12px 32px rgba(0,0,0,0.5)`); items 8px/12px padding, radius 5, hover bg `rgba(176,194,228,0.07)`, active item in gold-soft.

### 2. Passes mode (material inspection wipe)
Maps to the fork's existing debug render passes. Eleven slanted slices across the viewport, left→right, each showing the model in one pass:
`Default, Lighting, Albedo, Emissive, WorldNormal, Metalness, Gloss, Ao, Specularity, Opacity, Uv0`.
- **Geometry**: divider line *i* (i = 0…10) crosses `x = (8 + i·8.2)%` at mid-height, slanted ±10vh over the viewport height (≈11.31° from vertical, top leaning right). Each slice is the region between consecutive lines (first/last extend offscreen). Prototype uses `clip-path: polygon(calc(X% ± 10vh) …)` per slice; production can use scissor rects/stencil or per-slice viewport re-render.
- **Divider lines**: 1px, `rgba(176,194,228,0.26)`.
- **Labels**: pass name per line, Plex Mono 12px `letter-spacing:0.10em`, `rgba(231,236,246,0.78)` with `text-shadow: 0 1px 8px rgba(0,0,0,0.6)`; vertical writing (`writing-mode:vertical-rl`), anchored to the line, **bottom-aligned** at 145px above the viewport bottom (clears anim bar + speed button).
- **Stats readout**: top-left (see above).
- **Animations (JS-driven, not CSS transitions — the 60fps render loop clobbers CSS transitions on inline styles)**:
  - *Fly-in*: on activation, every slice + its divider starts 130% offscreen right and eases to place, easeOutCubic 0.6s, 45ms stagger per slice; labels fade in riding their line.
  - *Expand*: clicking a slice tweens it to full-bleed while slices left of it exit −280% and right of it +280% (exponential ease toward target, ~0.35s feel); dividers/labels fade+slide out. A chip appears top-center: `rgba(15,20,29,0.85)` bg, gold border `rgba(214,166,75,0.35)`, radius 7 — pass name in gold-soft Plex Mono 12px `0.14em` + `CLICK TO SHOW ALL PASSES` in dim 10px.
  - *Collapse*: clicking again reverses the tween back to the spread.
  - Click vs drag: a click only registers if cumulative pointer movement ≤ 6px (orbit drags don't trigger expand). Pointer capture engages only after ~4px of movement so clicks pass through.

### 3. Help modal
Centered overlay: scrim `rgba(4,6,10,0.62)` + blur 4px; click scrim or ✕ or Esc closes.
- Panel: 400px (max `100vw−48px`), `#0f141d`, hairline border, radius 14, padding `30px 32px 26px`, shadow `0 24px 80px rgba(0,0,0,0.6)`.
- ✕ top-right (30×30, Plex Mono 14px, dim → text on hover).
- `CONTROLS` eyebrow: Plex Mono 10px `0.22em` dim.
- Legend grid (2 cols, gaps 10/16): gold chip (Plex Mono 11px `0.08em` gold-soft on gold-tint bg/border, radius 5, padding 5px 9px) + Archivo 14px label:
  - `LEFT DRAG` Rotate · `SCROLL` Zoom · `DOUBLE CLICK` Reset camera · `SHIFT + DRAG` Rotate lights
  - **No move/pan** — rotate + zoom only.
- Hairline divider, then centered: mark (34px) · `MEGACITY VIEWER` Archivo 700 17px `0.30em` (VIEWER in gold) · `MEGACITY.STUDIO` link, Plex Mono 11px dim → gold-soft on hover.

## Interactions & Behavior (viewport)
- Left-drag orbit: yaw += dx·0.4°, pitch −= dy·0.3° clamped ±80°
- Scroll zoom: multiplicative `exp(−deltaY·0.0011)`, clamped 0.45–2.6
- Double-click: reset camera (and light) to defaults
- Shift+drag: rotate light rig, dx·0.5°
- Esc: closes modal/menu/expanded pass · Space: play/pause

## State Management
Map to the fork's observer keys: `animation.playing`, `animation.speed`, `animation.progress`, `animation.selectedTrack`, plus new `debug.passesMode` (bool) and `debug.expandedPass` (string|null). Fullscreen and help-modal are local UI state. Remove/hide: left panel, load controls, selected-node panel, popup buttons other than the four icon-column actions.

## Repo mapping (Precognist/model-viewer)
- `src/ui/index.tsx` — drop `#panel-left`, `LoadControls`, `SelectedNode` from the embed layout; overlay lives in `#canvas-wrapper`.
- `src/ui/popup-panel/animation-controls.tsx` — replace with the full-width bottom bar (speed cycle button instead of `NakedSelect`; keep observer wiring; clip select becomes the upward menu, far right).
- New `src/ui/passes-overlay.tsx` — slice geometry, labels, stats, expand/collapse; drive slice animation from rAF, not CSS transitions.
- New `src/ui/help-modal.tsx` and icon column component.
- `src/style.scss` — replace the pcui-grey overrides (`#FAD961` accents, `rgba(64,64,64,0.6)` panels, Proxima Nova) with the tokens above; load Archivo + IBM Plex Mono in `src/fonts.css`.
- `src/viewer.ts` — expose the 11 debug pass renders for the wipe (scissored re-renders per slice, or a composite shader).

## Assets
- `assets/mc-mark-light.png` — MegaCity light mark (white on transparent, 1024²), supplied by MegaCity. Use on dark only.
- Icons (fullscreen brackets, passes stripes) are inline 16×16 SVG strokes — recreate or replace with the repo's icon system.
- Fonts from Google Fonts: Archivo, IBM Plex Mono.

## Files
- `Deck Viewer.dc.html` — the interactive prototype (open in the design tool for live behavior; all styles are inline and match this README).
- `assets/mc-mark-light.png` — logo mark.
