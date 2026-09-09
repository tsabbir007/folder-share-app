const els = {
  tunnelIndicator: document.getElementById("tunnel-indicator"),
  tunnelLabel: document.getElementById("tunnel-label"),
  tunnelToggle: document.getElementById("tunnel-toggle"),
  tunnelUrl: document.getElementById("tunnel-url"),
  sharesView: document.getElementById("shares-view"),
  sharesList: document.getElementById("shares-list"),
  addFolderBtn: document.getElementById("add-folder-btn"),
  browseView: document.getElementById("browse-view"),
  browseCancelBtn: document.getElementById("browse-cancel-btn"),
  currentPath: document.getElementById("current-path"),
  browseList: document.getElementById("browse-list"),
  permissionSelect: document.getElementById("permission-select"),
  uploadLimitLabel: document.getElementById("upload-limit-label"),
  uploadLimitInput: document.getElementById("upload-limit-input"),
  addShareBtn: document.getElementById("add-share-btn"),
  fileView: document.getElementById("file-view"),
  fileViewTitle: document.getElementById("file-view-title"),
  fileViewBackBtn: document.getElementById("file-view-back-btn"),
  currentRel: document.getElementById("current-rel"),
  filesList: document.getElementById("files-list"),
  uploadForm: document.getElementById("upload-form"),
  uploadInput: document.getElementById("upload-input"),
  uploadLimitNote: document.getElementById("upload-limit-note"),
  uploadProgressRow: document.getElementById("upload-progress-row"),
  uploadProgress: document.getElementById("upload-progress"),
  uploadPercent: document.getElementById("upload-percent"),
  uploadStatus: document.getElementById("upload-status"),
  previewOverlay: document.getElementById("preview-overlay"),
  previewTitle: document.getElementById("preview-title"),
  previewBody: document.getElementById("preview-body"),
  previewCloseBtn: document.getElementById("preview-close-btn"),
};

const state = {
  browsePath: null,
  activeShare: null,
  currentRel: "",
  tunnelUrl: null,
};

