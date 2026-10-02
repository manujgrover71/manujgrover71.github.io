// Site behaviour: theme toggle, copy buttons, [?] toggles, tabs.

const root = document.documentElement;
const media = matchMedia("(prefers-color-scheme: dark)");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

// ---- Theme: system -> light -> dark ----

const THEME_ORDER = ["system", "light", "dark"];

function applyTheme(pref) {
  const dark = pref === "dark" || (pref === "system" && media.matches);
  const theme = dark ? "dark" : "light";
  const changed = root.dataset.theme !== theme;
  root.dataset.themePref = pref;
  root.dataset.theme = theme;
  const next = THEME_ORDER[(THEME_ORDER.indexOf(pref) + 1) % THEME_ORDER.length];
  document.querySelectorAll("[data-theme-toggle]").forEach((b) => {
    b.setAttribute("aria-label", `Theme: ${pref} (click to switch to ${next})`);
  });
  if (changed) document.dispatchEvent(new CustomEvent("themechange", { detail: { theme } }));
}

applyTheme(root.dataset.themePref || "system");

document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
  button.addEventListener("click", () => {
    const pref = root.dataset.themePref || "system";
    const next = THEME_ORDER[(THEME_ORDER.indexOf(pref) + 1) % THEME_ORDER.length];
    try {
      localStorage.setItem("theme", next);
    } catch (e) {}
    applyTheme(next);
  });
});

media.addEventListener("change", () => {
  if (root.dataset.themePref === "system") applyTheme("system");
});

// ---- Sticky header bar ----
// Shows the compact bar once the page header has scrolled completely above the viewport.

const stickyNav = document.querySelector("[data-sticky-nav]");
const stickyTrigger = document.querySelector("[data-sticky-trigger]");

if (stickyNav && stickyTrigger && "IntersectionObserver" in window) {
  new IntersectionObserver(([entry]) => {
    const show = !entry.isIntersecting && entry.boundingClientRect.top < 0;
    stickyNav.classList.toggle("is-visible", show);
    stickyNav.inert = !show;
  }).observe(stickyTrigger);
}

// ---- Hover tick ----
// A 25 ms burst of band-passed white noise when a mouse enters a [data-tick] element.
// Browsers keep audio muted until the visitor has clicked or tapped the page once.

let audio;

function tick() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  audio = audio || new AC();
  if (audio.state === "suspended") audio.resume();

  const length = Math.round(audio.sampleRate * 0.025);
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

  const t = audio.currentTime;
  const source = audio.createBufferSource();
  const filter = audio.createBiquadFilter();
  const gain = audio.createGain();
  source.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(2800, t);
  filter.Q.setValueAtTime(1.1, t);
  gain.gain.setValueAtTime(0.4, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
  source.connect(filter).connect(gain).connect(audio.destination);
  source.start(t);
}

document.querySelectorAll("[data-tick]").forEach((el) => {
  el.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "mouse") tick();
  });
});

// ---- Clipboard ----

function flashDone(el) {
  el.classList.add("is-done");
  clearTimeout(el._doneTimer);
  el._doneTimer = setTimeout(() => el.classList.remove("is-done"), 1600);
}

// "Copy email": a mailto link that copies instead when the clipboard is available.
document.querySelectorAll("[data-copy]").forEach((el) => {
  el.addEventListener("click", async (event) => {
    if (!navigator.clipboard) return;
    event.preventDefault();
    try {
      await navigator.clipboard.writeText(el.dataset.copy);
      flashDone(el);
    } catch (e) {
      window.location.href = el.href;
    }
  });
});

// Code blocks: copy the code without line numbers.
document.querySelectorAll("[data-copy-code]").forEach((button) => {
  button.addEventListener("click", async () => {
    const code = button.closest(".code")?.querySelector("pre code");
    if (!code || !navigator.clipboard) return;
    const lines = code.querySelectorAll(".src");
    const text = lines.length ? [...lines].map((l) => l.textContent).join("") : code.textContent;
    try {
      await navigator.clipboard.writeText(text.replace(/\n$/, ""));
      flashDone(button);
    } catch (e) {}
  });
});

// ---- [?] toggles ----

const CONFETTI_COLORS = ["#f5c542", "#ff6b6b", "#4dabf7", "#69db7c", "#da77f2", "#ffa94d"];

