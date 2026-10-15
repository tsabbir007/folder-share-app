const { h, icon, logo, toast } = Drive;

const els = {
  menuBtn: document.getElementById("menu-btn"),
  versionTag: document.getElementById("version-tag"),
  searchIcon: document.getElementById("search-icon"),
  searchInput: document.getElementById("search-input"),
  tunnelChip: document.getElementById("tunnel-chip"),
  tunnelChipDot: document.getElementById("tunnel-chip-dot"),
  tunnelChipLabel: document.getElementById("tunnel-chip-label"),
  tunnelIndicator: document.getElementById("tunnel-indicator"),
  tunnelLabel: document.getElementById("tunnel-label"),
  tunnelUrl: document.getElementById("tunnel-url"),
  tunnelToggle: document.getElementById("tunnel-toggle"),
  newBtn: document.getElementById("new-btn"),
  navHome: document.getElementById("nav-home"),
  navShares: document.getElementById("nav-shares"),
  main: document.getElementById("main"),
  fab: document.getElementById("fab"),
};

const state = {
  shares: [],
  tunnel: { running: false, url: null },
  route: { view: "home" },
  browser: null,
  browserShareId: null,
  lastBrowsePath: null,
};

async function api(url, opts) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText || "Request failed");
  return data;
}
const jsonBody = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

function permissionLabel(p) {
  return p === "both" ? "Read & write" : p === "read" ? "Read only" : "Upload only";
}

function shareLink(share) {
  return (state.tunnel.url || location.origin) + "/share/" + share.id;
}

// ---------- Routing: #/  or  #/s/<shareId>/<encoded rel> ----------
function parseRoute() {
  const m = location.hash.match(/^#\/s\/([^/]+)(?:\/(.*))?$/);
  if (m) return { view: "share", id: m[1], rel: decodeURIComponent(m[2] || "") };
  return { view: "home" };
}
function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}
const shareHash = (id, rel = "") => "#/s/" + id + "/" + encodeURIComponent(rel);

function route() {
  state.route = parseRoute();
  els.searchInput.value = "";
  if (state.route.view === "share") {
    const share = state.shares.find((s) => s.id === state.route.id);
    if (!share) {
      if (state.shares.length) go("#/");
      return;
    }
    openShareView(share, state.route.rel);
  } else {
    state.browser = null;
    state.browserShareId = null;
    renderHome();
  }
  renderNav();
}

// ---------- Sidebar ----------
function renderNav() {
  els.navHome.replaceChildren(icon("home"), h("span", { text: "All shared folders" }));
  els.navHome.classList.toggle("active", state.route.view === "home");
  els.navHome.onclick = () => go("#/");
  els.navShares.replaceChildren(
    ...state.shares.map((s) =>
      h(
        "button",
        {
          class: "nav-item" + (state.route.view === "share" && state.route.id === s.id ? " active" : ""),
          title: s.path,
          onclick: () => {
            shell.closeDrawer();
            go(shareHash(s.id));
          },
        },
        icon("folderShared"),
        h("span", { text: s.name })
      )
    )
  );
}

function newMenu(anchor) {
  const share = currentShare();
  Drive.showMenu(anchor, [
    { label: "Share a folder", icon: "folderShared", onClick: () => { shell.closeDrawer(); openAddFolderDialog(); } },
    share && share.permission !== "read" && state.browser
      ? { label: "File upload", icon: "upload", onClick: () => { shell.closeDrawer(); state.browser.upload(); } }
      : null,
  ]);
}

function currentShare() {
  return state.route.view === "share" ? state.shares.find((s) => s.id === state.route.id) : null;
}

// ---------- Home: shared folder cards ----------
async function refreshShares() {
  const data = await api("/api/shares");
  state.shares = data.shares;
  renderNav();
  if (state.route.view === "home") renderHome();
}

function renderHome() {
  const query = els.searchInput.value.trim().toLowerCase();
  const shares = query ? state.shares.filter((s) => s.name.toLowerCase().includes(query) || s.path.toLowerCase().includes(query)) : state.shares;
  const content = h("div", { class: "content" });
  if (!state.shares.length) {
    content.appendChild(
      h(
        "div",
        { class: "empty" },
        icon("folderShared"),
        h("h3", { text: "No shared folders yet" }),
        h("p", { text: "Pick a folder on this computer to share it with a link and password." }),
        h("button", { class: "btn", onclick: openAddFolderDialog }, icon("add"), "Share a folder")
      )
    );
  } else if (!shares.length) {
    content.appendChild(h("div", { class: "empty" }, icon("search"), h("h3", { text: "No matching folders" })));
  } else {
    content.appendChild(h("div", { class: "share-grid", style: "margin-top:8px" }, shares.map(shareCard)));
  }
  els.main.replaceChildren(
    h(
      "div",
      { class: "page-head" },
      h("h2", { text: "Shared folders" }),
      h("button", { class: "btn small", onclick: openAddFolderDialog }, icon("add"), "Share a folder")
    ),
    content
  );
}

