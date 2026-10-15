/*
 * RelayWallet.create(colour, { assetBase }) → <div class="wallet wallet--{colour}">
 * Builds the layered wallet markup from components/wallet.css.
 * The tan wallet has its own stitch/stroke/mask exports; the rest share one set.
 */
(function () {
  const COLOURS = ["tan", "brown", "green", "navy", "plum", "black"];

  function create(colour = "tan", { assetBase = "../assets/figma/wallet" } = {}) {
    const a = (name) => `${assetBase}/${name}`;
    const shared = colour === "tan" ? "-tan" : "";
    const el = document.createElement("div");
    el.className = `wallet wallet--${colour}`;
    el.innerHTML = `
      <div class="wallet__bg"></div>
      <div class="wallet__flap"><img src="${a(`flap-${colour}.svg`)}" alt=""></div>
      <div class="wallet__leather"><img src="${a("leather-texture.png")}" alt=""></div>
      <div class="wallet__stitch wallet__stitch--light"><img src="${a(`stitch-light${shared}.svg`)}" alt=""></div>
      <div class="wallet__stitch wallet__stitch--dark"><img src="${a(`stitch-dark${shared}.svg`)}" alt=""></div>
      <div class="wallet__top">
        <div class="wallet__top-flap"><img src="${a(`top-flap-${colour}.svg`)}" alt=""></div>
        <div class="wallet__top-texture"><img src="${a("leather-texture.png")}" alt=""></div>
        <div class="wallet__stroke wallet__stroke--highlight-low"><img src="${a(`stroke-highlight${shared}.svg`)}" alt=""></div>
        <div class="wallet__stroke wallet__stroke--shadow"><img src="${a(`stroke-shadow${shared}.svg`)}" alt=""></div>
        <div class="wallet__stroke wallet__stroke--highlight-top"><img src="${a(`stroke-highlight${shared}.svg`)}" alt=""></div>
      </div>`;
    return el;
  }

  window.RelayWallet = { COLOURS, create };
})();
