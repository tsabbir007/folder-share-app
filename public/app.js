const els = {
  versionTag: document.getElementById("version-tag"),
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
  downloadZipBtn: document.getElementById("download-zip-btn"),
  filesList: document.getElementById("files-list"),
  uploadForm: document.getElementById("upload-form"),
  uploadInput: document.getElementById("upload-input"),
  uploadLimitNote: document.getElementById("upload-limit-note"),
  uploadQueue: document.getElementById("upload-queue"),
  uploadQueueList: document.getElementById("upload-queue-list"),
  uploadQueueSummary: document.getElementById("upload-queue-summary"),
  uploadQueueOverallFill: document.getElementById("upload-queue-overall-fill"),
  uploadQueueOverallPct: document.getElementById("upload-queue-overall-pct"),
  uploadCancelAllBtn: document.getElementById("upload-cancel-all-btn"),
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
    empty.className = "entry empty-state";
    empty.textContent = "No folders shared yet. Tap “+ Add Folder” to get started.";
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
  if (!data.entries.length && !(data.parent && data.parent !== data.path)) {
    const empty = document.createElement("div");
    empty.className = "entry empty-state";
    empty.textContent = "No subfolders here.";
    els.browseList.appendChild(empty);
  }
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
  els.downloadZipBtn.hidden = isWriteOnly;
  showView("file");
  if (isWriteOnly) {
    state.currentRel = "";
  } else {
    loadFiles("");
  }
}

els.downloadZipBtn.onclick = () => {
  const share = state.activeShare;
  const url = `/api/shares/${share.id}/download-zip?path=` + encodeURIComponent(state.currentRel);
  window.location.href = url;
};

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
      const nameSpan = document.createElement("span");
      nameSpan.className = "name";
      nameSpan.textContent = "\u{1F4C1} " + e.name;
      nameSpan.onclick = () => loadFiles(relPath);
      el.appendChild(nameSpan);
      const dateSpan = document.createElement("span");
      dateSpan.className = "date-added";
      dateSpan.textContent = formatDate(e.addedAt);
      el.appendChild(dateSpan);
      const zipBtn = document.createElement("button");
      zipBtn.className = "secondary small zip-btn";
      zipBtn.textContent = "ZIP";
      zipBtn.title = "Download this folder as a ZIP";
      zipBtn.onclick = (evt) => {
        evt.stopPropagation();
        window.location.href =
          `/api/shares/${share.id}/download-zip?path=` + encodeURIComponent(relPath);
      };
      el.appendChild(zipBtn);
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
      const dateSpan = document.createElement("span");
      dateSpan.className = "date-added";
      dateSpan.textContent = formatDate(e.addedAt);
      el.appendChild(dateSpan);
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
  if (!data.entries.length) {
    const empty = document.createElement("div");
    empty.className = "entry empty-state";
    empty.textContent = "This folder is empty.";
    els.filesList.appendChild(empty);
  }
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

function formatDate(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (sameDay) return time;
  const dateStr = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const sameYear = d.getFullYear() === now.getFullYear();
  return sameYear ? dateStr : dateStr + ", " + d.getFullYear();
}

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

// Uploads a single file with fine-grained progress. Distinguishes "bytes
// still going over the wire" from "server is writing to disk", since large
// files can sit at 100% for a while once the browser is done sending but
// before the server has finished flushing to disk and responding.
// `onXhr` is invoked synchronously with the XHR instance so the caller can
// keep a reference around to abort it later (e.g. a per-file cancel button).
function uploadFileWithProgress(url, file, onProgress, onXhr) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        onProgress(pct === 100 ? { pct, finishing: true } : { pct, finishing: false });
      }
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
    xhr.onabort = () => reject(new UploadCancelledError());
    const formData = new FormData();
    formData.append("files", file);
    xhr.send(formData);
    onXhr(xhr);
  });
}

class UploadCancelledError extends Error {
  constructor() {
    super("Cancelled");
    this.name = "UploadCancelledError";
  }
}