function shareMenuItems(share) {
  return [
    { title: share.name },
    { label: "Open", icon: "open", onClick: () => go(shareHash(share.id)) },
    { label: "Share settings", icon: "tune", onClick: () => openShareDialog(share) },
    "sep",
    { label: "Copy link", icon: "link", onClick: () => Drive.copyText(shareLink(share), "Link copied") },
    { label: "Copy link + password", icon: "copy", onClick: () => quickShare(share) },
    { label: "New password", icon: "key", onClick: () => regeneratePassword(share) },
    "sep",
    { label: "Stop sharing", icon: "delete", danger: true, onClick: () => removeShare(share) },
  ];
}

function shareCard(share) {
  const more = h("button", { class: "icon-btn sm", title: "More actions", "aria-label": "More actions" }, icon("more"));
  more.onclick = (e) => {
    e.stopPropagation();
    Drive.showMenu(more, shareMenuItems(share));
  };
  const stop = (fn) => (e) => {
    e.stopPropagation();
    fn();
  };
  const card = h(
    "div",
    { class: "share-card", tabindex: "0", onclick: () => go(shareHash(share.id)) },
    h(
      "div",
      { class: "share-card-top" },
      h("div", { class: "share-card-icon" }, icon("folderShared")),
      h("div", { class: "share-card-text" }, h("div", { class: "share-card-name", text: share.name }), h("div", { class: "share-card-path", text: share.path, title: share.path })),
      more
    ),
    h(
      "div",
      { class: "share-card-actions" },
      h("span", { class: "perm-badge", text: permissionLabel(share.permission) }),
      h("button", { class: "btn outline small", onclick: stop(() => Drive.copyText(shareLink(share), "Link copied")) }, icon("link"), "Link"),
      h("button", { class: "btn tonal small", onclick: stop(() => quickShare(share)) }, icon("share"), "Share")
    )
  );
  card.onkeydown = (e) => {
    if (e.key === "Enter" && e.target === card) card.onclick();
  };
  card.oncontextmenu = (e) => {
    e.preventDefault();
    Drive.showMenu({ x: e.clientX, y: e.clientY }, shareMenuItems(share));
  };
  return card;
}

function quickShare(share) {
  Drive.copyText(`${share.name}\nLink: ${shareLink(share)}\nPassword: ${share.password}`, "Link and password copied");
}

async function regeneratePassword(share) {
  const ok = await Drive.confirmDialog(
    "Create a new password?",
    "Anyone using the current password will be signed out and need the new one.",
    "New password"
  );
  if (!ok) return null;
  try {
    const { share: updated } = await api(`/api/shares/${share.id}/regenerate-password`, { method: "POST" });
    await refreshShares();
    toast("New password created");
    return updated;
  } catch (e) {
    toast(e.message, { error: true });
    return null;
  }
}

async function removeShare(share) {
  const ok = await Drive.confirmDialog(
    "Stop sharing “" + share.name + "”?",
    "The link will stop working. Files in the folder are not deleted.",
    "Stop sharing",
    true
  );
  if (!ok) return;
  try {
    await api(`/api/shares/${share.id}`, { method: "DELETE" });
    toast("Stopped sharing " + share.name);
    if (currentShare()?.id === share.id) go("#/");
    await refreshShares();
  } catch (e) {
    toast(e.message, { error: true });
  }
}

function permissionSelect(value) {
  const select = h("select", { id: "perm-select" });
  for (const p of ["both", "read", "write"]) select.appendChild(h("option", { value: p, text: permissionLabel(p), selected: p === value }));
  return select;
}

