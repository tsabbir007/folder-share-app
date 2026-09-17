import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import path from "path";
import fs from "fs";
import os from "os";
import crypto from "crypto";
import multer from "multer";
import archiver from "archiver";
import { getTunnelStatus, startTunnel, stopTunnel } from "./tunnel";

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const APP_VERSION: string = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8")).version;
  } catch {
    return "0.0.0";
  }
})();
const USERNAME = process.env.USERNAME;
const PASSWORD = process.env.PASSWORD;
if (!USERNAME || !PASSWORD) {
  console.error(
    "USERNAME and PASSWORD environment variables must both be set (e.g. in .env). Refusing to start with a default/missing admin password."
  );
  process.exit(1);
}
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..");
fs.mkdirSync(DATA_DIR, { recursive: true });
const STATE_FILE = path.join(DATA_DIR, ".state.json");
const SHARE_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 5120);
const MAX_LOGIN_FAILURES = 10;
const LOGIN_FAILURE_WINDOW_MS = 3 * 60 * 1000;

type Permission = "read" | "write" | "both";
const PERMISSIONS: Permission[] = ["read", "write", "both"];

interface Share {
  id: string;
  path: string;
  name: string;
  permission: Permission;
  password: string;
  // Per-share upload limit, in MB. Undefined falls back to DEFAULT_MAX_UPLOAD_MB.
  maxUploadMB?: number;
}

function shareUploadLimitMB(share: Share): number {
  return share.maxUploadMB ?? DEFAULT_MAX_UPLOAD_MB;
}

// Adds the resolved (share-specific or default) upload limit alongside the
// raw maxUploadMB, so the UI can display it without knowing DEFAULT_MAX_UPLOAD_MB.
function serializeShare(share: Share) {
  return { ...share, effectiveMaxUploadMB: shareUploadLimitMB(share) };
}

interface AppState {
  shares: Share[];
}

function loadState(): AppState {
  let data: AppState;
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    data = Array.isArray(parsed.shares) ? parsed : { shares: [] };
  } catch {
    data = { shares: [] };
  }
  let migrated = false;
  for (const share of data.shares) {
    if (!share.password) {
      share.password = generatePassword();
      migrated = true;
    }
  }
  if (migrated) {
    fs.writeFileSync(STATE_FILE, JSON.stringify(data));
  }
  return data;
}

function saveState() {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state));
}

function generatePassword(): string {
  return crypto.randomBytes(6).toString("base64url");
}

const state = loadState();

// --- Share sessions: separate from the admin login, one per shared link ---
interface ShareSessionInfo {
  shareId: string;
  expires: number;
}
const shareSessions = new Map<string, ShareSessionInfo>();

function createShareSession(shareId: string): string {
  const token = crypto.randomBytes(24).toString("hex");
  shareSessions.set(token, { shareId, expires: Date.now() + SHARE_SESSION_TTL_MS });
  return token;
}

function getShareSessionShareId(token: string | undefined): string | null {
  if (!token) return null;
  const info = shareSessions.get(token);
  if (!info) return null;
  if (info.expires < Date.now()) {
    shareSessions.delete(token);
    return null;
  }
  return info.shareId;
}

function invalidateShareSessions(shareId: string) {
  for (const [token, info] of shareSessions) {
    if (info.shareId === shareId) shareSessions.delete(token);
  }
}

function findShare(id: string): Share | undefined {
  return state.shares.find((s) => s.id === id);
}

function resolveSafe(root: string, relPath: string): string {
  const target = path.resolve(root, "." + path.sep + relPath);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error("Path escapes shared folder");
  }
  return target;
}

// Guards against a symlink inside a shared folder pointing outside of it:
// resolveSafe only checks the literal path string, not where it actually
// leads once symlinks are followed.
function assertRealPathWithin(root: string, target: string) {
  const realRoot = fs.realpathSync(root);
  const realTarget = fs.existsSync(target) ? fs.realpathSync(target) : path.resolve(target);
  if (realTarget !== realRoot && !realTarget.startsWith(realRoot + path.sep)) {
    throw new Error("Path escapes shared folder");
  }
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA); // keep timing consistent with the equal-length path
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

