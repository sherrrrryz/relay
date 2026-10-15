// Minimal tabs: the active tab lives in the URL hash so refreshes keep your place.
(function () {
  const tabs = [...document.querySelectorAll(".tabs__tab")];

  function select(name) {
    if (!tabs.some((t) => t.dataset.tab === name)) name = tabs[0].dataset.tab;
    for (const tab of tabs) {
      const on = tab.dataset.tab === name;
      tab.setAttribute("aria-selected", on);
      tab.tabIndex = on ? 0 : -1;
      document.getElementById(tab.getAttribute("aria-controls")).hidden = !on;
    }
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => { location.hash = tab.dataset.tab; });
    tab.addEventListener("keydown", (e) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!step) return;
      const next = tabs[(i + step + tabs.length) % tabs.length];
      next.focus();
      location.hash = next.dataset.tab;
    });
  });

  addEventListener("hashchange", () => select(location.hash.slice(1)));
  select(location.hash.slice(1));
})();
