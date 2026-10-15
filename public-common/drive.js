// Shared "Drive"-style UI used by both the admin app (public/app.js) and the
// public share page (public-share/index.html). Exposes window.Drive.
(() => {
  // ---------- Icons (Material Design paths) ----------
  const ICONS = {
    menu: "M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z",
    search: "M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z",
    close: "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
    folder: "M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z",
    folderShared: "M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-5 3c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm4 8h-8v-1c0-1.33 2.67-2 4-2s4 .67 4 2v1z",
    image: "M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z",
    video: "M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z",
    audio: "M12 3v9.28c-.47-.17-.97-.28-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z",
    pdf: "M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v3zm4-3H19v1h1.5V11H19v2h-1.5V7h3v1.5zM9 9.5h1v-1H9v1zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm10 5.5h1v-3h-1v3z",
    doc: "M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z",
    sheet: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 8h-8v8H9v-8H5V9h4V5h2v4h8v2z",
    slide: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 13H5V8h14v8z",
    zip: "M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5 6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z",
    code: "M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0 4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z",
    file: "M6 2c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6H6zm7 7V3.5L18.5 9H13z",
    grid: "M3 3v8h8V3H3zm6 6H5V5h4v4zm-6 4v8h8v-8H3zm6 6H5v-4h4v4zm4-16v8h8V3h-8zm6 6h-4V5h4v4zm-6 4v8h8v-8h-8zm6 6h-4v-4h4v4z",
    list: "M3 14h4v-4H3v4zm0 5h4v-4H3v4zM3 9h4V5H3v4zm5 5h13v-4H8v4zm0 5h13v-4H8v4zM8 5v4h13V5H8z",
    more: "M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z",
    download: "M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z",
    upload: "M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z",
    add: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
    chevronRight: "M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z",
    chevronLeft: "M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z",
    expandMore: "M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z",
    expandLess: "M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z",
    back: "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z",
    arrowUp: "M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z",
    arrowDown: "M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z",
    play: "M8 5v14l11-7z",
    check: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z",
    error: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z",
    eye: "M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z",
    open: "M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z",
    link: "M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z",
    copy: "M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z",
    delete: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
    key: "M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z",
    tune: "M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z",
    logout: "M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z",
    cloud: "M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z",
    home: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z",
    sort: "M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z",
    share: "M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z",
    lock: "M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z",
    refresh: "M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z",
  };

  const SVG_NS = "http://www.w3.org/2000/svg";
  function icon(name, extraClass) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", "ic" + (extraClass ? " " + extraClass : ""));
    const p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", ICONS[name] || ICONS.file);
    svg.appendChild(p);
    return svg;
  }

  // Tiny element builder: h("div", { class: "x", onclick }, child, "text", ...)
  function h(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on")) node[k] = v;
      else if (k === "style") node.style.cssText = v;
      else if (k in node && typeof v !== "string") node[k] = v;
      else node.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
  }

  function logo() {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 48 48");
    svg.setAttribute("class", "brand-logo");
    svg.setAttribute("aria-hidden", "true");
    const parts = [
      ["path", { d: "M6 12a4 4 0 0 1 4-4h9l4 4h15a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z", fill: "#1a73e8" }],
      ["path", { d: "M6 18h36v18a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z", fill: "#4285f4" }],
      ["circle", { cx: "30", cy: "24", r: "3.2", fill: "#fbbc04" }],
      ["circle", { cx: "19", cy: "29.5", r: "3.2", fill: "#34a853" }],
      ["circle", { cx: "30", cy: "35", r: "3.2", fill: "#ea4335" }],
      ["path", { d: "M27.5 25.4 21.5 28.1M21.5 30.9l6 2.7", stroke: "#fff", "stroke-width": "1.8", fill: "none" }],
    ];
    for (const [tag, attrs] of parts) {
      const n = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      svg.appendChild(n);
    }
    return svg;
  }

  // ---------- Formatting ----------
  function formatSize(bytes) {
    if (bytes == null) return "—";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
      bytes /= 1024;
      i++;
    }
    return (i === 0 ? bytes : bytes.toFixed(bytes < 10 ? 1 : 0)) + " " + units[i];
  }

  function formatDate(ms) {
    if (!ms) return "";
    const d = new Date(ms);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    const opts = { month: "short", day: "numeric" };
    if (d.getFullYear() !== now.getFullYear()) opts.year = "numeric";
    return d.toLocaleDateString(undefined, opts);
  }

  function formatDuration(sec) {
    if (!isFinite(sec) || sec <= 0) return "";
    sec = Math.round(sec);
    const hh = Math.floor(sec / 3600);
    const mm = Math.floor((sec % 3600) / 60);
    const ss = String(sec % 60).padStart(2, "0");
    return hh ? `${hh}:${String(mm).padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
  }

  function ext(name) {
    const i = name.lastIndexOf(".");
    return i > 0 ? name.slice(i).toLowerCase() : "";
  }

  const KIND_EXT = {
    image: [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".avif", ".heic", ".heif", ".svg", ".tif", ".tiff"],
    video: [".mp4", ".webm", ".ogv", ".mov", ".m4v", ".mkv", ".avi", ".wmv", ".3gp"],
    audio: [".mp3", ".wav", ".m4a", ".flac", ".aac", ".oga", ".ogg", ".opus"],
    pdf: [".pdf"],
    doc: [".doc", ".docx", ".txt", ".rtf", ".odt", ".md", ".pages"],
    sheet: [".xls", ".xlsx", ".csv", ".ods", ".numbers"],
    slide: [".ppt", ".pptx", ".key", ".odp"],
    zip: [".zip", ".rar", ".7z", ".tar", ".gz", ".tgz", ".bz2", ".xz", ".dmg", ".iso"],
    code: [".js", ".ts", ".json", ".html", ".css", ".py", ".java", ".c", ".cpp", ".go", ".rs", ".sh", ".xml", ".yml", ".yaml"],
  };
  function fileKind(name) {
    const e = ext(name);
    for (const [kind, list] of Object.entries(KIND_EXT)) if (list.includes(e)) return kind;
    return "file";
  }

  // Must stay in sync with PREVIEW_EXTENSIONS in src/server.ts: these are
  // the only types the server will serve inline.
  const PREVIEW_EXT = {
    image: [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".avif"],
    video: [".mp4", ".webm", ".ogv", ".mov", ".m4v"],
    audio: [".mp3", ".wav", ".m4a", ".flac", ".aac", ".oga"],
    pdf: [".pdf"],
  };
  function previewKind(name) {
    const e = ext(name);
    for (const [kind, list] of Object.entries(PREVIEW_EXT)) if (list.includes(e)) return kind;
    return null;
  }

  function kindIcon(kind) {
    const node = icon(kind === "file" ? "file" : kind);
    node.style.color = `var(--ic-${kind})`;
    return node;
  }

  // ---------- Toasts ----------
  let toastHost;
  function toast(message, opts = {}) {
    if (!toastHost) toastHost = document.body.appendChild(h("div", { class: "toast-host", role: "status" }));
    const t = h("div", { class: "toast" + (opts.error ? " error" : ""), text: message });
    toastHost.appendChild(t);
    setTimeout(() => t.remove(), opts.duration || (opts.error ? 5000 : 3000));
  }

  async function copyText(text, message = "Copied to clipboard") {
    try {
      await navigator.clipboard.writeText(text);
      toast(message);
    } catch {
      toast("Couldn't copy — your browser blocked clipboard access", { error: true });
    }
  }

  // ---------- Menus ----------
  let openMenuEl = null;
  function closeMenu() {
    if (openMenuEl) {
      openMenuEl.remove();
      openMenuEl = null;
    }
  }
  // `at` is either an element to anchor to or {x, y} from a contextmenu event.
  function showMenu(at, items) {
    closeMenu();
    const menu = h("div", { class: "menu", role: "menu" });
    for (const item of items) {
      if (!item) continue;
      if (item === "sep") menu.appendChild(h("hr"));
      else if (item.title) menu.appendChild(h("div", { class: "menu-title", text: item.title }));
      else
        menu.appendChild(
          h(
            "button",
            {
              role: "menuitem",
              class: item.danger ? "danger" : "",
              onclick: (e) => {
                e.stopPropagation();
                closeMenu();
                item.onClick();
              },
            },
            item.icon === "blank" ? h("span", { style: "width:20px;flex-shrink:0" }) : item.icon ? icon(item.icon) : null,
            h("span", { text: item.label })
          )
        );
    }
    document.body.appendChild(menu);
    openMenuEl = menu;
    let x, y;
    if (at instanceof Element) {
      const r = at.getBoundingClientRect();
      x = r.right - menu.offsetWidth;
      y = r.bottom + 4;
      if (x < 8) x = r.left;
    } else {
      ({ x, y } = at);
    }
    x = Math.max(8, Math.min(x, innerWidth - menu.offsetWidth - 8));
    if (y + menu.offsetHeight > innerHeight - 8) y = Math.max(8, innerHeight - menu.offsetHeight - 8);
    menu.style.left = x + "px";
    menu.style.top = y + "px";
    const first = menu.querySelector("button");
    if (first) first.focus({ preventScroll: true });
  }
  document.addEventListener("click", (e) => {
    if (openMenuEl && !openMenuEl.contains(e.target)) closeMenu();
  });
  window.addEventListener("resize", closeMenu);
  document.addEventListener("scroll", closeMenu, true);

  // ---------- Dialogs ----------
  // actions: [{ label, kind: "text"|"filled"|"danger", onClick }] — onClick
  // may return false (or a promise of false) to keep the dialog open.
  function dialog({ title, body, actions = [], onClose }) {
    const bodyEl = h("div", { class: "dialog-body" });
    if (typeof body === "string") bodyEl.textContent = body;
    else if (body) bodyEl.appendChild(body);
    const foot = h("div", { class: "dialog-foot" });
    const wrap = h(
      "div",
      { class: "dialog-wrap" },
      h(
        "div",
        { class: "dialog", role: "dialog", "aria-modal": "true" },
        h("div", { class: "dialog-head" }, h("div", { class: "title", text: title })),
        bodyEl,
        foot
      )
    );
    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      wrap.remove();
      document.removeEventListener("keydown", onKey, true);
      if (onClose) onClose();
    }
    function onKey(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    }
    for (const a of actions) {
      const btn = h("button", {
        class: "btn " + (a.kind === "filled" ? "" : a.kind === "danger" ? "danger" : "text"),
        text: a.label,
      });
      btn.onclick = async () => {
        btn.disabled = true;
        try {
          const keep = a.onClick ? await a.onClick() : undefined;
          if (keep !== false) close();
        } catch (err) {
          toast(err.message, { error: true });
        } finally {
          btn.disabled = false;
        }
      };
      foot.appendChild(btn);
    }
    wrap.addEventListener("mousedown", (e) => {
      if (e.target === wrap) close();
    });
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(wrap);
    const focusable = wrap.querySelector("input, select, .dialog-foot .btn:last-child");
    if (focusable) focusable.focus();
    return { close, body: bodyEl };
  }

  function confirmDialog(title, text, okLabel = "OK", danger = false) {
    return new Promise((resolve) => {
      let answered = false;
      dialog({
        title,
        body: text,
        actions: [
          { label: "Cancel", kind: "text", onClick: () => {} },
          {
            label: okLabel,
            kind: danger ? "danger" : "filled",
            onClick: () => {
              answered = true;
            },
          },
        ],
        onClose: () => resolve(answered),
      });
    });
  }

  // ---------- App shell (hamburger / drawer) ----------
  const MOBILE_QUERY = matchMedia("(max-width: 860px)");
  function initShell() {
    const menuBtn = document.getElementById("menu-btn");
    const scrim = document.getElementById("scrim");
    try {
      if (localStorage.getItem("drive.sidebarCollapsed") === "1") document.body.classList.add("sidebar-collapsed");
    } catch {}
    function closeDrawer() {
      document.body.classList.remove("drawer-open");
      scrim.hidden = true;
    }
    function toggle() {
      if (MOBILE_QUERY.matches) {
        const open = !document.body.classList.contains("drawer-open");
        document.body.classList.toggle("drawer-open", open);
        scrim.hidden = !open;
      } else {
        const collapsed = document.body.classList.toggle("sidebar-collapsed");
        try {
          localStorage.setItem("drive.sidebarCollapsed", collapsed ? "1" : "0");
        } catch {}
      }
    }
    menuBtn.onclick = toggle;
    scrim.onclick = closeDrawer;
    document.querySelectorAll("[data-close-drawer]").forEach((b) => (b.onclick = closeDrawer));
    MOBILE_QUERY.addEventListener("change", closeDrawer);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeDrawer();
    });
    return { closeDrawer };
  }

  // ---------- Lazy thumbnails ----------
  // Images use the inline preview endpoint directly; videos load just enough
  // metadata to paint a frame. Both only start once scrolled into view, and
  // videos are throttled so a folder of 200 clips doesn't open 200 streams.
  const VIDEO_CONCURRENCY = 3;
  let activeVideos = 0;
  const videoQueue = [];
  function pumpVideos() {
    while (activeVideos < VIDEO_CONCURRENCY && videoQueue.length) {
      const job = videoQueue.shift();
      if (!job.box.isConnected) continue;
      activeVideos++;
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        activeVideos--;
        pumpVideos();
      };
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.preload = "metadata";
      v.disablePictureInPicture = true;
      v.setAttribute("tabindex", "-1");
      v.addEventListener("loadedmetadata", () => {
        if (job.onDuration) job.onDuration(v.duration);
        // Seek a little in so the frame isn't a black fade-in.
        try {
          v.currentTime = Math.min(1, (v.duration || 2) / 4);
        } catch {}
      });
      v.addEventListener("seeked", () => {
        v.classList.add("loaded");
        release();
      });
      v.addEventListener("loadeddata", () => {
        v.classList.add("loaded");
      });
      v.addEventListener("error", () => {
        v.remove();
        release();
      });
      setTimeout(release, 15000);
      v.src = job.url;
      job.box.appendChild(v);
    }
  }

  const thumbObserver =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (records) => {
            for (const r of records) {
              if (!r.isIntersecting) continue;
              thumbObserver.unobserve(r.target);
              r.target._loadThumb();
            }
          },
          { rootMargin: "200px" }
        )
      : null;

  function attachThumb(box, kind, url, onDuration) {
    box._loadThumb = () => {
      if (kind === "image") {
        const img = new Image();
        img.decoding = "async";
        img.alt = "";
        img.onload = () => img.classList.add("loaded");
        img.onerror = () => img.remove();
        img.src = url;
        box.appendChild(img);
      } else if (kind === "video") {
        videoQueue.push({ box, url, onDuration });
        pumpVideos();
      }
    };
    if (thumbObserver) thumbObserver.observe(box);
    else box._loadThumb();
  }

  // ---------- Viewer (lightbox) ----------
  // items: [{ name, kind (previewKind or null), previewUrl, downloadUrl }]
  function openViewer(items, index, { canDownload = true } = {}) {
    let i = index;
    const titleText = h("span");
    const titleIcon = h("span", { style: "display:flex" });
    const counter = h("div", { class: "viewer-count" });
    const stage = h("div", { class: "viewer-stage" });
    const dlBtn = h("button", { class: "icon-btn", title: "Download", "aria-label": "Download" }, icon("download"));
    const prev = h("button", { class: "viewer-nav prev", title: "Previous", "aria-label": "Previous" }, icon("chevronLeft"));
    const next = h("button", { class: "viewer-nav next", title: "Next", "aria-label": "Next" }, icon("chevronRight"));
    const root = h(
      "div",
      { class: "viewer", role: "dialog", "aria-modal": "true" },
      h(
        "div",
        { class: "viewer-bar" },
        h("button", { class: "icon-btn", title: "Close", "aria-label": "Close", onclick: close }, icon("back")),
        h("div", { class: "viewer-title" }, titleIcon, titleText),
        counter,
        canDownload ? dlBtn : null
      ),
      stage
    );
    stage.append(prev, next);

    function show() {
      const item = items[i];
      titleText.textContent = item.name;
      titleIcon.replaceChildren(kindIcon(fileKind(item.name)));
      counter.textContent = items.length > 1 ? `${i + 1} of ${items.length}` : "";
      prev.hidden = i === 0;
      next.hidden = i === items.length - 1;
      for (const c of [...stage.children]) if (c !== prev && c !== next) c.remove();
      let media;
      if (item.kind === "image") media = h("img", { src: item.previewUrl, alt: item.name });
      else if (item.kind === "video") media = h("video", { src: item.previewUrl, controls: true, autoplay: true, playsInline: true });
      else if (item.kind === "audio") media = h("audio", { src: item.previewUrl, controls: true, autoplay: true });
      else if (item.kind === "pdf") media = h("iframe", { src: item.previewUrl, title: item.name });
      else {
        media = h(
          "div",
          { class: "viewer-none" },
          kindIcon(fileKind(item.name)),
          h("div", { text: "No preview available" }),
          canDownload
            ? h("a", { class: "btn", href: item.downloadUrl, download: "" }, icon("download"), "Download")
            : null
        );
      }
      if (media.tagName === "VIDEO" || media.tagName === "AUDIO") {
        media.addEventListener("error", () => {
          media.replaceWith(
            h(
              "div",
              { class: "viewer-none" },
              kindIcon(fileKind(item.name)),
              h("div", { text: "This browser can't play this file" }),
              canDownload ? h("a", { class: "btn", href: item.downloadUrl, download: "" }, icon("download"), "Download") : null
            )
          );
        });
      }
      stage.insertBefore(media, prev);
      dlBtn.onclick = () => (location.href = item.downloadUrl);
    }
    function go(d) {
      const n = i + d;
      if (n < 0 || n >= items.length) return;
      i = n;
      show();
    }
    function onKey(e) {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    }
    function close() {
      root.remove();
      document.removeEventListener("keydown", onKey, true);
    }
    prev.onclick = () => go(-1);
    next.onclick = () => go(1);
    stage.addEventListener("click", (e) => {
      if (e.target === stage) close();
    });
    // Swipe left/right on touch screens.
    let touchX = null;
    stage.addEventListener("touchstart", (e) => (touchX = e.touches[0].clientX), { passive: true });
    stage.addEventListener("touchend", (e) => {
      if (touchX == null) return;
      const dx = e.changedTouches[0].clientX - touchX;
      touchX = null;
      if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
    });
    document.addEventListener("keydown", onKey, true);
    document.body.appendChild(root);
    show();
  }

  // ---------- Uploads (bottom-right panel, like Drive) ----------
  class UploadCancelledError extends Error {
    constructor() {
      super("Cancelled");
      this.name = "UploadCancelledError";
    }
  }

  // Uploads a single file with fine-grained progress. Distinguishes "bytes
  // still going over the wire" from "server is writing to disk", since large
  // files can sit at 100% for a while once the browser is done sending but
  // before the server has finished flushing to disk and responding.
  function uploadFileWithProgress(url, file, onProgress, onXhr) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          onProgress({ pct, finishing: pct === 100 });
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) return resolve();
        let message = xhr.statusText;
        try {
          message = JSON.parse(xhr.responseText).error || message;
        } catch {
          /* non-JSON error body */
        }
        const err = new Error(message);
        err.status = xhr.status;
        reject(err);
      };
      xhr.onerror = () => reject(new Error("Upload failed"));
      xhr.onabort = () => reject(new UploadCancelledError());
      const formData = new FormData();
      formData.append("files", file);
      xhr.send(formData);
      onXhr(xhr);
    });
  }

  // Retries a transient failure (e.g. a network drive briefly dropping mid-
  // batch) a couple of times before giving up, so a one-off I/O hiccup doesn't
  // fail an otherwise-fine upload. Cancellation always wins over a retry, and
  // client errors (4xx, e.g. "file too large") aren't worth retrying.
  const UPLOAD_MAX_ATTEMPTS = 3;
  const UPLOAD_RETRY_DELAY_MS = 800;
  async function uploadWithRetries(item, onEvent) {
    for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt++) {
      if (item.cancelled) throw new UploadCancelledError();
      try {
        await uploadFileWithProgress(
          item.url,
          item.file,
          (p) => onEvent({ type: "progress", ...p }),
          (xhr) => (item.xhr = xhr)
        );
        return;
      } catch (err) {
        item.xhr = null;
        if (item.cancelled || err instanceof UploadCancelledError) throw new UploadCancelledError();
        if (attempt === UPLOAD_MAX_ATTEMPTS || (err.status >= 400 && err.status < 500)) throw err;
        onEvent({ type: "retrying", attempt: attempt + 1 });
        await new Promise((r) => setTimeout(r, UPLOAD_RETRY_DELAY_MS));
      }
    }
  }

  const RING_C = 2 * Math.PI * 10;
  const uploader = {
    items: [],
    running: false,
    panel: null,
    els: null,

    ensurePanel() {
      if (this.panel) return;
      const title = h("div", { class: "title" });
      const collapseBtn = h("button", { class: "icon-btn sm", title: "Minimize", "aria-label": "Minimize" }, icon("expandMore"));
      const closeBtn = h("button", { class: "icon-btn sm", title: "Close", "aria-label": "Close" }, icon("close"));
      const subText = h("span");
      const cancelAll = h("button", { class: "btn text small", text: "Cancel" });
      const overall = h("div");
      const list = h("div", { class: "upload-list" });
      const panel = h(
        "div",
        { class: "upload-panel", role: "region", "aria-label": "Uploads" },
        h("div", { class: "upload-head" }, title, collapseBtn, closeBtn),
        h("div", { class: "upload-overall" }, overall),
        h("div", { class: "upload-sub" }, subText, cancelAll),
        list
      );
      collapseBtn.onclick = () => {
        const c = panel.classList.toggle("collapsed");
        collapseBtn.replaceChildren(icon(c ? "expandLess" : "expandMore"));
      };
      closeBtn.onclick = async () => {
        if (this.running) {
          const ok = await confirmDialog("Cancel upload?", "Your uploads aren't finished. Cancel all remaining uploads?", "Cancel uploads", true);
          if (!ok) return;
          this.cancelAll();
        }
        panel.remove();
        this.panel = null;
        this.items = this.items.filter((it) => !it.finished);
      };
      cancelAll.onclick = () => this.cancelAll();
      document.body.appendChild(panel);
      this.panel = panel;
      this.els = { title, subText, cancelAll, overall, list };
    },

    add(files, url, onBatchDone) {
      this.ensurePanel();
      this.panel.classList.remove("collapsed");
      const batch = { remaining: files.length, failures: 0, cancelled: 0, onBatchDone };
      for (const file of files) {
        const item = { file, url, batch, state: "queued", pct: 0, cancelled: false, xhr: null, finished: false };
        item.row = this.buildRow(item);
        this.els.list.appendChild(item.row.el);
        this.items.push(item);
      }
      this.refresh();
      if (!this.running) this.run();
    },

    buildRow(item) {
      const ringBar = document.createElementNS(SVG_NS, "circle");
      const ring = document.createElementNS(SVG_NS, "svg");
      ring.setAttribute("viewBox", "0 0 24 24");
      ring.setAttribute("class", "ring");
      const track = document.createElementNS(SVG_NS, "circle");
      for (const [c, cls] of [[track, "track"], [ringBar, "bar"]]) {
        c.setAttribute("cx", "12");
        c.setAttribute("cy", "12");
        c.setAttribute("r", "10");
        c.setAttribute("class", cls);
        ring.appendChild(c);
      }
      ringBar.setAttribute("stroke-dasharray", RING_C);
      ringBar.setAttribute("stroke-dashoffset", RING_C);
      const detail = h("div", { class: "up-detail", text: "Waiting… · " + formatSize(item.file.size) });
      const cancel = h(
        "button",
        { class: "icon-btn sm up-cancel", title: "Cancel", "aria-label": "Cancel upload", onclick: () => this.cancel(item) },
        icon("close")
      );
      const el = h(
        "div",
        { class: "up-row", "data-state": "queued" },
        kindIcon(fileKind(item.file.name)),
        h("div", { class: "up-info" }, h("div", { class: "up-name", text: item.file.name, title: item.file.name }), detail),
        h("div", { class: "up-state" }, ring, icon("check", "done"), icon("error", "fail"), cancel)
      );
      return { el, detail, ringBar };
    },

    setState(item, state, detail) {
      item.state = state;
      item.row.el.dataset.state = state;
      if (detail != null) item.row.detail.textContent = detail;
      item.row.ringBar.setAttribute("stroke-dashoffset", RING_C * (1 - item.pct / 100));
    },

    cancel(item) {
      if (item.finished || item.cancelled) return;
      item.cancelled = true;
      if (item.xhr) item.xhr.abort();
      else this.finish(item, "cancelled", "Cancelled");
    },

    cancelAll() {
      for (const it of this.items) this.cancel(it);
    },

    finish(item, state, detail) {
      if (item.finished) return;
      item.finished = true;
      if (state === "done") item.pct = 100;
      this.setState(item, state, detail);
      const b = item.batch;
      if (state === "error") b.failures++;
      if (state === "cancelled") b.cancelled++;
      if (--b.remaining === 0 && b.onBatchDone) b.onBatchDone({ failures: b.failures, cancelled: b.cancelled });
      this.refresh();
    },

    refresh() {
      if (!this.panel) return;
      const all = this.items;
      const pending = all.filter((i) => !i.finished).length;
      const done = all.filter((i) => i.state === "done").length;
      const failed = all.filter((i) => i.state === "error").length;
      const totalBytes = all.reduce((s, i) => s + (i.state === "cancelled" ? 0 : i.file.size), 0) || 1;
      const sentBytes = all.reduce((s, i) => s + (i.state === "cancelled" ? 0 : (i.file.size * i.pct) / 100), 0);
      const pct = Math.round((sentBytes / totalBytes) * 100);
      this.els.overall.style.width = (pending ? pct : 100) + "%";
      if (pending) {
        this.els.title.textContent = `Uploading ${pending} item${pending === 1 ? "" : "s"}`;
        this.els.subText.textContent = `${pct}% · ${done} of ${all.length} done`;
        this.els.cancelAll.hidden = false;
      } else {
        this.els.title.textContent = failed
          ? `${failed} upload${failed === 1 ? "" : "s"} failed`
          : `${done} upload${done === 1 ? "" : "s"} complete`;
        this.els.subText.textContent = failed ? `${done} of ${all.length} uploaded` : "All done";
        this.els.cancelAll.hidden = true;
      }
    },

    async run() {
      this.running = true;
      let item;
      while ((item = this.items.find((i) => !i.finished && i.state === "queued"))) {
        if (item.cancelled) {
          this.finish(item, "cancelled", "Cancelled");
          continue;
        }
        const sizeText = formatSize(item.file.size);
        this.setState(item, "uploading", "Starting… · " + sizeText);
        try {
          await uploadWithRetries(item, (ev) => {
            if (ev.type === "retrying") {
              item.pct = 0;
              this.setState(item, "uploading", `Retrying (attempt ${ev.attempt})…`);
              return;
            }
            item.pct = ev.pct;
            if (ev.finishing) this.setState(item, "finishing", "Saving… · " + sizeText);
            else this.setState(item, "uploading", `${ev.pct}% of ${sizeText}`);
            this.refresh();
          });
          this.finish(item, "done", sizeText);
        } catch (err) {
          if (err instanceof UploadCancelledError) this.finish(item, "cancelled", "Cancelled");
          else this.finish(item, "error", err.message || "Upload failed");
        }
      }
      this.running = false;
      this.refresh();
    },
  };

  function pickFiles(onPick) {
    const input = h("input", { type: "file", multiple: true, style: "display:none" });
    input.onchange = () => {
      const files = Array.from(input.files || []);
      input.remove();
      if (files.length) onPick(files);
    };
    document.body.appendChild(input);
    input.click();
  }

  // ---------- File browser ----------
  // opts: {
  //   mount, rootName, permission ("read"|"write"|"both"), maxUploadMB,
  //   urls: { files(rel), download(rel), zip(rel), preview(rel), upload(rel) },
  //   navigate(rel)  – called on folder clicks (e.g. to update location.hash);
  //                     defaults to loading the folder directly
  //   onUnauthorized() – called if the listing request returns 401
  //   toolbarExtras: [{ icon, label, onClick }]
  // }
  function createBrowser(opts) {
    const canRead = opts.permission !== "write";
    const canUpload = opts.permission !== "read";
    const st = {
      rel: "",
      entries: [],
      query: "",
      view: load("drive.view", "grid"),
      sort: load("drive.sort", "modified"),
      dir: load("drive.dir", "desc"),
      loading: false,
      token: 0,
    };
    function load(key, def) {
      try {
        return localStorage.getItem(key) || def;
      } catch {
        return def;
      }
    }
    function save(key, val) {
      try {
        localStorage.setItem(key, val);
      } catch {}
    }

    const crumbs = h("nav", { class: "crumbs", "aria-label": "Folder path" });
    const actions = h("div", { class: "toolbar-actions" });
    const content = h("div", { class: "content" });
    opts.mount.replaceChildren(h("div", { class: "toolbar" }, crumbs, actions), content);

    const relPath = (name) => (st.rel ? st.rel + "/" + name : name);
    const navigate = opts.navigate || ((rel) => api.load(rel));

    // ----- toolbar -----
    function renderActions() {
      actions.replaceChildren();
      for (const x of opts.toolbarExtras || []) {
        actions.appendChild(h("button", { class: "chip", title: x.label, onclick: x.onClick }, icon(x.icon), h("span", { class: "chip-label", text: x.label })));
      }
      if (canUpload) {
        actions.appendChild(
          h("button", { class: "chip", title: "Upload files", onclick: () => api.upload() }, icon("upload"), h("span", { class: "chip-label", text: "Upload" }))
        );
      }
      if (!canRead) return;
      actions.appendChild(
        h(
          "button",
          { class: "chip", title: "Download this folder as a ZIP", onclick: () => (location.href = opts.urls.zip(st.rel)) },
          icon("download"),
          h("span", { class: "chip-label", text: "Download" })
        )
      );
      const sortBtn = h("button", { class: "chip", title: "Sort" }, icon("sort"), h("span", { class: "chip-label", text: SORT_LABEL[st.sort] }));
      sortBtn.onclick = (e) => {
        e.stopPropagation();
        showMenu(sortBtn, [
          { title: "Sort by" },
          ...Object.entries(SORT_LABEL).map(([key, label]) => ({
            label,
            icon: st.sort === key ? "check" : "blank",
            onClick: () => setSort(key, key === "name" ? "asc" : "desc"),
          })),
          "sep",
          { label: "Ascending", icon: st.dir === "asc" ? "check" : "blank", onClick: () => setSort(st.sort, "asc") },
          { label: "Descending", icon: st.dir === "desc" ? "check" : "blank", onClick: () => setSort(st.sort, "desc") },
        ]);
      };
      actions.appendChild(sortBtn);
      const gridBtn = h("button", { class: st.view === "grid" ? "on" : "", title: "Grid layout", "aria-label": "Grid layout" }, icon("grid"));
      const listBtn = h("button", { class: st.view === "list" ? "on" : "", title: "List layout", "aria-label": "List layout" }, icon("list"));
      gridBtn.onclick = () => setView("grid");
      listBtn.onclick = () => setView("list");
      actions.appendChild(h("div", { class: "view-toggle" }, listBtn, gridBtn));
    }
    const SORT_LABEL = { name: "Name", modified: "Last modified", size: "File size" };
    function setSort(key, dir) {
      st.sort = key;
      st.dir = dir;
      save("drive.sort", key);
      save("drive.dir", dir);
      renderActions();
      render();
    }
    function setView(v) {
      st.view = v;
      save("drive.view", v);
      renderActions();
      render();
    }

    function renderCrumbs() {
      crumbs.replaceChildren();
      const parts = st.rel ? st.rel.split("/") : [];
      const all = [{ name: opts.rootName, rel: "" }, ...parts.map((p, i) => ({ name: p, rel: parts.slice(0, i + 1).join("/") }))];
      // Long paths collapse their middle into "…" (a menu), like Drive.
      let shown = all;
      let hiddenMid = [];
      const max = MOBILE_QUERY.matches ? 2 : 4;
      if (all.length > max) {
        shown = [all[0], null, ...all.slice(all.length - (max - 1))];
        hiddenMid = all.slice(1, all.length - (max - 1));
      }
      shown.forEach((c, idx) => {
        if (idx > 0) crumbs.appendChild(h("span", { class: "crumb-sep" }, icon("chevronRight")));
        if (c === null) {
          const more = h("button", { class: "crumb crumb-ellipsis", text: "…", title: "Show path" });
          more.onclick = (e) => {
            e.stopPropagation();
            showMenu(more, hiddenMid.map((m) => ({ label: m.name, icon: "folder", onClick: () => navigate(m.rel) })));
          };
          crumbs.appendChild(more);
          return;
        }
        const isLast = c === all[all.length - 1];
        crumbs.appendChild(
          h("button", {
            class: "crumb" + (isLast ? " current" : ""),
            text: c.name,
            title: c.name,
            onclick: () => !isLast && navigate(c.rel),
          })
        );
      });
    }

    // ----- items -----
    function itemMenu(entry) {
      const rp = relPath(entry.name);
      if (entry.isDir) {
        return [
          { title: entry.name },
          { label: "Open", icon: "open", onClick: () => navigate(rp) },
          { label: "Download as ZIP", icon: "download", onClick: () => (location.href = opts.urls.zip(rp)) },
        ];
      }
      const kind = previewKind(entry.name);
      return [
        { title: entry.name },
        { label: kind ? "Preview" : "Open", icon: "eye", onClick: () => openFile(entry) },
        { label: "Download", icon: "download", onClick: () => (location.href = opts.urls.download(rp)) },
      ];
    }

    function bindItem(node, entry, moreBtn) {
      node.tabIndex = 0;
      node.onclick = () => (entry.isDir ? navigate(relPath(entry.name)) : openFile(entry));
      node.onkeydown = (e) => {
        if (e.key === "Enter") node.onclick();
      };
      node.oncontextmenu = (e) => {
        e.preventDefault();
        showMenu({ x: e.clientX, y: e.clientY }, itemMenu(entry));
      };
      moreBtn.onclick = (e) => {
        e.stopPropagation();
        showMenu(moreBtn, itemMenu(entry));
      };
    }

    function moreButton(name) {
      return h("button", { class: "icon-btn sm", title: "More actions", "aria-label": "More actions for " + name }, icon("more"));
    }

    function thumbBox(entry, cls) {
      const kind = fileKind(entry.name);
      const box = h("div", { class: cls }, kindIcon(kind));
      const pk = previewKind(entry.name);
      if (pk === "image" || pk === "video") {
        const url = opts.urls.preview(relPath(entry.name));
        let badge = null;
        if (pk === "video") {
          if (cls === "thumb") {
            badge = h("div", { class: "badge" }, icon("play"), h("span"));
            box.appendChild(badge);
          } else {
            box.appendChild(h("div", { class: "play" }, icon("play")));
          }
        }
        attachThumb(box, pk, url, (d) => {
          if (badge) badge.lastChild.textContent = formatDuration(d);
        });
      }
      return box;
    }

    function folderCard(entry) {
      const more = moreButton(entry.name);
      const node = h("div", { class: "folder-card", title: entry.name }, icon("folder"), h("span", { class: "name", text: entry.name }), more);
      bindItem(node, entry, more);
      return node;
    }

    function fileCard(entry) {
      const more = moreButton(entry.name);
      const node = h(
        "div",
        { class: "file-card", title: entry.name },
        h("div", { class: "file-card-head" }, kindIcon(fileKind(entry.name)), h("span", { class: "name", text: entry.name }), more),
        thumbBox(entry, "thumb"),
        h("div", { class: "file-card-meta" }, h("span", { text: formatDate(entry.addedAt) }), h("span", { text: "·" }), h("span", { text: formatSize(entry.size) }))
      );
      bindItem(node, entry, more);
      return node;
    }

    function listRow(entry) {
      const more = moreButton(entry.name);
      const lead = entry.isDir ? h("div", { class: "mini-thumb" }, icon("folder")) : thumbBox(entry, "mini-thumb");
      if (entry.isDir) lead.firstChild.style.color = "var(--ic-folder)";
      const sub = [formatDate(entry.addedAt), entry.isDir ? null : formatSize(entry.size)].filter(Boolean).join(" · ");
      const node = h(
        "div",
        { class: "row", role: "row" },
        h("div", { class: "cell-name" }, lead, h("div", {}, h("span", { class: "name", text: entry.name, title: entry.name }), h("span", { class: "row-sub", text: sub }))),
        h("div", { class: "cell-muted", text: formatDate(entry.addedAt) }),
        h("div", { class: "cell-muted", text: entry.isDir ? "—" : formatSize(entry.size) }),
        more
      );
      bindItem(node, entry, more);
      return node;
    }

    function sorted(list) {
      const mul = st.dir === "asc" ? 1 : -1;
      const by = {
        name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
        modified: (a, b) => a.addedAt - b.addedAt,
        size: (a, b) => (a.size || 0) - (b.size || 0) || a.name.localeCompare(b.name),
      }[st.sort];
      return [...list].sort((a, b) => by(a, b) * mul);
    }

    function visible() {
      const q = st.query.trim().toLowerCase();
      const list = q ? st.entries.filter((e) => e.name.toLowerCase().includes(q)) : st.entries;
      return { folders: sorted(list.filter((e) => e.isDir)), files: sorted(list.filter((e) => !e.isDir)) };
    }

    function openFile(entry) {
      const { files } = visible();
      const items = files.map((f) => ({
        name: f.name,
        kind: previewKind(f.name),
        previewUrl: opts.urls.preview(relPath(f.name)),
        downloadUrl: opts.urls.download(relPath(f.name)),
      }));
      openViewer(items, Math.max(0, files.indexOf(entry)));
    }

    function emptyState(title, text, withUpload) {
      return h(
        "div",
        { class: "empty" },
        icon(st.query ? "search" : "folder"),
        h("h3", { text: title }),
        text ? h("p", { text }) : null,
        withUpload && canUpload ? h("button", { class: "btn", onclick: () => api.upload() }, icon("upload"), "Upload files") : null
      );
    }

    function render() {
      content.replaceChildren();
      if (!canRead) {
        content.appendChild(
          h(
            "div",
            { class: "dropzone" },
            icon("upload"),
            h("h3", { text: "Upload files to “" + opts.rootName + "”" }),
            h("p", { text: "This is an upload-only folder — you can add files but not see what's inside. Drag files here or choose them." }),
            h("button", { class: "btn", onclick: () => api.upload() }, icon("upload"), "Choose files"),
            opts.maxUploadMB ? h("small", { text: "Up to " + opts.maxUploadMB + " MB per file" }) : null
          )
        );
        return;
      }
      if (st.loading) {
        const grid = h("div", { class: "grid", style: "margin-top:16px" });
        for (let i = 0; i < 8; i++) grid.appendChild(h("div", { class: "skeleton", style: "height:" + (i < 4 ? 48 : 200) + "px" }));
        content.appendChild(grid);
        return;
      }
      const { folders, files } = visible();
      if (!folders.length && !files.length) {
        content.appendChild(
          st.query
            ? emptyState("No matching items", "Nothing in this folder matches “" + st.query + "”.")
            : emptyState("This folder is empty", canUpload ? "Drag files here, or use the Upload button." : null, true)
        );
        return;
      }
      if (st.view === "list") {
        const headBtn = (key, label) => {
          const b = h("button", { onclick: () => setSort(key, st.sort === key ? (st.dir === "asc" ? "desc" : "asc") : key === "name" ? "asc" : "desc") }, label);
          if (st.sort === key) b.appendChild(icon(st.dir === "asc" ? "arrowUp" : "arrowDown"));
          return b;
        };
        content.appendChild(h("div", { class: "list-head", role: "row" }, headBtn("name", "Name"), headBtn("modified", "Last modified"), headBtn("size", "File size"), h("span")));
        for (const e of [...folders, ...files]) content.appendChild(listRow(e));
        return;
      }
      if (folders.length) {
        content.appendChild(h("div", { class: "group-title", text: "Folders" }));
        content.appendChild(h("div", { class: "grid" }, folders.map(folderCard)));
      }
      if (files.length) {
        content.appendChild(h("div", { class: "group-title", text: "Files" }));
        content.appendChild(h("div", { class: "grid" }, files.map(fileCard)));
      }
    }

    // ----- drag & drop -----
    if (canUpload) {
      let depth = 0;
      let overlay = null;
      const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
      opts.mount.addEventListener("dragenter", (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        if (depth++ === 0) {
          overlay = h("div", { class: "drop-overlay" }, h("div", {}, icon("upload"), "Drop files to upload to “" + (st.rel.split("/").pop() || opts.rootName) + "”"));
          opts.mount.appendChild(overlay);
        }
      });
      opts.mount.addEventListener("dragover", (e) => {
        if (hasFiles(e)) e.preventDefault();
      });
      const clear = () => {
        depth = 0;
        if (overlay) overlay.remove();
        overlay = null;
      };
      opts.mount.addEventListener("dragleave", () => {
        if (--depth <= 0) clear();
      });
      opts.mount.addEventListener("drop", (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        clear();
        const files = [...e.dataTransfer.files];
        if (files.length) startUpload(files);
      });
    }

    function startUpload(files) {
      const rel = st.rel;
      const limit = opts.maxUploadMB;
      const tooBig = limit ? files.filter((f) => f.size > limit * 1024 * 1024) : [];
      if (tooBig.length) {
        toast(`${tooBig.length} file${tooBig.length === 1 ? " is" : "s are"} over the ${limit} MB limit and will be skipped`, { error: true });
        files = files.filter((f) => !tooBig.includes(f));
        if (!files.length) return;
      }
      uploader.add(files, opts.urls.upload(rel), () => {
        if (canRead && st.rel === rel) api.load(rel, { quiet: true });
      });
    }

    const api = {
      get rel() {
        return st.rel;
      },
      async load(rel, { quiet } = {}) {
        rel = (rel || "").replace(/^\/+|\/+$/g, "");
        renderActions();
        if (!canRead) {
          st.rel = "";
          renderCrumbs();
          render();
          return;
        }
        const token = ++st.token;
        if (!quiet) {
          st.rel = rel;
          st.loading = true;
          renderCrumbs();
          render();
        }
        try {
          const res = await fetch(opts.urls.files(rel));
          if (res.status === 401 && opts.onUnauthorized) return opts.onUnauthorized();
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || res.statusText);
          if (token !== st.token) return;
          st.rel = data.path;
          st.entries = data.entries;
        } catch (err) {
          if (token !== st.token) return;
          toast("Couldn't open folder: " + err.message, { error: true });
          st.entries = [];
        }
        st.loading = false;
        renderCrumbs();
        render();
        content.scrollTop = quiet ? content.scrollTop : 0;
      },
      search(q) {
        st.query = q || "";
        render();
      },
      upload() {
        if (canUpload) pickFiles(startUpload);
      },
      refresh() {
        return api.load(st.rel, { quiet: true });
      },
    };
    MOBILE_QUERY.addEventListener("change", () => renderCrumbs());
    return api;
  }

  window.Drive = {
    icon,
    h,
    logo,
    formatSize,
    formatDate,
    fileKind,
    previewKind,
    kindIcon,
    toast,
    copyText,
    showMenu,
    closeMenu,
    dialog,
    confirmDialog,
    initShell,
    openViewer,
    pickFiles,
    createBrowser,
    isMobile: () => MOBILE_QUERY.matches,
  };
})();