// ---------- Share settings dialog ----------
function openShareDialog(share) {
  const select = permissionSelect(share.permission);
  const limitInput = h("input", { type: "number", id: "limit-input", min: "1", placeholder: "Default (" + share.effectiveMaxUploadMB + ")", value: share.maxUploadMB || "" });
  const limitField = h("div", { class: "field" }, h("label", { for: "limit-input", text: "Upload limit (MB per file)" }), limitInput);
  const sync = () => (limitField.hidden = select.value === "read");
  select.onchange = sync;
  sync();
  const passCode = h("code", { text: share.password });
  const body = h(
    "div",
    {},
    h("div", { class: "field" }, h("label", { text: "Link" }), h("div", { class: "copy-row" }, h("code", { text: shareLink(share) }), h("button", { class: "icon-btn", title: "Copy link", onclick: () => Drive.copyText(shareLink(share), "Link copied") }, icon("copy")))),
    h(
      "div",
      { class: "field" },
      h("label", { text: "Password" }),
      h(
        "div",
        { class: "copy-row" },
        passCode,
        h("button", { class: "icon-btn", title: "Copy password", onclick: () => Drive.copyText(passCode.textContent, "Password copied") }, icon("copy")),
        h("button", {
          class: "icon-btn",
          title: "New password",
          onclick: async () => {
            const updated = await regeneratePassword(share);
            if (updated) {
              share = updated;
              passCode.textContent = updated.password;
            }
          },
        }, icon("refresh"))
      )
    ),
    h("div", { class: "field-row" }, h("div", { class: "field" }, h("label", { for: "perm-select", text: "Access" }), select), limitField),
    h("div", { class: "hint", text: share.path })
  );
  Drive.dialog({
    title: "Share “" + share.name + "”",
    body,
    actions: [
      { label: "Copy link + password", kind: "text", onClick: () => { quickShare(share); return false; } },
      {
        label: "Save",
        kind: "filled",
        onClick: async () => {
          const raw = limitInput.value.trim();
          await api(`/api/shares/${share.id}`, jsonBody("PATCH", { permission: select.value, maxUploadMB: raw ? Number(raw) : null }));
          await refreshShares();
          toast("Settings saved");
          // Permission changes what the browser can show, so rebuild it.
          if (currentShare()?.id === share.id) {
            state.browserShareId = null;
            route();
          }
        },
      },
    ],
  });
}

// ---------- Add folder (folder picker) dialog ----------
function openAddFolderDialog() {
  const pathText = h("span");
  const upBtn = h("button", { class: "icon-btn sm", title: "Up one level", "aria-label": "Up one level" }, icon("arrowUp"));
  const list = h("div", { class: "picker-list" });
  const select = permissionSelect("both");
  const limitInput = h("input", { type: "number", id: "limit-input", min: "1", placeholder: "Default" });
  const limitField = h("div", { class: "field" }, h("label", { for: "limit-input", text: "Upload limit (MB per file)" }), limitInput);
  select.onchange = () => (limitField.hidden = select.value === "read");
  let current = null;

  async function browse(dirPath) {
    list.replaceChildren(h("div", { class: "picker-empty", text: "Loading…" }));
    try {
      const data = await api("/api/browse" + (dirPath ? "?path=" + encodeURIComponent(dirPath) : ""));
      current = data.path;
      state.lastBrowsePath = data.path;
      pathText.textContent = data.path;
      const canGoUp = data.parent && data.parent !== data.path;
      upBtn.disabled = !canGoUp;
      upBtn.onclick = () => canGoUp && browse(data.parent);
      list.replaceChildren(
        ...data.entries.map((name) =>
          h("button", { class: "picker-item", title: name, onclick: () => browse(joinPath(data.path, name)) }, icon("folder"), h("span", { text: name }))
        )
      );
      if (!data.entries.length) list.appendChild(h("div", { class: "picker-empty", text: "No subfolders here — you can share this folder." }));
    } catch (e) {
      list.replaceChildren(h("div", { class: "picker-empty", text: e.message }));
    }
  }

  Drive.dialog({
    title: "Share a folder",
    body: h(
      "div",
      {},
      h("div", { class: "picker-path" }, pathText, upBtn),
      list,
      h("div", { class: "field-row" }, h("div", { class: "field" }, h("label", { for: "perm-select", text: "Access" }), select), limitField)
    ),
    actions: [
      { label: "Cancel", kind: "text" },
      {
        label: "Share this folder",
        kind: "filled",
        onClick: async () => {
          if (!current) return false;
          const permission = select.value;
          const raw = limitInput.value.trim();
          const { share } = await api(
            "/api/shares",
            jsonBody("POST", { path: current, permission, maxUploadMB: permission !== "read" && raw ? Number(raw) : undefined })
          );
          await refreshShares();
          toast("Shared " + share.name);
          openShareDialog(state.shares.find((s) => s.id === share.id) || share);
        },
      },
    ],
  });
  browse(state.lastBrowsePath);
}

function joinPath(base, name) {
  return base.endsWith("/") ? base + name : base + "/" + name;
}

