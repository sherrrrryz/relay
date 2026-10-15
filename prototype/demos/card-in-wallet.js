// Card in wallet
//   hover → the wallet lifts slightly and the card peeks out of the pocket
//   click → the card slides out, swaps in front of the wallet, and settles facing you; click again to tuck it back
//   hover the card while it's out → it slowly frosts over like the Frozen card; move off and it thaws
//   keep hovering once it's fully frozen → it cracks in half (after the Cancelled card); click the pieces to mend it
(function () {
  const root = document.getElementById("ciw");
  const card = root.querySelector(".ciw__card");
  const hint = document.querySelector(".stage__hint");
  const frost = card.querySelector(".ciw__frost");
  const face = card.querySelector(".card__face");
  const wallet = RelayWallet.create("brown", { assetBase: "../assets/figma/wallet" });

  wallet.insertBefore(card, wallet.querySelector(".wallet__top"));
  root.appendChild(wallet);

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Poses. "apex" is where the card has fully cleared the pocket, the only safe moment to change stacking order.
  const CARD = {
    rest:  { y: 0,    rotation: 0,    rotationX: 0,   scale: 1 },
    peek:  { y: -38,  rotation: -1.5, rotationX: 0,   scale: 1 },
    apex:  { y: -205, rotation: -4,   rotationX: -14, scale: 1.04 },
    front: { y: 74,   rotation: 0,    rotationX: 0,   scale: 1.18 },
  };
  const SHADOW_HELD = "drop-shadow(rgba(37, 32, 31, 0.3) 0px 26px 22px)";
  const SHADOW_FLAT = getComputedStyle(card).filter;

  gsap.set(card, { transformPerspective: 900, transformOrigin: "50% 100%", zIndex: 1 });

  // ── Hover peek ──────────────────────────────────────────
  const peek = gsap.timeline({ paused: true, defaults: { duration: 0.55, ease: "back.out(1.6)" } })
    .to(wallet, { y: -8, ease: "power3.out" }, 0)
    .to(wallet.querySelector(".wallet__bg"), {
      boxShadow: "0 8px 16px rgba(0,0,0,0.18), 0 20px 40px rgba(0,0,0,0.28)",
      ease: "power3.out",
    }, 0)
    .to(card, CARD.peek, 0.06);

  if (reduceMotion) peek.duration(0.01);
  window.ciwPeek = peek; // handy for scrubbing in devtools: ciwPeek.progress(0.5)

  // ── Frost ───────────────────────────────────────────────
  gsap.set(face, { filter: "saturate(1) brightness(1) hue-rotate(0deg)" });
  const FREEZE_TIME = 2.6;
  const CRACK_DELAY = 0.6; // seconds to hold on a fully frozen card before it cracks
  let pendingCrack = null;
  const cancelCrack = () => { pendingCrack?.kill(); pendingCrack = null; };

  const freeze = gsap.timeline({
    paused: true,
    // fully frozen and still being hovered → crack after a beat
    onComplete: () => {
      if (open && !broken && card.matches(":hover")) pendingCrack = gsap.delayedCall(CRACK_DELAY, breakCard);
    },
  })
    .to(frost, { opacity: 1, duration: 0.9, ease: "sine.out" }, 0)
    .to(frost, { "--clear": "-35%", duration: FREEZE_TIME, ease: "sine.inOut" }, 0)
    .to(face, { filter: "saturate(0.7) brightness(1.06) hue-rotate(-8deg)", duration: FREEZE_TIME, ease: "sine.inOut" }, 0);

  if (reduceMotion) freeze.duration(0.3);
  window.ciwFreeze = freeze;

  const startFreeze = () => freeze.timeScale(1).play();
  const thaw = (speed = 1.6) => { cancelCrack(); freeze.timeScale(speed).reverse(); };

  // ── Take out / put back ─────────────────────────────────
  let hovered = false;
  let open = false;
  let current = null; // the in-flight open/close timeline, if any

  function takeOut() {
    current?.kill();
    current = gsap.timeline({
      onComplete: () => {
        current = null;
        if (card.matches(":hover")) startFreeze();
      },
    })
      // slide up and out of the pocket, tipping back a touch
      .to(card, { ...CARD.apex, duration: 0.42, ease: "power2.out" })
      // wallet sinks away to make room
      .to(wallet, { y: 22, scale: 0.94, duration: 0.7, ease: "power3.out" }, 0.08)
      // clear of the pocket → bring the card in front
      .set(card, { zIndex: 3 })
      // drop forward and settle facing the viewer
      .to(card, { ...CARD.front, filter: SHADOW_HELD, duration: 0.75, ease: "back.out(1.15)" });
    if (reduceMotion) current.progress(1);
  }

  function putBack() {
    const pose = hovered ? CARD.peek : CARD.rest;
    thaw(3);
    current?.kill();
    current = gsap.timeline({
      onComplete: () => {
        current = null;
        // hand control back to the hover timeline at a matching position
        peek.pause().progress(hovered ? 1 : 0);
      },
    })
      // lift back up above the pocket
      .to(card, { ...CARD.apex, filter: SHADOW_FLAT, duration: 0.5, ease: "power3.inOut" })
      .to(wallet, { y: hovered ? -8 : 0, scale: 1, duration: 0.6, ease: "power3.out" }, 0.18)
      // behind the pocket again
      .set(card, { zIndex: 1 })
      // slide back in
      .to(card, { ...pose, duration: 0.55, ease: "power3.out" });
    if (reduceMotion) current.progress(1);
  }

  // ── Break / mend ────────────────────────────────────────
  // Jagged crack down the middle, as [x%, y%] points from top to bottom
  const CRACK = [[51, 0], [47, 14], [54, 29], [48, 45], [55, 58], [49, 74], [53, 88], [50, 100]];
  const pts = (list) => list.map(([x, y]) => `${x}% ${y}%`).join(", ");
  const CLIP_LEFT = `polygon(0% 0%, ${pts(CRACK)}, 0% 100%)`;
  const CLIP_RIGHT = `polygon(${pts(CRACK)}, 100% 100%, 100% 0%)`;
  const POSE_PROPS = ["x", "y", "rotation", "rotationX", "scale"];

  let broken = null; // { halves: [left, right], shards, pose } while broken

  function cardPose() {
    return Object.fromEntries(POSE_PROPS.map((p) => [p, gsap.getProperty(card, p)]));
  }

  // A layer that sits exactly where the card is, so pieces can move independently of it
  function makeLayer(pose) {
    const layer = document.createElement("div");
    layer.className = "ciw__piece";
    wallet.appendChild(layer);
    gsap.set(layer, { ...pose, transformPerspective: 900, transformOrigin: "50% 100%", zIndex: 3 });
    return layer;
  }

  function makeHalf(pose, clip) {
    const layer = makeLayer(pose);
    const copy = card.cloneNode(true); // carries the current frost + tint inline styles
    copy.classList.remove("ciw__card");
    copy.removeAttribute("style");
    copy.style.clipPath = clip;
    layer.appendChild(copy);
    return layer;
  }

  function makeShards(pose) {
    const layer = makeLayer(pose);
    layer.classList.add("ciw__piece--fx");
    const shards = CRACK.slice(1, -1).flatMap(([x, y]) =>
      [0, 1, 2].map(() => {
        const shard = document.createElement("i");
        shard.className = "ciw__shard";
        gsap.set(shard, { left: `${x}%`, top: `${y}%`, scale: gsap.utils.random(0.45, 1.3), rotation: gsap.utils.random(0, 360) });
        layer.appendChild(shard);
        return shard;
      })
    );
    return { layer, shards };
  }

  function breakCard() {
    pendingCrack = null;
    if (!open || broken || current) return;
    const pose = cardPose();
    current?.kill();
    current = gsap.timeline({ onComplete: () => (current = null) })
      // strain: a quick shudder
      .to(card, { x: "+=3", duration: 0.035, repeat: 7, yoyo: true, ease: "none" })
      .add(() => {
        const halves = [makeHalf(pose, CLIP_LEFT), makeHalf(pose, CLIP_RIGHT)];
        const fx = makeShards(pose);
        gsap.set(card, { visibility: "hidden" });
        const [left, right] = halves;
        const split = gsap.timeline();
        broken = { halves, fx, pose, split };
        split
          .to(left, { x: -30, y: pose.y + 18, rotation: -7, duration: 0.7, ease: "power4.out" }, 0)
          .to(right, { x: 34, y: pose.y + 30, rotation: 6, duration: 0.7, ease: "power4.out" }, 0)
          // then a slow drift, as if they're hanging in the air
          .to(left, { y: "+=6", rotation: "-=1", duration: 1.6, ease: "sine.inOut" }, 0.7)
          .to(right, { y: "+=8", rotation: "+=1", duration: 1.6, ease: "sine.inOut" }, 0.7)
          .to(fx.shards, {
            x: () => gsap.utils.random(-110, 110),
            y: () => gsap.utils.random(-90, 50),
            rotation: () => gsap.utils.random(-240, 240),
            duration: () => gsap.utils.random(0.9, 1.4),
            ease: "power3.out",
          }, 0)
          // shards stay crisp for the burst, then melt away
          .to(fx.shards, { opacity: 0, scale: 0.2, duration: 0.6, ease: "power1.in", stagger: 0.02 }, 0.55);
      });
    hint.textContent = "Click to mend it";
    if (reduceMotion) current.progress(1);
  }

  function mend() {
    const { halves, fx, pose, split } = broken;
    broken = null;
    split.kill();
    thaw(3);
    current?.kill();
    current = gsap.timeline({
      onComplete: () => {
        current = null;
        halves.forEach((h) => h.remove());
        fx.layer.remove();
      },
    })
      .to(halves, { ...pose, duration: 0.55, ease: "power3.inOut" })
      .set(card, { visibility: "visible" })
      .to(halves, { opacity: 0, duration: 0.25 });
    hint.textContent = "Hover the card to freeze it, keep hovering to crack it · click to put it back";
    if (reduceMotion) current.progress(1);
  }

  function activate() {
    if (broken) return mend();
    toggle();
  }

  function toggle() {
    open = !open;
    root.setAttribute("aria-expanded", open);
    hint.textContent = open ? "Hover the card to freeze it, keep hovering to crack it · click to put it back" : "Hover to peek · click to take the card out";
    open ? takeOut() : putBack();
  }

  root.addEventListener("pointerenter", () => {
    hovered = true;
    if (!open && !current) peek.timeScale(1).play();
  });
  root.addEventListener("pointerleave", () => {
    hovered = false;
    if (!open && !current) peek.timeScale(1.4).reverse();
  });
  card.addEventListener("pointerenter", () => { if (open && !current) startFreeze(); });
  card.addEventListener("pointerleave", () => { if (open) thaw(); });
  root.addEventListener("click", activate);
  root.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); }
    if (e.key === "Escape") broken ? mend() : open && toggle();
  });
})();
