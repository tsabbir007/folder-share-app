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
  tunnelSettings: document.getElementById("tunnel-settings"),
  newBtn: document.getElementById("new-btn"),
  navHome: document.getElementById("nav-home"),
  navAll: document.getElementById("nav-all"),
  navTrash: document.getElementById("nav-trash"),
  navSettings: document.getElementById("nav-settings"),
  navShares: document.getElementById("nav-shares"),
  main: document.getElementById("main"),
  fab: document.getElementById("fab"),
};

const state = {
  shares: [],
  tunnel: { running: false, url: null, mode: null, config: { mode: "quick", hostname: "", hasToken: false } },
  route: { view: "home" },
  browser: null,
  browserShareId: null,
  lastBrowsePath: null,
  settings: { rootPath: "", rootName: "All folders", rootAvailable: false, maxUploadMB: null },
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

// The starting folder ("All folders") behaves like a share with id "root"
// on the admin API, so it reuses the same browser and copy/move/delete code.
const ROOT_ID = "root";
function rootShare() {
  const st = state.settings;
  return { id: ROOT_ID, name: st.rootName, path: st.rootPath, permission: "both", effectiveMaxUploadMB: st.maxUploadMB, isRoot: true };
}
function findAny(id) {
  return id === ROOT_ID ? rootShare() : state.shares.find((s) => s.id === id);
}

async function refreshSettings() {
  state.settings = await api("/api/settings");
  renderNav();
}

// ---------- Routing: #/  ·  #/all/<encoded rel>  ·  #/s/<shareId>/<encoded rel> ----------
function parseRoute() {
  const m = location.hash.match(/^#\/s\/([^/]+)(?:\/(.*))?$/);
  if (m) return { view: "share", id: m[1], rel: decodeURIComponent(m[2] || "") };
  const a = location.hash.match(/^#\/all(?:\/(.*))?$/);
  if (a) return { view: "all", rel: decodeURIComponent(a[1] || "") };
  if (location.hash === "#/trash") return { view: "trash" };
  return { view: "home" };
}
function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}
const shareHash = (id, rel = "") => "#/s/" + id + "/" + encodeURIComponent(rel);
const allHash = (rel = "") => "#/all/" + encodeURIComponent(rel);

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
  } else if (state.route.view === "all") {
    openRootView(state.route.rel);
  } else if (state.route.view === "trash") {
    state.browser = null;
    state.browserShareId = null;
    loadTrash();
  } else {
    state.browser = null;
    state.browserShareId = null;
    resetShareSizes(); // fresh sizes each time the home page is opened
    renderHome();
  }
  renderNav();
}

// ---------- Sidebar ----------
function renderNav() {
  els.navHome.replaceChildren(icon("home"), h("span", { text: "All shared folders" }));
  els.navHome.classList.toggle("active", state.route.view === "home");
  els.navHome.onclick = () => go("#/");
  els.navAll.replaceChildren(icon("folder"), h("span", { text: "All folders" }));
  els.navAll.title = state.settings.rootPath;
  els.navAll.classList.toggle("active", state.route.view === "all");
  els.navAll.onclick = () => go(allHash());
  els.navTrash.replaceChildren(icon("delete"), h("span", { text: "Recycle bin" }));
  els.navTrash.classList.toggle("active", state.route.view === "trash");
  els.navTrash.onclick = () => go("#/trash");
  els.navSettings.replaceChildren(icon("tune"), h("span", { text: "Settings" }));
  els.navSettings.onclick = () => {
    shell.closeDrawer();
    openSettingsDialog();
  };
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
    share && state.browser
      ? { label: "New folder", icon: "add", onClick: () => { shell.closeDrawer(); createFolder(share); } }
      : null,
    { label: "Share a folder", icon: "folderShared", onClick: () => { shell.closeDrawer(); openAddFolderDialog(); } },
    share && share.permission !== "read" && state.browser
      ? { label: "File upload", icon: "upload", onClick: () => { shell.closeDrawer(); state.browser.upload(); } }
      : null,
  ]);
}