async function api(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

function showView(name) {
  els.sharesView.hidden = name !== "shares";
  els.browseView.hidden = name !== "browse";
  els.fileView.hidden = name !== "file";
}

function permissionLabel(p) {
  return p === "both" ? "Read & Write" : p === "read" ? "Read only" : "Write only";
}

// ---- Tunnel ----
async function refreshTunnel() {
  try {
    const status = await api("/api/tunnel/status");
    renderTunnel(status);
  } catch {
    /* ignore transient errors during polling */
  }
}

function renderTunnel(status) {
  state.tunnelUrl = status.running ? status.url : null;
  els.tunnelIndicator.className = "dot " + (status.running ? "running" : "stopped");
  els.tunnelLabel.textContent = status.running ? "Tunnel running" : "Tunnel stopped";
  els.tunnelToggle.textContent = status.running ? "Stop Tunnel" : "Start Tunnel";
  if (status.running && status.url) {
    els.tunnelUrl.hidden = false;
    els.tunnelUrl.textContent = status.url;
  } else if (status.running) {
    els.tunnelUrl.hidden = false;
    els.tunnelUrl.textContent = "Connecting...";
  } else {
    els.tunnelUrl.hidden = true;
  }
  renderShareLinks();
}

function shareLink(share) {
  const base = state.tunnelUrl || window.location.origin;
  return base + "/share/" + share.id;
}

function renderShareLinks() {
  document.querySelectorAll("[data-share-link-for]").forEach((el) => {
    const share = lastShares.find((s) => s.id === el.dataset.shareLinkFor);
    if (share) el.textContent = shareLink(share);
  });
}

let lastShares = [];

els.tunnelToggle.onclick = async () => {
  els.tunnelToggle.disabled = true;
  const wasRunning = els.tunnelToggle.textContent === "Stop Tunnel";
  els.tunnelLabel.textContent = wasRunning ? "Stopping..." : "Starting...";
  try {
    if (wasRunning) {
      await api("/api/tunnel/stop", { method: "POST" });
    } else {
      const result = await api("/api/tunnel/start", { method: "POST" });
      if (result.error && !result.url) alert(result.error);
    }
  } catch (e) {
    alert(e.message);
  } finally {
    els.tunnelToggle.disabled = false;
    refreshTunnel();
  }
};

// ---- Shares list ----
async function refreshShares() {
  const data = await api("/api/shares");
  lastShares = data.shares;
  renderShares(data.shares);
}

function renderShares(shares) {
  els.sharesList.innerHTML = "";
  if (!shares.length) {
    const empty = document.createElement("div");
    empty.className = "entry";
    empty.textContent = "No folders shared yet.";
    els.sharesList.appendChild(empty);
    return;
  }
  shares.forEach((share) => {
    const card = document.createElement("div");
    card.className = "share-card";

    const top = document.createElement("div");
    top.className = "share-row";

    const label = document.createElement("span");
    label.className = "share-label";
    label.textContent = "\u{1F4C1} " + share.name;
    label.title = share.path;
    label.onclick = () => openShare(share);
    top.appendChild(label);

    const select = document.createElement("select");
    ["both", "read", "write"].forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = permissionLabel(p);
      if (p === share.permission) opt.selected = true;
      select.appendChild(opt);
    });
    select.onchange = async () => {
      await api(`/api/shares/${share.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permission: select.value }),
      });
      refreshShares();
    };
    top.appendChild(select);

    if (share.permission !== "read") {
      const limitInput = document.createElement("input");
      limitInput.type = "number";
      limitInput.min = "1";
      limitInput.placeholder = "Default";
      limitInput.title = "Upload limit (MB) for this share";
      if (share.maxUploadMB) limitInput.value = share.maxUploadMB;
      limitInput.onchange = async () => {
        const raw = limitInput.value.trim();
        try {
          await api(`/api/shares/${share.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ maxUploadMB: raw ? Number(raw) : null }),
          });
          refreshShares();
        } catch (e) {
          alert(e.message);
          refreshShares();
        }
      };
      top.appendChild(limitInput);
    }

    const removeBtn = document.createElement("button");
    removeBtn.className = "danger small";
    removeBtn.textContent = "Remove";
    removeBtn.onclick = async () => {
      await api(`/api/shares/${share.id}`, { method: "DELETE" });
      refreshShares();
    };
    top.appendChild(removeBtn);

    card.appendChild(top);

    const linkRow = document.createElement("div");
    linkRow.className = "share-row link-row";
    const linkText = document.createElement("span");
    linkText.className = "path-bar link-text";
    linkText.dataset.shareLinkFor = share.id;
    linkText.textContent = shareLink(share);
    linkRow.appendChild(linkText);
    const copyBtn = document.createElement("button");
    copyBtn.className = "secondary small";
    copyBtn.textContent = "Copy Link";
    copyBtn.onclick = async () => {
      await navigator.clipboard.writeText(shareLink(share));
      copyBtn.textContent = "Copied!";
      setTimeout(() => (copyBtn.textContent = "Copy Link"), 1500);
    };
    linkRow.appendChild(copyBtn);
    card.appendChild(linkRow);

    const passRow = document.createElement("div");
    passRow.className = "share-row";
    const passLabel = document.createElement("span");
    passLabel.className = "pass-value";
    passLabel.textContent = "Password: " + share.password;
    passRow.appendChild(passLabel);
    const regenBtn = document.createElement("button");
    regenBtn.className = "secondary small";
    regenBtn.textContent = "Regenerate";
    regenBtn.onclick = async () => {
      if (!confirm("Regenerating invalidates the current link's access for anyone using the old password. Continue?")) return;
      await api(`/api/shares/${share.id}/regenerate-password`, { method: "POST" });
      refreshShares();
    };
    passRow.appendChild(regenBtn);
    card.appendChild(passRow);

    const quickShareRow = document.createElement("div");
    quickShareRow.className = "share-row";
    const quickShareBtn = document.createElement("button");
    quickShareBtn.className = "small";
    quickShareBtn.textContent = "Quick Share (copy link + password)";
    quickShareBtn.onclick = async () => {
      const text = `${share.name}\nLink: ${shareLink(share)}\nPassword: ${share.password}`;
      await navigator.clipboard.writeText(text);
      quickShareBtn.textContent = "Copied!";
      setTimeout(() => (quickShareBtn.textContent = "Quick Share (copy link + password)"), 1500);
    };
    quickShareRow.appendChild(quickShareBtn);
    card.appendChild(quickShareRow);

    els.sharesList.appendChild(card);
  });
}