// Retries a transient failure (e.g. a network drive briefly dropping mid-
// batch) a couple of times before giving up, so a one-off I/O hiccup doesn't
// fail an otherwise-fine upload. Cancellation always wins over a retry.
const UPLOAD_MAX_ATTEMPTS = 3;
const UPLOAD_RETRY_DELAY_MS = 800;

async function uploadWithRetries(url, file, controller, onEvent) {
  for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt++) {
    if (controller.cancelled) throw new UploadCancelledError();
    try {
      await uploadFileWithProgress(
        url,
        file,
        (progress) => onEvent({ type: "progress", ...progress }),
        (xhr) => {
          controller.xhr = xhr;
        }
      );
      return;
    } catch (err) {
      controller.xhr = null;
      if (controller.cancelled || err instanceof UploadCancelledError) throw new UploadCancelledError();
      if (attempt === UPLOAD_MAX_ATTEMPTS) throw err;
      onEvent({ type: "retrying", attempt: attempt + 1, maxAttempts: UPLOAD_MAX_ATTEMPTS });
      await new Promise((resolve) => setTimeout(resolve, UPLOAD_RETRY_DELAY_MS));
      if (controller.cancelled) throw new UploadCancelledError();
    }
  }
}

function buildUploadRow(file) {
  const row = document.createElement("div");
  row.className = "upload-item";
  row.dataset.state = "queued";

  const top = document.createElement("div");
  top.className = "upload-item-top";

  const icon = document.createElement("span");
  icon.className = "upload-item-icon";
  top.appendChild(icon);

  const name = document.createElement("span");
  name.className = "upload-item-name";
  name.textContent = file.name;
  top.appendChild(name);

  const size = document.createElement("span");
  size.className = "upload-item-size";
  size.textContent = formatSize(file.size);
  top.appendChild(size);

  const status = document.createElement("span");
  status.className = "upload-item-status";
  status.textContent = "Waiting…";
  top.appendChild(status);

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "upload-item-cancel";
  cancelBtn.title = "Cancel this upload";
  cancelBtn.textContent = "✕";
  top.appendChild(cancelBtn);

  row.appendChild(top);

  const bottom = document.createElement("div");
  bottom.className = "upload-item-bottom";

  const bar = document.createElement("div");
  bar.className = "upload-item-bar";
  const fill = document.createElement("div");
  fill.className = "upload-item-bar-fill";
  bar.appendChild(fill);
  bottom.appendChild(bar);

  const errorEl = document.createElement("div");
  errorEl.className = "upload-item-error";
  bottom.appendChild(errorEl);

  row.appendChild(bottom);

  return { row, fill, status, cancelBtn, errorEl };
}