function currentShare() {
  if (state.route.view === "all") return state.settings.rootAvailable ? rootShare() : null;
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
    share.requirePassword ? { label: "Copy link + password", icon: "copy", onClick: () => quickShare(share) } : null,
    share.requirePassword ? { label: "New password", icon: "key", onClick: () => regeneratePassword(share) } : null,
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
      h(
        "div",
        { class: "share-card-text" },
        h("div", { class: "share-card-title" }, h("div", { class: "share-card-name", text: share.name }), shareSizeEl(share)),
        h("div", { class: "share-card-path", text: share.path, title: share.path })
      ),
      more
    ),
    h(
      "div",
      { class: "share-card-actions" },
      h("span", { class: "perm-badge", text: permissionLabel(share.permission) + (share.requirePassword ? "" : " · No password") }),
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

// Total size of each shared folder on the home page. Fetched once per visit
// to the home page (two at a time) and filled into every matching card.
const shareSizes = new Map(); // share id -> bytes | null (unavailable) | "pending"
let shareSizeQueue = [];
let shareSizeActive = 0;

function resetShareSizes() {
  shareSizes.clear();
  shareSizeQueue = [];
}

function shareSizeEl(share) {
  const el = h("span", { class: "share-card-size", "data-share-size": share.id });
  const known = shareSizes.get(share.id);
  if (known === undefined) {
    shareSizes.set(share.id, "pending");
    shareSizeQueue.push(share.id);
    pumpShareSizes();
  }
  el.textContent = known === undefined || known === "pending" ? "…" : known === null ? "" : Drive.formatSize(known);
  return el;
}

function pumpShareSizes() {
  while (shareSizeActive < 2 && shareSizeQueue.length) {
    const id = shareSizeQueue.shift();
    shareSizeActive++;
    api(`/api/shares/${id}/folder-size?path=`)
      .then((d) => d.size)
      .catch(() => null)
      .then((size) => {
        shareSizeActive--;
        if (shareSizes.get(id) === "pending") {
          shareSizes.set(id, size);
          for (const el of document.querySelectorAll(`[data-share-size="${id}"]`)) el.textContent = size == null ? "" : Drive.formatSize(size);
        }
        pumpShareSizes();
      });
  }
}

function quickShare(share) {
  if (!share.requirePassword) return Drive.copyText(`${share.name}\nLink: ${shareLink(share)}`, "Link copied");
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

function passwordToggle(checked) {
  const input = h("input", { type: "checkbox", id: "require-password", checked });
  const row = h(
    "label",
    { class: "check-row", for: "require-password" },
    input,
    h("span", {}, h("strong", { text: "Require password" }), h("small", { text: "Turn off to let anyone with the link open this folder." }))
  );
  return { input, row };
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
  const pw = passwordToggle(share.requirePassword);
  let passField;
  pw.input.onchange = () => (passField.hidden = !pw.input.checked);
  const body = h(
    "div",
    {},
    h("div", { class: "field" }, h("label", { text: "Link" }), h("div", { class: "copy-row" }, h("code", { text: shareLink(share) }), h("button", { class: "icon-btn", title: "Copy link", onclick: () => Drive.copyText(shareLink(share), "Link copied") }, icon("copy")))),
    pw.row,
    (passField = h(
      "div",
      { class: "field", hidden: !share.requirePassword },
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
    )),
    h("div", { class: "field-row" }, h("div", { class: "field" }, h("label", { for: "perm-select", text: "Access" }), select), limitField),
    h("div", { class: "hint", text: share.path })
  );
  Drive.dialog({
    title: "Share “" + share.name + "”",
    body,
    actions: [
      { label: "Copy link", kind: "text", onClick: () => { quickShare({ ...share, requirePassword: pw.input.checked }); return false; } },
      {
        label: "Save",
        kind: "filled",
        onClick: async () => {
          const raw = limitInput.value.trim();
          await api(`/api/shares/${share.id}`, jsonBody("PATCH", { permission: select.value, maxUploadMB: raw ? Number(raw) : null, requirePassword: pw.input.checked }));
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

// ---------- Folder picker over the server's filesystem ----------
// With no starting path, the server opens it at the starting folder.
function createFolderPicker(emptyText) {
  const pathText = h("span");
  const upBtn = h("button", { class: "icon-btn sm", title: "Up one level", "aria-label": "Up one level" }, icon("arrowUp"));
  const list = h("div", { class: "picker-list" });
  const picker = {
    current: null,
    el: h("div", {}, h("div", { class: "picker-path" }, pathText, upBtn), list),
    async browse(dirPath) {
      list.replaceChildren(h("div", { class: "picker-empty", text: "Loading…" }));
      try {
        const data = await api("/api/browse" + (dirPath ? "?path=" + encodeURIComponent(dirPath) : ""));
        picker.current = data.path;
        pathText.textContent = data.path;
        const canGoUp = data.parent && data.parent !== data.path;
        upBtn.disabled = !canGoUp;
        upBtn.onclick = () => canGoUp && picker.browse(data.parent);
        list.replaceChildren(
          ...data.entries.map((name) =>
            h("button", { class: "picker-item", title: name, onclick: () => picker.browse(joinPath(data.path, name)) }, icon("folder"), h("span", { text: name }))
          )
        );
        if (!data.entries.length) list.appendChild(h("div", { class: "picker-empty", text: emptyText }));
      } catch (e) {
        list.replaceChildren(h("div", { class: "picker-empty", text: e.message }));
      }
    },
  };
  return picker;
}

// ---------- Add folder (folder picker) dialog ----------
function openAddFolderDialog(startPath) {
  const picker = createFolderPicker("No subfolders here — you can share this folder.");
  const select = permissionSelect("both");
  const limitInput = h("input", { type: "number", id: "limit-input", min: "1", placeholder: "Default" });
  const limitField = h("div", { class: "field" }, h("label", { for: "limit-input", text: "Upload limit (MB per file)" }), limitInput);
  select.onchange = () => (limitField.hidden = select.value === "read");
  const pw = passwordToggle(true);

  Drive.dialog({
    title: "Share a folder",
    body: h(
      "div",
      {},
      picker.el,
      h("div", { class: "field-row" }, h("div", { class: "field" }, h("label", { for: "perm-select", text: "Access" }), select), limitField),
      pw.row
    ),
    actions: [
      { label: "Cancel", kind: "text" },
      {
        label: "Share this folder",
        kind: "filled",
        onClick: async () => {
          const current = picker.current;
          if (!current) return false;
          state.lastBrowsePath = current;
          const permission = select.value;
          const raw = limitInput.value.trim();
          const { share } = await api(
            "/api/shares",
            jsonBody("POST", {
              path: current,
              permission,
              maxUploadMB: permission !== "read" && raw ? Number(raw) : undefined,
              requirePassword: pw.input.checked,
            })
          );
          await refreshShares();
          toast("Shared " + share.name);
          openShareDialog(state.shares.find((s) => s.id === share.id) || share);
        },
      },
    ],
  });
  picker.browse(typeof startPath === "string" ? startPath : state.lastBrowsePath);
}

// ---------- Settings dialog ----------
function openSettingsDialog() {
  const picker = createFolderPicker("No subfolders here — you can use this folder.");
  const st = state.settings;
  const save = async (rootPath) => {
    try {
      state.settings = await api("/api/settings", jsonBody("PUT", { rootPath }));
    } catch (e) {
      toast(e.message, { error: true });
      return false;
    }
    toast("Starting folder set to " + state.settings.rootPath);
    state.lastBrowsePath = null;
    state.browserShareId = null;
    renderNav();
    if (state.route.view === "all") go(allHash());
  };
  Drive.dialog({
    title: "Settings",
    body: h(
      "div",
      {},
      h("div", { class: "field" }, h("label", { text: "Starting folder" }), h("div", { class: "copy-row" }, h("code", { text: st.rootPath }))),
      h("div", {
        class: "hint",
        text:
          (st.rootAvailable ? "" : "Not connected right now. ") +
          "“All folders” shows everything inside this folder, and the folder picker opens here. Pick a new one below:",
      }),
      picker.el
    ),
    actions: [
      st.rootPath !== st.defaultRootPath ? { label: "Reset to default", kind: "text", onClick: () => save(st.defaultRootPath) } : null,
      { label: "Cancel", kind: "text" },
      { label: "Use this folder", kind: "filled", onClick: () => picker.current && save(picker.current) },
    ].filter(Boolean),
  });
  picker.browse(st.rootAvailable ? st.rootPath : null);
}

function joinPath(base, name) {
  return base.endsWith("/") ? base + name : base + "/" + name;
}

// ---------- Share browser ----------
// Shown instead of the browser when the starting folder's drive is unplugged.
function renderRootUnavailable() {
  state.browser = null;
  state.browserShareId = null;
  const st = state.settings;
  els.main.replaceChildren(
    h("div", { class: "page-head" }, h("h2", { text: "All folders" })),
    h(
      "div",
      { class: "content" },
      h(
        "div",
        { class: "empty" },
        icon("folder"),
        h("h3", { text: "“" + st.rootName + "” isn't available" }),
        h("p", { text: st.rootPath + " can't be found. If it's an external drive, check that it's connected, then try again." }),
        h(
          "div",
          { class: "empty-actions" },
          h("button", { class: "btn", onclick: () => route() }, icon("refresh"), "Try again"),
          h("button", { class: "btn outline", onclick: openSettingsDialog }, icon("tune"), "Change starting folder")
        )
      )
    )
  );
}

async function openRootView(rel) {
  try {
    await refreshSettings();
  } catch (e) {
    toast(e.message, { error: true });
  }
  if (state.route.view !== "all") return; // navigated away while loading
  if (!state.settings.rootAvailable) return renderRootUnavailable();
  openShareView(rootShare(), rel);
}

function openShareView(share, rel) {
  // Keyed by path too, so changing the starting folder rebuilds the root browser.
  const key = share.id + ":" + share.path;
  if (state.browserShareId !== key || !state.browser) {
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
        folderSize: (r) => `/api/shares/${sid}/folder-size` + q(r),
      },
      navigate: (r) => go(share.isRoot ? allHash(r) : shareHash(sid, r)),
      itemActions: (entry, r) => [
        entry.isDir ? { label: "Share this folder", icon: "folderShared", onClick: () => shareSubfolder(share, r) } : null,
        { label: "Copy to…", icon: "copy", onClick: () => transferItem(share, entry, r, "copy") },
        { label: "Move to…", icon: "move", onClick: () => transferItem(share, entry, r, "move") },
        { label: "Delete", icon: "delete", danger: true, onClick: () => deleteItem(share, entry, r) },
      ],
      toolbarExtras: [
        { icon: "add", label: "New folder", onClick: () => createFolder(share) },
        share.isRoot ? null : { icon: "share", label: "Share", onClick: () => openShareDialog(share) },
      ].filter(Boolean),
    });
    state.browserShareId = key;
  }
  state.browser.search("");
  state.browser.load(rel);
}

function createFolder(share) {
  const parent = state.browser?.rel || "";
  const input = h("input", { type: "text", id: "folder-name", value: "Untitled folder", autocomplete: "off" });
  const where = share.name + (parent ? "/" + parent : "");
  Drive.dialog({
    title: "New folder",
    body: h("div", {}, h("div", { class: "field" }, h("label", { for: "folder-name", text: "Name" }), input), h("div", { class: "hint", text: "In " + where })),
    actions: [
      { label: "Cancel", kind: "text" },
      {
        label: "Create",
        kind: "filled",
        onClick: async () => {
          try {
            const { name } = await api(`/api/shares/${share.id}/folders`, jsonBody("POST", { path: parent, name: input.value }));
            toast("Created " + name);
            state.browser?.refresh();
          } catch (e) {
            toast(e.message, { error: true });
            return false;
          }
        },
      },
    ],
  });
  input.select();
  input.onkeydown = (e) => {
    if (e.key === "Enter") input.closest(".dialog").querySelector(".dialog-foot .btn:last-child").click();
  };
}

// Opens the "Share a folder" dialog already pointed at this subfolder.
function shareSubfolder(share, rel) {
  openAddFolderDialog(joinPath(share.path, rel));
}

// ---------- Copy / move / delete (admin only) ----------
const parentRel = (r) => (r.includes("/") ? r.slice(0, r.lastIndexOf("/")) : "");

// Lets the admin pick a folder inside any shared folder. Resolves to
// { shareId, rel } or null if cancelled.
function pickDestination(title, okLabel, start) {
  return new Promise((resolve) => {
    let shareId = start.shareId;
    let rel = start.rel;
    let picked = null;
    const shareSelect = h("select", { id: "dest-share" });
    shareSelect.appendChild(h("option", { value: ROOT_ID, text: "All folders (" + state.settings.rootName + ")", selected: shareId === ROOT_ID }));
    for (const s of state.shares) shareSelect.appendChild(h("option", { value: s.id, text: s.name, selected: s.id === shareId }));
    const pathText = h("span");
    const upBtn = h("button", { class: "icon-btn sm", title: "Up one level", "aria-label": "Up one level" }, icon("arrowUp"));
    const list = h("div", { class: "picker-list" });

    async function browse(nextShareId, nextRel) {
      list.replaceChildren(h("div", { class: "picker-empty", text: "Loading…" }));
      try {
        const data = await api(`/api/shares/${nextShareId}/files?path=` + encodeURIComponent(nextRel));
        shareId = nextShareId;
        rel = data.path;
        pathText.textContent = findAny(shareId).name + (rel ? "/" + rel : "");
        upBtn.disabled = !rel;
        upBtn.onclick = () => rel && browse(shareId, parentRel(rel));
        const dirs = data.entries.filter((e) => e.isDir).sort((a, b) => a.name.localeCompare(b.name));
        list.replaceChildren(
          ...dirs.map((d) =>
            h("button", { class: "picker-item", title: d.name, onclick: () => browse(shareId, rel ? rel + "/" + d.name : d.name) }, icon("folder"), h("span", { text: d.name }))
          )
        );
        if (!dirs.length) list.appendChild(h("div", { class: "picker-empty", text: "No subfolders here — you can choose this folder." }));
      } catch (e) {
        list.replaceChildren(h("div", { class: "picker-empty", text: e.message }));
      }
    }
    shareSelect.onchange = () => browse(shareSelect.value, "");

    Drive.dialog({
      title,
      body: h(
        "div",
        {},
        h("div", { class: "field" }, h("label", { for: "dest-share", text: "Location" }), shareSelect),
        h("div", { class: "picker-path" }, pathText, upBtn),
        list
      ),
      actions: [
        { label: "Cancel", kind: "text" },
        { label: okLabel, kind: "filled", onClick: () => { picked = { shareId, rel }; } },
      ],
      onClose: () => resolve(picked),
    });
    browse(shareId, rel);
  });
}

async function transferItem(share, entry, rel, mode) {
  const verb = mode === "copy" ? "Copy" : "Move";
  const dest = await pickDestination(`${verb} “${entry.name}”`, `${verb} here`, { shareId: share.id, rel: parentRel(rel) });
  if (!dest) return;
  // Stays up until the request finishes; big folders can take a while.
  const working = toast((mode === "copy" ? "Copying " : "Moving ") + entry.name + "…", { duration: 60 * 60 * 1000 });
  try {
    const result = await api(`/api/shares/${share.id}/items/${mode}`, jsonBody("POST", { path: rel, destShareId: dest.shareId, destPath: dest.rel }));
    const where = findAny(dest.shareId).name + (dest.rel ? "/" + dest.rel : "");
    toast(`${mode === "copy" ? "Copied" : "Moved"} to ${where}` + (result.name !== entry.name ? ` as “${result.name}”` : ""));
  } catch (e) {
    toast(e.message, { error: true });
  } finally {
    working.remove();
    state.browser?.refresh();
  }
}

// Deleting is reversible (it goes to the recycle bin), so no confirmation.
async function deleteItem(share, entry, rel) {
  try {
    await api(`/api/shares/${share.id}/items?path=` + encodeURIComponent(rel), { method: "DELETE" });
    toast("Moved “" + entry.name + "” to the recycle bin");
  } catch (e) {
    toast(e.message, { error: true });
  } finally {
    state.browser?.refresh();
  }
}

// ---------- Recycle bin ----------
let trashItems = [];

async function loadTrash() {
  try {
    trashItems = (await api("/api/trash")).items;
  } catch (e) {
    toast(e.message, { error: true });
  }
  if (state.route.view === "trash") renderTrash();
}

function renderTrash() {
  const query = els.searchInput.value.trim().toLowerCase();
  const items = query ? trashItems.filter((t) => t.name.toLowerCase().includes(query)) : trashItems;
  const content = h("div", { class: "content" });
  if (!trashItems.length) {
    content.appendChild(h("div", { class: "empty" }, icon("delete"), h("h3", { text: "Recycle bin is empty" }), h("p", { text: "Things you delete show up here until you empty the bin." })));
  } else if (!items.length) {
    content.appendChild(h("div", { class: "empty" }, icon("search"), h("h3", { text: "No matching items" })));
  } else {
    content.appendChild(h("div", { class: "trash-list" }, items.map(trashRow)));
  }
  els.main.replaceChildren(
    h(
      "div",
      { class: "page-head" },
      h("h2", { text: "Recycle bin" }),
      trashItems.length ? h("button", { class: "btn outline small", onclick: emptyTrash }, icon("delete"), "Empty recycle bin") : null
    ),
    trashItems.length ? h("div", { class: "hint trash-note", text: "Items here still use disk space. Restore puts an item back where it was deleted from." }) : null,
    content
  );
}

function trashRow(item) {
  const from = item.originalPath.slice(0, item.originalPath.length - item.name.length).replace(/\/$/, "") || "/";
  const meta = ["Deleted " + Drive.formatDate(item.deletedAt), item.size != null ? Drive.formatSize(item.size) : null, item.available ? null : "drive not connected"]
    .filter(Boolean)
    .join(" · ");
  const more = h("button", { class: "icon-btn sm", title: "More actions", "aria-label": "More actions for " + item.name }, icon("more"));
  more.onclick = (e) => {
    e.stopPropagation();
    Drive.showMenu(more, [
      { title: item.name },
      { label: "Restore", icon: "refresh", onClick: () => restoreTrash(item) },
      { label: "Delete forever", icon: "delete", danger: true, onClick: () => purgeTrash(item) },
    ]);
  };
  return h(
    "div",
    { class: "trash-row" + (item.available ? "" : " unavailable") },
    h("div", { class: "mini-thumb" + (item.isDir ? " is-dir" : "") }, item.isDir ? icon("folder") : Drive.kindIcon(Drive.fileKind(item.name))),
    h("div", { class: "trash-text" }, h("div", { class: "name", text: item.name, title: item.name }), h("div", { class: "trash-sub", text: from, title: from }), h("div", { class: "trash-sub", text: meta })),
    h("button", { class: "btn tonal small", onclick: () => restoreTrash(item), disabled: !item.available }, "Restore"),
    more
  );
}

async function restoreTrash(item) {
  try {
    const { name } = await api(`/api/trash/${item.id}/restore`, { method: "POST" });
    toast("Restored " + (name !== item.name ? "as “" + name + "”" : "“" + name + "”"));
  } catch (e) {
    toast(e.message, { error: true });
  }
  loadTrash();
}

async function purgeTrash(item) {
  const ok = await Drive.confirmDialog(
    "Delete “" + item.name + "” forever?",
    (item.isDir ? "This folder and everything in it" : "This file") + " will be permanently deleted from the disk. This can't be undone.",
    "Delete forever",
    true
  );
  if (!ok) return;
  try {
    await api(`/api/trash/${item.id}`, { method: "DELETE" });
    toast("Deleted “" + item.name + "” forever");
  } catch (e) {
    toast(e.message, { error: true });
  }
  loadTrash();
}

async function emptyTrash() {
  const ok = await Drive.confirmDialog(
    "Empty the recycle bin?",
    `All ${trashItems.length} item${trashItems.length === 1 ? "" : "s"} will be permanently deleted from the disk. This can't be undone.`,
    "Empty recycle bin",
    true
  );
  if (!ok) return;
  try {
    const { skipped } = await api("/api/trash", { method: "DELETE" });
    toast(skipped ? `Recycle bin emptied, except ${skipped} item${skipped === 1 ? "" : "s"} on a disconnected drive` : "Recycle bin emptied");
  } catch (e) {
    toast(e.message, { error: true });
  }
  loadTrash();
}

els.searchInput.addEventListener("input", () => {
  if (state.route.view === "trash") renderTrash();
  else if (state.route.view !== "home" && state.browser) state.browser.search(els.searchInput.value);
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
  state.tunnel = {
    running: !!status.running,
    url: status.running ? status.url : null,
    mode: status.mode,
    config: status.config || state.tunnel.config,
  };
  const modeText = state.tunnel.config.mode === "fixed" ? "Fixed URL" : "Random URL";
  const cls = "dot " + (status.running ? "running" : "stopped");
  els.tunnelIndicator.className = cls;
  els.tunnelChipDot.className = cls;
  els.tunnelLabel.textContent = (status.running ? (status.url ? "Tunnel running" : "Connecting…") : "Tunnel stopped") + " · " + modeText;
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
els.tunnelSettings.replaceChildren(icon("tune"));
els.tunnelSettings.onclick = () => openTunnelDialog();

function openTunnelDialog() {
  const cfg = state.tunnel.config;
  const radio = (value, title, desc) =>
    h(
      "label",
      { class: "check-row" },
      h("input", { type: "radio", name: "tunnel-mode", value, checked: cfg.mode === value }),
      h("span", {}, h("strong", { text: title }), h("small", { text: desc }))
    );
  const quick = radio("quick", "Random URL", "A new https://….trycloudflare.com address each time you start. No account needed.");
  const fixed = radio("fixed", "Fixed URL", "Always the same address on your own domain, using a Cloudflare named tunnel.");
  const hostInput = h("input", { type: "text", id: "tunnel-host", placeholder: "files.example.com", value: cfg.hostname, autocomplete: "off" });
  const tokenInput = h("input", {
    type: "password",
    id: "tunnel-token",
    placeholder: cfg.hasToken ? "Saved — leave blank to keep" : "Paste tunnel token",
    autocomplete: "off",
  });
  const fixedFields = h(
    "div",
    {},
    h("div", { class: "field" }, h("label", { for: "tunnel-host", text: "Public hostname" }), hostInput),
    h("div", { class: "field" }, h("label", { for: "tunnel-token", text: "Tunnel token" }), tokenInput),
    h(
      "div",
      { class: "hint" },
      "In Cloudflare Zero Trust → Networks → Tunnels, create a tunnel, copy its token, and add a public hostname with service ",
      h("code", { text: "http://localhost:" + (location.port || "80") }),
      "."
    )
  );
  const modeValue = () => body.querySelector("input[name=tunnel-mode]:checked")?.value || "quick";
  const body = h("div", {}, quick, fixed, fixedFields);
  const sync = () => (fixedFields.hidden = modeValue() !== "fixed");
  body.addEventListener("change", sync);
  sync();
  Drive.dialog({
    title: "Public URL",
    body,
    actions: [
      { label: "Cancel", kind: "text" },
      {
        label: state.tunnel.running ? "Save & restart" : "Save",
        kind: "filled",
        onClick: async () => {
          try {
            await api("/api/tunnel/config", jsonBody("PUT", { mode: modeValue(), hostname: hostInput.value, token: tokenInput.value }));
          } catch (e) {
            toast(e.message, { error: true });
            return false;
          }
          toast("Tunnel settings saved");
          if (state.tunnel.running) {
            await api("/api/tunnel/stop", { method: "POST" }).catch(() => {});
            state.tunnel.running = false;
            toggleTunnel();
          } else refreshTunnel();
        },
      },
    ],
  });
}

els.tunnelChip.onclick = (e) => {
  e.stopPropagation();
  const t = state.tunnel;
  Drive.showMenu(els.tunnelChip, [
    { title: t.running ? (t.url ? "Public tunnel is online" : "Tunnel is connecting…") : "Only reachable on this network" },
    t.url ? { label: "Copy public URL", icon: "copy", onClick: () => Drive.copyText(t.url, "Public URL copied") } : null,
    { label: t.running ? "Stop tunnel" : "Start tunnel", icon: "cloud", onClick: toggleTunnel },
    { label: "Public URL settings", icon: "tune", onClick: () => openTunnelDialog() },
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
Promise.all([refreshShares(), refreshSettings()])
  .then(route)
  .catch((e) => toast(e.message, { error: true }));
