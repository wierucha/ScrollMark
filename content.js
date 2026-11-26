(() => {
  if (window.__scrollmarkInstalled) return;
  window.__scrollmarkInstalled = true;

  let lastContextPoint = null;
  document.addEventListener("contextmenu", (event) => {
    lastContextPoint = {
      x: event.clientX,
      y: event.clientY,
      target: event.target
    };
  }, true);

  function cssPath(el) {
    if (!(el instanceof Element)) return null;
    const parts = [];
    let node = el;
    while (node && node.nodeType === Node.ELEMENT_NODE) {
      let part = node.localName;
      if (node.id && document.querySelectorAll("#" + CSS.escape(node.id)).length === 1) {
        parts.unshift(part + "#" + CSS.escape(node.id));
        break;
      }
      const parent = node.parentElement;
      if (parent) {
        const same = [...parent.children].filter(x => x.localName === node.localName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      node = parent;
    }
    return parts.join(" > ");
  }

  function normalize(el) {
    return (el?.innerText || el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function getAnchor(source) {
    let el = null;
    let point = null;
    if (source === "context" && lastContextPoint) {
      el = lastContextPoint.target instanceof Element ? lastContextPoint.target : lastContextPoint.target?.parentElement;
      point = lastContextPoint;
    } else {
      const x = Math.min(Math.max(8, window.innerWidth / 3), window.innerWidth - 8);
      const y = Math.min(100, Math.max(8, window.innerHeight / 3));
      el = document.elementFromPoint(x, y);
      point = { x, y };
    }
    if (!el) return {};
    const rect = el.getBoundingClientRect();
    return {
      selector: cssPath(el),
      text: normalize(el).slice(0, 240),
      offsetInElement: Math.max(0, point.y - rect.top),
      viewportY: point.y
    };
  }

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type === "PING") return Promise.resolve({ ok: true });
    if (message?.type === "SAVE_POSITION") {
      const anchor = getAnchor(message.source);
      const record = {
        id: crypto.randomUUID(),
        url: location.href,
        title: document.title || location.hostname,
        savedAt: Date.now(),
        scrollY: window.scrollY,
        ...anchor
      };
      return browser.storage.local.get({ scrollmarks: [] }).then(({ scrollmarks }) =>
        browser.storage.local.set({ scrollmarks: [record, ...scrollmarks] }).then(() => ({ ok: true, record }))
      );
    }
  });

  function findByText(text) {
    let best = null;
    let bestLength = Infinity;
    const candidates = document.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, td, figcaption, article, section, div, span");
    for (const el of candidates) {
      const t = normalize(el);
      // The smallest element containing the text is the original anchor, not a wrapper around it.
      if (t.length < bestLength && t.includes(text)) {
        best = el;
        bestLength = t.length;
      }
    }
    return best;
  }

  // Briefly outline the restored spot so it's obvious where you landed.
  function highlight(el) {
    if (el === document.body || el === document.documentElement) return;
    if (el.getBoundingClientRect().height > window.innerHeight * 0.9) return;
    el.animate([
      { outline: "3px solid rgba(255, 190, 0, .95)", outlineOffset: "3px", backgroundColor: "rgba(255, 210, 0, .28)" },
      { outline: "3px solid rgba(255, 190, 0, 0)", outlineOffset: "3px", backgroundColor: "rgba(255, 210, 0, 0)" }
    ], { duration: 2200, easing: "ease-out" });
  }

  async function restore(record) {
    const maxWait = 9000;
    const started = Date.now();
    let found = null;

    // Allow images, fonts and client-rendered content to settle before locating the anchor.
    while (Date.now() - started < maxWait) {
      if (record.selector) {
        try { found = document.querySelector(record.selector); } catch (_) {}
      }
      if (!found && record.text) found = findByText(record.text);
      if (found) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }

    if (found) {
      const rect = found.getBoundingClientRect();
      const offset = Math.min(record.offsetInElement || 0, Math.max(0, rect.height - 1));
      window.scrollTo({ top: Math.max(0, rect.top + window.scrollY + offset - (record.viewportY || 100)), behavior: "instant" });
      highlight(found);
    } else {
      window.scrollTo({ top: record.scrollY || 0, behavior: "instant" });
    }
  }

  // If this tab was opened from the ScrollMark list, the background script has a position waiting.
  browser.runtime.sendMessage({ type: "GET_PENDING_RESTORE" }).then((record) => {
    if (record) restore(record);
  }).catch(() => {});
})();