function confetti(from) {
  if (reducedMotion.matches) return;
  const rect = from.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  for (let i = 0; i < 48; i++) {
    const piece = document.createElement("span");
    piece.className = "confetti";
    if (i % 8 === 0) {
      piece.textContent = i % 16 === 0 ? "🏆" : "✨";
      piece.classList.add("confetti--emoji");
    } else {
      piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    }
    piece.style.left = `${x}px`;
    piece.style.top = `${y}px`;
    document.body.appendChild(piece);

    const angle = Math.random() * Math.PI * 2;
    const speed = 80 + Math.random() * 160;
    const dx = Math.cos(angle) * speed;
    const dy = Math.sin(angle) * speed - 120;
    const spin = (Math.random() - 0.5) * 720;
    piece
      .animate(
        [
          { transform: "translate(-50%, -50%) rotate(0deg)", opacity: 1 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${spin / 2}deg)`, opacity: 1, offset: 0.45 },
          { transform: `translate(calc(-50% + ${dx * 1.3}px), calc(-50% + ${dy + 260}px)) rotate(${spin}deg)`, opacity: 0 },
        ],
        { duration: 1400 + Math.random() * 600, easing: "cubic-bezier(.2,.7,.4,1)" },
      )
      .finished.then(() => piece.remove());
  }
}

document.querySelectorAll(".more-toggle").forEach((button) => {
  const content = document.getElementById(button.getAttribute("aria-controls"));
  if (!content) return;
  button.addEventListener("click", () => {
    const open = button.getAttribute("aria-expanded") !== "true";
    button.setAttribute("aria-expanded", String(open));
    content.hidden = !open;
    if (open && button.hasAttribute("data-confetti")) confetti(button);
  });
});

// ---- Avatar swap ----
// Click the avatar: the hidden face moves on top and is revealed by a circle growing from the centre.

document.querySelectorAll("[data-avatar-swap]").forEach((button) => {
  const faces = [...button.querySelectorAll(".avatar-face")];
  button.addEventListener("click", () => {
    const current = faces.find((f) => f.classList.contains("is-front"));
    const next = faces.find((f) => f !== current);
    if (reducedMotion.matches) {
      current.classList.remove("is-front");
      next.classList.add("is-front");
      return;
    }
    // Start the incoming face as a zero-size circle on top, then grow it on the next frame.
    next.classList.remove("is-entering");
    next.style.clipPath = "circle(0% at 50% 50%)";
    next.style.zIndex = "3";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        next.classList.add("is-entering");
        next.style.clipPath = "circle(75% at 50% 50%)";
      });
    });
    const settle = () => {
      current.classList.remove("is-front");
      next.classList.add("is-front");
      next.classList.remove("is-entering");
      next.style.clipPath = next.style.zIndex = "";
    };
    next.addEventListener("transitionend", settle, { once: true });
  });
});

// ---- Fun-fact cards ----
// The card shows on hover/focus via CSS; a click or tap pins it open. With data-rate, a counter
// shows how many there would have been at that rate since the page opened, updated while visible.

const pageOpened = performance.now();
const numberFormat = new Intl.NumberFormat("en-US");

document.querySelectorAll("[data-fact]").forEach((fact) => {
  const trigger = fact.querySelector(".fact-trigger");
  const card = fact.querySelector(".fact-card");
  const count = fact.querySelector("[data-fact-count]");
  const rate = Number(fact.dataset.rate) || 0;
  let frame = 0;

  const isShown = () => fact.matches(":hover, :focus-within") || fact.classList.contains("is-open");

  function tickCount() {
    count.textContent = numberFormat.format(Math.floor(((performance.now() - pageOpened) / 1000) * rate));
    frame = isShown() ? requestAnimationFrame(tickCount) : 0;
  }

  // Keep the card inside the viewport when the phrase sits near an edge. Computed from the
  // phrase and the card's layout width, so an in-progress animation can't skew it.
  function place() {
    const anchor = fact.getBoundingClientRect();
    const width = card.offsetWidth;
    const left = anchor.left + anchor.width / 2 - width / 2;
    const margin = 16;
    let shift = 0;
    if (left < margin) shift = margin - left;
    else if (left + width > innerWidth - margin) shift = innerWidth - margin - (left + width);
    card.style.setProperty("--fact-shift", `${shift}px`);
  }

  function show() {
    place();
    if (count && rate && !frame) tickCount();
  }

  fact.addEventListener("pointerenter", show);
  fact.addEventListener("focusin", show);
  trigger.addEventListener("click", () => {
    const open = !fact.classList.contains("is-open");
    fact.classList.toggle("is-open", open);
    trigger.setAttribute("aria-expanded", String(open));
    if (open) show();
  });
  document.addEventListener("click", (event) => {
    if (!fact.contains(event.target) && fact.classList.contains("is-open")) {
      fact.classList.remove("is-open");
      trigger.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && fact.classList.contains("is-open")) {
      fact.classList.remove("is-open");
      trigger.setAttribute("aria-expanded", "false");
      trigger.focus();
    }
  });
});

// ---- Work highlights [+] ----

document.querySelectorAll(".work-toggle").forEach((button) => {
  const item = button.closest(".work-item");
  const details = document.getElementById(button.getAttribute("aria-controls"));
  if (!item || !details) return;
  button.addEventListener("click", () => {
    const open = button.getAttribute("aria-expanded") !== "true";
    button.setAttribute("aria-expanded", String(open));
    item.classList.toggle("is-open", open);
    details.inert = !open;
  });
});

// ---- Tabs ----

document.querySelectorAll("[data-tabs]").forEach((group) => {
  const tabs = [...group.querySelectorAll('[role="tab"]')];
  const select = (tab) => {
    tabs.forEach((t) => {
      const selected = t === tab;
      t.setAttribute("aria-selected", String(selected));
      t.tabIndex = selected ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !selected;
    });
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => select(tab));
    tab.addEventListener("keydown", (event) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (!step) return;
      const next = tabs[(i + step + tabs.length) % tabs.length];
      select(next);
      next.focus();
    });
  });
});