// Tracks failed login attempts (admin and per-share) by key, to slow down
// brute-force guessing now that this app is meant to be internet-facing.
interface FailureWindow {
  count: number;
  resetAt: number;
}
const loginFailures = new Map<string, FailureWindow>();

function isLockedOut(key: string): boolean {
  const entry = loginFailures.get(key);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    loginFailures.delete(key);
    return false;
  }
  return entry.count >= MAX_LOGIN_FAILURES;
}

function recordLoginFailure(key: string) {
  const entry = loginFailures.get(key);
  if (!entry || Date.now() > entry.resetAt) {
    loginFailures.set(key, { count: 1, resetAt: Date.now() + LOGIN_FAILURE_WINDOW_MS });
  } else {
    entry.count++;
  }
}

function clearLoginFailures(key: string) {
  loginFailures.delete(key);
}

// Renders "Try again in N minute(s)"/"N second(s)" based on how much of the
// lockout window is actually left, so the message stays accurate even if
// the caller checks partway through the window rather than right at the start.
function lockoutMessage(key: string): string {
  const entry = loginFailures.get(key);
  const remainingMs = entry ? Math.max(0, entry.resetAt - Date.now()) : LOGIN_FAILURE_WINDOW_MS;
  const remainingSec = Math.ceil(remainingMs / 1000);
  if (remainingSec <= 60) {
    return `Too many failed attempts. Try again in ${remainingSec} second${remainingSec === 1 ? "" : "s"}.`;
  }
  const remainingMin = Math.ceil(remainingSec / 60);
  return `Too many failed attempts. Try again in ${remainingMin} minute${remainingMin === 1 ? "" : "s"}.`;
}

setInterval(() => {
  const now = Date.now();
  for (const [token, info] of shareSessions) {
    if (info.expires < now) shareSessions.delete(token);
  }
  for (const [key, info] of loginFailures) {
    if (info.resetAt < now) loginFailures.delete(key);
  }
}, 30 * 60 * 1000).unref();

// Only cloudflared (running on localhost, alongside this process) talks to
// us directly, so its X-Forwarded-* headers for the real client are trusted.
app.set("trust proxy", "loopback");

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cookieParser());

// The admin login (username + password) guards everything EXCEPT the
// per-folder /share/<id> links, which use their own password + session.
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path === "/share" || req.path.startsWith("/share/")) return next();

  const failureKey = `admin:${req.ip}`;
  if (isLockedOut(failureKey)) {
    return res.status(429).send(lockoutMessage(failureKey));
  }

  const header = req.headers.authorization;
  if (header && header.startsWith("Basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const idx = decoded.indexOf(":");
    if (idx !== -1) {
      const user = decoded.slice(0, idx);
      const pass = decoded.slice(idx + 1);
      if (safeEqual(user, USERNAME) && safeEqual(pass, PASSWORD)) {
        clearLoginFailures(failureKey);
        return next();
      }
    }
  }
  recordLoginFailure(failureKey);
  res.set("WWW-Authenticate", 'Basic realm="Folder Share"');
  res.status(401).send("Authentication required");
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/version", (_req: Request, res: Response) => {
  res.json({ version: APP_VERSION });
});

