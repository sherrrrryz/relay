# Relay

Relay <> Friends of Figma activity kit: take a static Relay card and turn it into an interactive element.

## Run it

CSS masks don't load over `file://`, so serve the repo instead of opening the HTML directly:

```sh
python3 -m http.server 8000
# → http://localhost:8000/prototype/
```

## Design system

Pulled from the Figma file "Relay <> FoF Activity Kit (Copy) (Copy)", page **01 - START HERE**.

| Path | What's in it |
| --- | --- |
| `tokens/tokens.css` | Colour, type, space, radius and shadow tokens (names mirror the Figma variables) |
| `components/card.css` | Card in four states: `.card--front`, `--back`, `--cancelled`, `--frozen` |
| `components/wallet.css` + `wallet.js` | Leather wallet in six colours: tan, brown, green, navy, plum, black |
| `assets/figma/` | Exported SVG/PNG layers for the cards, wallets and icons |
| `prototype/index.html` | Gallery of every component, the starting point for experiments |

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

## Other folders

`research/`, `explorations/`, `specs/` hold notes, sketches and handoff specs.
