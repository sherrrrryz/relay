# Relay

Relay <> Friends of Figma activity kit: take a static Relay card and turn it into an interactive element.

## Run it

CSS masks don't load over `file://`, so serve the repo instead of opening the HTML directly:

```sh
python3 -m http.server 8000
# → http://localhost:8000/prototype/
```

The prototype has four tabs: **Gallery**, **Card in wallet** (GSAP), **Card drop (3D)** (three.js) and **Manuela's portfolio**.
To rebuild the portfolio tab after editing its source: `cd experiments/manuela-portfolio && npm install && npx vite build --base ./ --outDir ../../prototype/manuela` (then make the four `/textures/` URLs in the bundle relative, as the committed build does).

## Design system

Pulled from the Figma file "Relay <> FoF Activity Kit (Copy) (Copy)", page **01 - START HERE**.

| Path | What's in it |
| --- | --- |
| `tokens/tokens.css` | Colour, type, space, radius and shadow tokens (names mirror the Figma variables) |
| `components/card.css` | Card in four states: `.card--front`, `--back`, `--cancelled`, `--frozen` |
| `components/wallet.css` + `wallet.js` | Leather wallet in six colours: tan, brown, green, navy, plum, black |
| `assets/figma/` | Exported SVG/PNG layers for the cards, wallets and icons |
| `prototype/index.html` | Gallery of every component, the starting point for experiments |
| `prototype/demos/card-drop.js` + `assets/wallet.svg`, `assets/card-*.png` | three.js card-drop demo: tap the wallet and the card tumbles in and slides into the pocket (also served standalone from `index.html` at the repo root) |
| `experiments/manuela-portfolio/` → `prototype/manuela/` | Manuela's portfolio animation, a standalone Vite + three.js app (source → built output); shown in the prototype's fourth tab in a frame |

**Fonts:** Basis Grotesque Pro and Tobias are licensed and aren't in the repo. Add the files under `assets/fonts/` with `@font-face` rules; until then the tokens fall back to Helvetica/Georgia.

**Frozen card:** the frost layer's blend and blur are approximated (`mix-blend-mode: screen` + `backdrop-filter: blur(2px)`). Figma didn't export the exact values.

## Interaction ideas (from the kit)

| Easy | Medium | Hard |
| --- | --- | --- |
| Tilt on hover | Slide out of wallet | Interactive card stack |
| Flip card | Tap → reveal details | Fanned card stack |
| Glow on hover | Freeze / unfreeze animation | Card customization interaction |
| Spin | Card activation | Build your own idea! |

Time: 30 minutes. The goal isn't perfection. Experiment with prompting, iterate, and see how quickly you can go from idea to working interaction.

## Wallet motion study

A small three.js scene built from the Relay business-debit assets: a black leather wallet and the card.
Tap the wallet and the card tumbles in the air, lands flat above the pocket opening and slides in.
Tap again to take it back out.

- `index.html` — the whole scene (three.js loaded from cdnjs, no build step)
- `assets/card-front.png`, `assets/card-back.png`, `assets/wallet.svg` — wallet SVG and card renders

Run locally with any static server, for example:

```bash
python3 -m http.server 8090
```

then open http://localhost:8090.

## Other folders

`research/`, `explorations/`, `specs/` hold notes, sketches and handoff specs.