// --- Filesystem browser, for picking a folder to add (admin only) ---
app.get("/api/browse", (req: Request, res: Response) => {
  const dirPath = (req.query.path as string) || os.homedir();
  try {
    const entries = fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b));
    res.json({ path: dirPath, parent: path.dirname(dirPath), entries });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- Shares management (admin only) ---
app.get("/api/shares", (_req: Request, res: Response) => {
  res.json({ shares: state.shares.map(serializeShare) });
});

// Parses the optional maxUploadMB field from a request body. Returns:
// - undefined if the field was omitted entirely (leave existing value alone)
// - null if the field was explicitly cleared (fall back to the default)
// - a positive number if a valid override was given
// - NaN if the field was present but invalid
function parseMaxUploadMB(body: any): number | null | undefined {
  if (!body || !("maxUploadMB" in body)) return undefined;
  const raw = body.maxUploadMB;
  if (raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

app.post("/api/shares", (req: Request, res: Response) => {
  const sharePath = req.body?.path as string;
  const permission = req.body?.permission as Permission;
  if (!sharePath || !fs.existsSync(sharePath) || !fs.statSync(sharePath).isDirectory()) {
    return res.status(400).json({ error: "Invalid folder path" });
  }
  if (!PERMISSIONS.includes(permission)) {
    return res.status(400).json({ error: "Invalid permission" });
  }
  const maxUploadMB = parseMaxUploadMB(req.body);
  if (Number.isNaN(maxUploadMB)) {
    return res.status(400).json({ error: "Invalid upload limit" });
  }
  const resolved = path.resolve(sharePath);
  const existing = state.shares.find((s) => s.path === resolved);
  if (existing) {
    existing.permission = permission;
    if (maxUploadMB !== undefined) existing.maxUploadMB = maxUploadMB ?? undefined;
    saveState();
    return res.json({ share: serializeShare(existing) });
  }
  const share: Share = {
    id: crypto.randomUUID(),
    path: resolved,
    name: path.basename(resolved) || resolved,
    permission,
    password: generatePassword(),
    maxUploadMB: maxUploadMB ?? undefined,
  };
  state.shares.push(share);
  saveState();
  res.json({ share: serializeShare(share) });
});

app.patch("/api/shares/:id", (req: Request, res: Response) => {
  const share = findShare(req.params.id);
  if (!share) return res.status(404).json({ error: "Share not found" });
  const permission = req.body?.permission as Permission | undefined;
  if (permission !== undefined) {
    if (!PERMISSIONS.includes(permission)) {
      return res.status(400).json({ error: "Invalid permission" });
    }
    share.permission = permission;
  }
  const maxUploadMB = parseMaxUploadMB(req.body);
  if (Number.isNaN(maxUploadMB)) {
    return res.status(400).json({ error: "Invalid upload limit" });
  }
  if (maxUploadMB !== undefined) share.maxUploadMB = maxUploadMB ?? undefined;
  saveState();
  res.json({ share: serializeShare(share) });
});

app.post("/api/shares/:id/regenerate-password", (req: Request, res: Response) => {
  const share = findShare(req.params.id);
  if (!share) return res.status(404).json({ error: "Share not found" });
  share.password = generatePassword();
  invalidateShareSessions(share.id);
  saveState();
  res.json({ share });
});

app.delete("/api/shares/:id", (req: Request, res: Response) => {
  const idx = state.shares.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Share not found" });
  invalidateShareSessions(req.params.id);
  state.shares.splice(idx, 1);
  saveState();
  res.json({ ok: true });
});

function requireShare(req: Request, res: Response, next: NextFunction) {
  const share = findShare(req.params.id);
  if (!share) return res.status(404).json({ error: "Share not found" });
  (req as any).share = share;
  next();
}

app.get("/api/shares/:id/files", requireShare, (req: Request, res: Response) => {
  listFiles((req as any).share, req, res);
});

app.get("/api/shares/:id/download", requireShare, (req: Request, res: Response) => {
  downloadFile((req as any).share, req, res);
});

app.get("/api/shares/:id/download-zip", requireShare, (req: Request, res: Response) => {
  downloadFolderZip((req as any).share, req, res);
});

app.get("/api/shares/:id/preview", requireShare, (req: Request, res: Response) => {
  previewFile((req as any).share, req, res);
});

const uploadStorage = multer.diskStorage({
  destination: (req: Request, _file, cb) => {
    try {
      const share = findShare(req.params.id);
      if (!share) return cb(new Error("Share not found"), "");
      if (share.permission === "read") return cb(new Error("This share is read-only"), "");
      const rel = (req.query.path as string) || "";
      const targetDir = resolveSafe(share.path, rel);
      assertRealPathWithin(share.path, targetDir);
      cb(null, targetDir);
    } catch (err: any) {
      cb(err, "");
    }
  },
  filename: (_req, file, cb) => cb(null, file.originalname),
});

// Each share can override the upload size limit, so the multer instance
// (and its fileSize limit) is built per-request rather than once up front.
function uploadMiddleware(req: Request, res: Response, next: NextFunction) {
  const share = findShare(req.params.id);
  if (!share) return res.status(404).json({ error: "Share not found" });
  const limitMB = shareUploadLimitMB(share);
  (req as any).uploadLimitMB = limitMB;
  const upload = multer({ storage: uploadStorage, limits: { fileSize: limitMB * 1024 * 1024 } });
  upload.array("files")(req, res, next);
}

app.post("/api/shares/:id/upload", requireShare, uploadMiddleware, (req: Request, res: Response) => {
  const files = (req.files as Express.Multer.File[]) || [];
  res.json({ ok: true, count: files.length });
});

// --- Shared logic used by both the admin API and the public /share links ---
function listFiles(share: Share, req: Request, res: Response) {
  const rel = (req.query.path as string) || "";
  try {
    const target = resolveSafe(share.path, rel);
    assertRealPathWithin(share.path, target);
    const entries = fs
      .readdirSync(target, { withFileTypes: true })
      .filter((e) => !e.name.startsWith("."))
      .map((e) => {
        const stat = fs.statSync(path.join(target, e.name));
        return {
          name: e.name,
          isDir: e.isDirectory(),
          size: e.isDirectory() ? null : stat.size,
          addedAt: stat.mtimeMs,
        };
      })
      .sort((a, b) => b.addedAt - a.addedAt);
    res.json({ path: rel.replace(/^\/+/, ""), entries });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

function downloadFile(share: Share, req: Request, res: Response) {
  if (share.permission === "write") {
    return res.status(403).send("This share is write-only");
  }
  const rel = (req.query.path as string) || "";
  try {
    const target = resolveSafe(share.path, rel);
    assertRealPathWithin(share.path, target);
    if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      return res.status(400).send("Not a file");
    }
    res.download(target);
  } catch (err: any) {
    res.status(400).send(err.message);
  }
}

function downloadFolderZip(share: Share, req: Request, res: Response) {
  if (share.permission === "write") {
    return res.status(403).send("This share is write-only");
  }
  const rel = (req.query.path as string) || "";
  try {
    const target = resolveSafe(share.path, rel);
    assertRealPathWithin(share.path, target);
    if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
      return res.status(400).send("Not a folder");
    }
    const folderName = rel ? path.basename(target) : share.name;
    res.set("Content-Type", "application/zip");
    res.set("Content-Disposition", `attachment; filename="${folderName.replace(/"/g, "")}.zip"`);
    const archive = archiver("zip", { zlib: { level: 6 } });
    // Once headers are sent, the only way left to signal a mid-stream
    // failure to the client is to abort the connection.
    archive.on("error", (err) => {
      if (!res.headersSent) res.status(500).json({ error: err.message });
      else res.destroy(err);
    });
    archive.pipe(res);
    archive.directory(target, false);
    archive.finalize();
  } catch (err: any) {
    res.status(400).send(err.message);
  }
}

// Extensions safe to render inline in the browser (images/video/audio/pdf).
// Deliberately excludes SVG and anything else that can carry executable
// content, since these are served same-origin with Content-Disposition:
// inline rather than forced as a download.
const PREVIEW_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".avif",
  ".mp4", ".webm", ".ogv", ".mov", ".m4v",
  ".mp3", ".wav", ".m4a", ".flac", ".aac", ".oga",
  ".pdf",
]);

function previewFile(share: Share, req: Request, res: Response) {
  if (share.permission === "write") {
    return res.status(403).send("This share is write-only");
  }
  const rel = (req.query.path as string) || "";
  try {
    const target = resolveSafe(share.path, rel);
    assertRealPathWithin(share.path, target);
    if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      return res.status(400).send("Not a file");
    }
    if (!PREVIEW_EXTENSIONS.has(path.extname(target).toLowerCase())) {
      return res.status(415).send("Preview not supported for this file type");
    }
    // Belt-and-braces against the file being rendered as active content
    // even though the extension allowlist above should already prevent it.
    res.set("Content-Security-Policy", "sandbox");
    res.set("X-Content-Type-Options", "nosniff");
    res.sendFile(target, { headers: { "Content-Disposition": "inline" } });
  } catch (err: any) {
    res.status(400).send(err.message);
  }
}

