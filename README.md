# Relay

Relay <> FoF Activity Kit design project.

## Wallet motion study

A small three.js scene built from the Relay business-debit assets: a black leather wallet and the card.
Tap the wallet and the card tumbles in the air, lands flat above the pocket opening and slides in.
Tap again to take it back out.

- `index.html` — the whole scene (three.js loaded from cdnjs, no build step)
- `assets/` — wallet SVG and card renders

Run locally with any static server, for example:

```bash
python3 -m http.server 8090
```

then open http://localhost:8090.