// ---- Add folder (browse) ----
function updateUploadLimitVisibility() {
  const showLimit = els.permissionSelect.value !== "read";
  els.uploadLimitLabel.hidden = !showLimit;
  els.uploadLimitInput.hidden = !showLimit;
}
els.permissionSelect.onchange = updateUploadLimitVisibility;

els.addFolderBtn.onclick = () => {
  showView("browse");
  els.uploadLimitInput.value = "";
  updateUploadLimitVisibility();
  loadBrowse(state.browsePath);
};

els.browseCancelBtn.onclick = () => showView("shares");

async function loadBrowse(dirPath) {
  const data = await api("/api/browse" + (dirPath ? "?path=" + encodeURIComponent(dirPath) : ""));
  state.browsePath = data.path;
  els.currentPath.textContent = data.path;
  els.browseList.innerHTML = "";
  if (data.parent && data.parent !== data.path) {
    const up = document.createElement("div");
    up.className = "entry dir";
    up.textContent = ".. (up)";
    up.onclick = () => loadBrowse(data.parent);
    els.browseList.appendChild(up);
  }
  data.entries.forEach((name) => {
    const el = document.createElement("div");
    el.className = "entry dir";
    el.textContent = "\u{1F4C1} " + name;
    el.onclick = () => loadBrowse(joinPath(data.path, name));
    els.browseList.appendChild(el);
  });
}

function joinPath(base, name) {
  return base.endsWith("/") ? base + name : base + "/" + name;
}

els.addShareBtn.onclick = async () => {
  try {
    const permission = els.permissionSelect.value;
    const limitRaw = els.uploadLimitInput.value.trim();
    await api("/api/shares", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: state.browsePath,
        permission,
        maxUploadMB: permission !== "read" && limitRaw ? Number(limitRaw) : undefined,
      }),
    });
    showView("shares");
    refreshShares();
  } catch (e) {
    alert(e.message);
  }
};

// ---- File view (per share) ----
function openShare(share) {
  state.activeShare = share;
  const isWriteOnly = share.permission === "write";
  els.fileViewTitle.textContent = share.name + " — " + permissionLabel(share.permission);
  els.uploadForm.hidden = share.permission === "read";
  els.uploadLimitNote.hidden = share.permission === "read";
  els.uploadLimitNote.textContent = "Upload limit: " + share.effectiveMaxUploadMB + " MB per file";
  els.currentRel.hidden = isWriteOnly;
  els.filesList.hidden = isWriteOnly;
  showView("file");
  if (isWriteOnly) {
    state.currentRel = "";
  } else {
    loadFiles("");
  }
}

els.fileViewBackBtn.onclick = () => {
  state.activeShare = null;
  showView("shares");
  refreshShares();
};