// --- Public per-folder share links: password only, scoped to one folder ---
const shareRouter = express.Router();

shareRouter.get("/:id", (req: Request, res: Response) => {
  const share = findShare(req.params.id);
  if (!share) return res.status(404).send("This share link is no longer valid.");
  res.set("Cache-Control", "no-store");
  res.sendFile(path.join(__dirname, "..", "public-share", "index.html"));
});

shareRouter.get("/:id/meta", (req: Request, res: Response) => {
  const share = findShare(req.params.id);
  if (!share) return res.status(404).json({ error: "This share link is no longer valid" });
  res.json({ name: share.name, permission: share.permission, maxUploadMB: shareUploadLimitMB(share) });
});

shareRouter.get("/:id/status", (req: Request, res: Response) => {
  const share = findShare(req.params.id);
  if (!share) return res.status(404).json({ error: "This share link is no longer valid" });
  const authenticated = getShareSessionShareId(req.cookies?.share_session) === share.id;
  res.json({ authenticated, name: share.name, permission: share.permission });
});

shareRouter.post("/:id/login", (req: Request, res: Response) => {
  const share = findShare(req.params.id);
  if (!share) return res.status(404).json({ error: "This share link is no longer valid" });
  const failureKey = `share:${share.id}:${req.ip}`;
  if (isLockedOut(failureKey)) {
    return res.status(429).json({ error: lockoutMessage(failureKey) });
  }
  const password = req.body?.password as string;
  if (!password || !safeEqual(password, share.password)) {
    recordLoginFailure(failureKey);
    return res.status(401).json({ error: "Incorrect password" });
  }
  clearLoginFailures(failureKey);
  const token = createShareSession(share.id);
  res.cookie("share_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure,
    path: `/share/${share.id}`,
    maxAge: SHARE_SESSION_TTL_MS,
  });
  res.json({ ok: true });
});