async function uploadFilesOneByOne(share, files) {
  const total = files.length;
  els.uploadQueueList.innerHTML = "";
  els.uploadQueueOverallFill.style.width = "0%";
  els.uploadQueueOverallPct.textContent = "0%";
  els.uploadQueue.hidden = false;
  els.uploadCancelAllBtn.hidden = false;
  els.uploadCancelAllBtn.disabled = false;

  // Tracks cancellation per file so both a queued (not-yet-started) file and
  // an in-flight one can be cancelled the same way.
  const controllers = files.map(() => ({ cancelled: false, xhr: null }));
  let cancelledAll = false;

  function cancelAt(i) {
    const c = controllers[i];
    if (c.cancelled) return;
    c.cancelled = true;
    if (c.xhr) {
      // In-flight request: aborting it triggers the catch block below.
      c.xhr.abort();
    } else {
      // Not yet started, or waiting between retry attempts: nothing to
      // abort, so reflect the cancellation immediately ourselves.
      rows[i].row.dataset.state = "cancelled";
      rows[i].status.textContent = "Cancelled";
    }
  }

  const rows = files.map((file, i) => {
    const built = buildUploadRow(file);
    built.cancelBtn.onclick = () => cancelAt(i);
    els.uploadQueueList.appendChild(built.row);
    return built;
  });

  els.uploadCancelAllBtn.onclick = () => {
    cancelledAll = true;
    els.uploadCancelAllBtn.disabled = true;
    for (let i = 0; i < total; i++) {
      const rowState = rows[i].row.dataset.state;
      if (rowState === "done" || rowState === "error" || rowState === "cancelled") continue;
      cancelAt(i);
    }
  };

  let completedBytes = 0;
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0) || 1;
  let failures = 0;
  let cancelled = 0;

  for (let i = 0; i < total; i++) {
    const file = files[i];
    const { row, fill, status, errorEl } = rows[i];

    if (controllers[i].cancelled) {
      row.dataset.state = "cancelled";
      status.textContent = "Cancelled";
      cancelled++;
      completedBytes += file.size;
      continue;
    }

    row.dataset.state = "uploading";
    status.textContent = "0%";
    els.uploadQueueSummary.textContent = `Uploading ${i + 1} of ${total}…`;

    try {
      await uploadWithRetries(
        `/api/shares/${share.id}/upload?path=` + encodeURIComponent(state.currentRel),
        file,
        controllers[i],
        (event) => {
          if (event.type === "retrying") {
            row.dataset.state = "uploading";
            fill.style.width = "0%";
            status.textContent = `Retry ${event.attempt}/${event.maxAttempts}`;
            return;
          }
          const { pct, finishing } = event;
          fill.style.width = pct + "%";
          if (finishing) {
            row.dataset.state = "finishing";
            status.textContent = "Saving…";
          } else {
            status.textContent = pct + "%";
          }
          const overallPct = Math.round(((completedBytes + (pct / 100) * file.size) / totalBytes) * 100);
          els.uploadQueueOverallFill.style.width = overallPct + "%";
          els.uploadQueueOverallPct.textContent = overallPct + "%";
        }
      );
      row.dataset.state = "done";
      fill.style.width = "100%";
      status.textContent = "Done";
    } catch (err) {
      if (err instanceof UploadCancelledError) {
        row.dataset.state = "cancelled";
        status.textContent = "Cancelled";
        cancelled++;
      } else {
        row.dataset.state = "error";
        status.textContent = "Failed";
        errorEl.textContent = err.message || "Upload failed";
        failures++;
      }
    }

    completedBytes += file.size;
    const overallPct = Math.round((completedBytes / totalBytes) * 100);
    els.uploadQueueOverallFill.style.width = overallPct + "%";
    els.uploadQueueOverallPct.textContent = overallPct + "%";
  }

  els.uploadCancelAllBtn.hidden = true;

  const uploaded = total - failures - cancelled;
  if (cancelledAll) {
    els.uploadQueueSummary.textContent = `Cancelled — ${uploaded} of ${total} uploaded`;
  } else if (failures === 0 && cancelled === 0) {
    els.uploadQueueSummary.textContent = `Uploaded ${total} file${total === 1 ? "" : "s"}`;
  } else {
    els.uploadQueueSummary.textContent = `${uploaded} of ${total} uploaded`;
  }

  return { failures, cancelled };
}

els.uploadForm.onsubmit = async (e) => {
  e.preventDefault();
  const share = state.activeShare;
  if (!els.uploadInput.files.length) return;
  const files = Array.from(els.uploadInput.files);

  els.uploadStatus.hidden = true;
  const { failures, cancelled } = await uploadFilesOneByOne(share, files);

  setTimeout(() => {
    els.uploadQueue.hidden = true;
  }, failures === 0 && cancelled === 0 ? 1200 : 4000);

  if (failures === 0 && cancelled === 0) {
    els.uploadStatus.className = "success";
    els.uploadStatus.textContent = "Upload complete!";
  } else if (failures === 0) {
    els.uploadStatus.className = "error";
    els.uploadStatus.textContent = `${cancelled} file${cancelled === 1 ? "" : "s"} cancelled.`;
  } else {
    els.uploadStatus.className = "error";
    els.uploadStatus.textContent = `${failures} file${failures === 1 ? "" : "s"} failed to upload${
      cancelled ? `, ${cancelled} cancelled` : ""
    }.`;
  }
  els.uploadStatus.hidden = false;
  els.uploadInput.value = "";
  if (share.permission !== "write") loadFiles(state.currentRel);
  setTimeout(() => (els.uploadStatus.hidden = true), 4000);
};

// ---- init ----
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

loadVersion();
refreshTunnel();
refreshShares();
setInterval(refreshTunnel, 5000);