// ---------- Share browser ----------
function openShareView(share, rel) {
  if (state.browserShareId !== share.id || !state.browser) {
    const sid = share.id;
    const q = (r) => "?path=" + encodeURIComponent(r);
    state.browser = Drive.createBrowser({
      mount: els.main,
      rootName: share.name,
      permission: share.permission,
      maxUploadMB: share.effectiveMaxUploadMB,
      urls: {
        files: (r) => `/api/shares/${sid}/files` + q(r),
        download: (r) => `/api/shares/${sid}/download` + q(r),
        zip: (r) => `/api/shares/${sid}/download-zip` + q(r),
        preview: (r) => `/api/shares/${sid}/preview` + q(r),
        upload: (r) => `/api/shares/${sid}/upload` + q(r),
      },
      navigate: (r) => go(shareHash(sid, r)),
      toolbarExtras: [{ icon: "share", label: "Share", onClick: () => openShareDialog(share) }],
    });
    state.browserShareId = share.id;
  }
  state.browser.search("");
  state.browser.load(rel);
}

els.searchInput.addEventListener("input", () => {
  if (state.route.view === "share" && state.browser) state.browser.search(els.searchInput.value);
  else renderHome();
});

// ---------- Tunnel ----------
async function refreshTunnel() {
  try {
    renderTunnel(await api("/api/tunnel/status"));
  } catch {
    /* ignore transient errors during polling */
  }
}

function renderTunnel(status) {
  const prevUrl = state.tunnel.url;
  state.tunnel = { running: !!status.running, url: status.running ? status.url : null };
  const cls = "dot " + (status.running ? "running" : "stopped");
  els.tunnelIndicator.className = cls;
  els.tunnelChipDot.className = cls;
  els.tunnelLabel.textContent = status.running ? (status.url ? "Tunnel running" : "Connecting…") : "Tunnel stopped";
  els.tunnelChipLabel.textContent = status.running ? (status.url ? "Online" : "Connecting…") : "Local only";
  els.tunnelToggle.textContent = status.running ? "Stop tunnel" : "Start tunnel";
  els.tunnelUrl.hidden = !(status.running && status.url);
  els.tunnelUrl.textContent = status.url || "";
  els.tunnelUrl.title = "Copy public URL";
  if (prevUrl !== state.tunnel.url && state.route.view === "home") renderHome();
}

els.tunnelUrl.onclick = () => Drive.copyText(state.tunnel.url, "Public URL copied");

async function toggleTunnel() {
  const wasRunning = state.tunnel.running;
  els.tunnelToggle.disabled = true;
  els.tunnelLabel.textContent = wasRunning ? "Stopping…" : "Starting…";
  try {
    if (wasRunning) await api("/api/tunnel/stop", { method: "POST" });
    else {
      const result = await api("/api/tunnel/start", { method: "POST" });
      if (result.error && !result.url) toast(result.error, { error: true });
    }
  } catch (e) {
    toast(e.message, { error: true });
  } finally {
    els.tunnelToggle.disabled = false;
    refreshTunnel();
  }
}
els.tunnelToggle.onclick = toggleTunnel;

els.tunnelChip.onclick = (e) => {
  e.stopPropagation();
  const t = state.tunnel;
  Drive.showMenu(els.tunnelChip, [
    { title: t.running ? (t.url ? "Public tunnel is online" : "Tunnel is connecting…") : "Only reachable on this network" },
    t.url ? { label: "Copy public URL", icon: "copy", onClick: () => Drive.copyText(t.url, "Public URL copied") } : null,
    { label: t.running ? "Stop tunnel" : "Start tunnel", icon: "cloud", onClick: toggleTunnel },
  ]);
};

// ---------- init ----------
async function loadVersion() {
  try {
    const { version } = await api("/api/version");
    if (version) {
      els.versionTag.textContent = "v" + version;
      els.versionTag.hidden = false;
    }
  } catch {
    /* version badge is cosmetic; ignore failures */
  }
}

els.menuBtn.replaceChildren(icon("menu"));
els.searchIcon.replaceChildren(icon("search"));
document.getElementById("brand-logo").replaceChildren(logo());
document.getElementById("drawer-logo").replaceChildren(logo());
els.newBtn.replaceChildren(icon("add"), h("span", { text: "New" }));
els.newBtn.onclick = (e) => {
  e.stopPropagation();
  newMenu(els.newBtn);
};
els.fab.replaceChildren(icon("add"));
els.fab.onclick = (e) => {
  e.stopPropagation();
  newMenu(els.fab);
};
const shell = Drive.initShell();
window.addEventListener("hashchange", route);

loadVersion();
refreshTunnel();
setInterval(refreshTunnel, 5000);
refreshShares()
  .then(route)
  .catch((e) => toast(e.message, { error: true }));