shareRouter.post("/:id/logout", (req: Request, res: Response) => {
  const token = req.cookies?.share_session;
  if (token) shareSessions.delete(token);
  res.clearCookie("share_session", { path: `/share/${req.params.id}` });
  res.json({ ok: true });
});

function requireShareSession(req: Request, res: Response, next: NextFunction) {
  const share = findShare(req.params.id);
  if (!share) return res.status(404).json({ error: "This share link is no longer valid" });
  if (getShareSessionShareId(req.cookies?.share_session) !== share.id) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  (req as any).share = share;
  next();
}

shareRouter.get("/:id/files", requireShareSession, (req: Request, res: Response) => {
  listFiles((req as any).share, req, res);
});

shareRouter.get("/:id/download", requireShareSession, (req: Request, res: Response) => {
  downloadFile((req as any).share, req, res);
});

shareRouter.get("/:id/download-zip", requireShareSession, (req: Request, res: Response) => {
  downloadFolderZip((req as any).share, req, res);
});

shareRouter.get("/:id/preview", requireShareSession, (req: Request, res: Response) => {
  previewFile((req as any).share, req, res);
});

shareRouter.post("/:id/upload", requireShareSession, uploadMiddleware, (req: Request, res: Response) => {
  const files = (req.files as Express.Multer.File[]) || [];
  res.json({ ok: true, count: files.length });
});

app.use("/share", shareRouter);

// --- Tunnel control (admin only) ---
app.get("/api/tunnel/status", (_req: Request, res: Response) => {
  res.json(getTunnelStatus());
});

app.post("/api/tunnel/start", async (_req: Request, res: Response) => {
  const result = await startTunnel(PORT);
  res.json(result);
});

app.post("/api/tunnel/stop", (_req: Request, res: Response) => {
  res.json(stopTunnel());
});

app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  if (err?.code === "LIMIT_FILE_SIZE") {
    const limitMB = (req as any).uploadLimitMB;
    return res
      .status(413)
      .json({ error: limitMB ? `File exceeds the ${limitMB} MB upload limit for this share` : "File too large" });
  }
  res.status(400).json({ error: err?.message || "Unknown error" });
});

app.listen(PORT, () => {
  console.log(`Folder Share running at http://localhost:${PORT}`);
});