async function loadFiles(rel) {
  const share = state.activeShare;
  const data = await api(`/api/shares/${share.id}/files?path=` + encodeURIComponent(rel));
  state.currentRel = data.path;
  els.currentRel.textContent = "/" + state.currentRel;
  els.filesList.innerHTML = "";
  if (state.currentRel) {
    const up = document.createElement("div");
    up.className = "entry dir";
    up.textContent = ".. (up)";
    const parts = state.currentRel.split("/");
    parts.pop();
    up.onclick = () => loadFiles(parts.join("/"));
    els.filesList.appendChild(up);
  }
  data.entries.forEach((e) => {
    const el = document.createElement("div");
    const relPath = state.currentRel ? state.currentRel + "/" + e.name : e.name;
    if (e.isDir) {
      el.className = "entry dir";
      el.textContent = "\u{1F4C1} " + e.name;
      el.onclick = () => loadFiles(relPath);
    } else {
      el.className = "entry file";
      const kind = previewKind(e.name);
      const nameSpan = document.createElement("span");
      nameSpan.className = "name" + (kind ? " previewable" : "");
      nameSpan.textContent = "\u{1F4C4} " + e.name;
      if (kind && share.permission !== "write") {
        nameSpan.onclick = () =>
          openPreview(
            e.name,
            `/api/shares/${share.id}/preview?path=` + encodeURIComponent(relPath),
            kind
          );
      }
      el.appendChild(nameSpan);
      const sizeSpan = document.createElement("span");
      sizeSpan.className = "size";
      sizeSpan.textContent = formatSize(e.size);
      el.appendChild(sizeSpan);
      if (share.permission !== "write") {
        const link = document.createElement("a");
        link.href = `/api/shares/${share.id}/download?path=` + encodeURIComponent(relPath);
        link.textContent = "Download";
        el.appendChild(link);
      }
    }
    els.filesList.appendChild(el);
  });
}

// ---- Preview ----
function previewKind(name) {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".avif"].includes(ext)) return "image";
  if ([".mp4", ".webm", ".ogv", ".mov", ".m4v"].includes(ext)) return "video";
  if ([".mp3", ".wav", ".m4a", ".flac", ".aac", ".oga"].includes(ext)) return "audio";
  if (ext === ".pdf") return "pdf";
  return null;
}

function openPreview(name, url, kind) {
  els.previewTitle.textContent = name;
  els.previewBody.innerHTML = "";
  let el;
  if (kind === "image") {
    el = document.createElement("img");
    el.src = url;
  } else if (kind === "video") {
    el = document.createElement("video");
    el.src = url;
    el.controls = true;
    el.autoplay = true;
  } else if (kind === "audio") {
    el = document.createElement("audio");
    el.src = url;
    el.controls = true;
    el.autoplay = true;
  } else if (kind === "pdf") {
    el = document.createElement("iframe");
    el.src = url;
  }
  if (el) els.previewBody.appendChild(el);
  els.previewOverlay.hidden = false;
}

function closePreview() {
  els.previewOverlay.hidden = true;
  els.previewBody.innerHTML = "";
}

els.previewCloseBtn.onclick = closePreview;
els.previewOverlay.onclick = (e) => {
  if (e.target === els.previewOverlay) closePreview();
};

function formatSize(bytes) {
  if (bytes == null) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return bytes.toFixed(1) + " " + units[i];
}

function uploadWithProgress(url, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        let message = xhr.statusText;
        try {
          message = JSON.parse(xhr.responseText).error || message;
        } catch {
          /* non-JSON error body */
        }
        reject(new Error(message));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(formData);
  });
}

els.uploadForm.onsubmit = async (e) => {
  e.preventDefault();
  const share = state.activeShare;
  if (!els.uploadInput.files.length) return;
  const formData = new FormData();
  for (const f of els.uploadInput.files) formData.append("files", f);

  els.uploadStatus.hidden = true;
  els.uploadProgress.value = 0;
  els.uploadPercent.textContent = "0%";
  els.uploadProgressRow.hidden = false;

  try {
    await uploadWithProgress(
      `/api/shares/${share.id}/upload?path=` + encodeURIComponent(state.currentRel),
      formData,
      (pct) => {
        els.uploadProgress.value = pct;
        els.uploadPercent.textContent = pct + "%";
      }
    );
    els.uploadProgressRow.hidden = true;
    els.uploadStatus.className = "success";
    els.uploadStatus.textContent = "Upload complete!";
    els.uploadStatus.hidden = false;
    els.uploadInput.value = "";
    if (share.permission !== "write") loadFiles(state.currentRel);
    setTimeout(() => (els.uploadStatus.hidden = true), 3000);
  } catch (err) {
    els.uploadProgressRow.hidden = true;
    els.uploadStatus.className = "error";
    els.uploadStatus.textContent = err.message;
    els.uploadStatus.hidden = false;
  }
};

// ---- init ----
refreshTunnel();
refreshShares();
setInterval(refreshTunnel, 5000);
