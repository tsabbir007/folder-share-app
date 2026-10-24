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
import { getTunnelStatus, startTunnel, stopTunnel, TunnelConfig } from "./tunnel";

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
const DEFAULT_ROOT_FOLDER = path.resolve(process.env.ROOT_FOLDER || "/Volumes/EB HDD 1");
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
  // false makes the link open without a password. Undefined (older shares) = true.
  requirePassword?: boolean;
}

function sharePasswordRequired(share: Share): boolean {
  return share.requirePassword !== false;
}

function shareUploadLimitMB(share: Share): number {
  return share.maxUploadMB ?? DEFAULT_MAX_UPLOAD_MB;
}

// Adds the resolved (share-specific or default) upload limit alongside the
// raw maxUploadMB, so the UI can display it without knowing DEFAULT_MAX_UPLOAD_MB.
function serializeShare(share: Share) {
  return {
    ...share,
    effectiveMaxUploadMB: shareUploadLimitMB(share),
    requirePassword: sharePasswordRequired(share),
  };
}

// Hidden folder (one per drive/share, see trashBaseFor) holding deleted items
// as <TRASH_DIR>/<id>/<original name>, so deleting is a same-drive rename.
const TRASH_DIR = ".folder-share-trash";

interface TrashItem {
  id: string;
  name: string;
  originalPath: string;
  trashedPath: string;
  deletedAt: number;
  isDir: boolean;
  size: number | null;
}

interface AppState {
  shares: Share[];
  trash?: TrashItem[];
  tunnel?: TunnelConfig;
  // Admin-chosen starting folder; undefined falls back to DEFAULT_ROOT_FOLDER.
  rootPath?: string;
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

// Dot-files plus OS bookkeeping folders found at the root of external drives.
const HIDDEN_NAMES = new Set(["$RECYCLE.BIN", "System Volume Information", "RECYCLER", "lost+found"]);
function isHiddenName(name: string): boolean {
  return name.startsWith(".") || HIDDEN_NAMES.has(name);
}

// --- Starting folder ("All folders" in the admin UI) ---
// Exposed to the admin API as a virtual share with id "root", so browsing,
// downloads, uploads and copy/move/delete reuse the share code paths. It is
// never reachable through the public /share links (those use findShare).
const ROOT_ID = "root";

function rootPath(): string {
  return state.rootPath || DEFAULT_ROOT_FOLDER;
}

function isDirSafe(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function rootShare(): Share {
  const p = rootPath();
  return { id: ROOT_ID, path: p, name: path.basename(p) || p, permission: "both", password: "" };
}

function findAdminShare(id: string): Share | undefined {
  return id === ROOT_ID ? rootShare() : findShare(id);
}

// An ejected drive shows up as ENOENT, or as EBADF/EIO on a stale mount.
function fsErrorMessage(err: any): string {
  if (["ENOENT", "EBADF", "EIO", "ENOTCONN", "ENXIO", "ESTALE"].includes(err?.code)) {
    return "This folder isn't available right now. Check that the drive is connected.";
  }
  return err?.message || "Unknown error";
}

function resolveSafe(root: string, relPath: string): string {
  const target = path.resolve(root, "." + path.sep + relPath);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error("Path escapes shared folder");
  }
  // The recycle bin lives inside shared folders; nothing may reach into it
  // except the /api/trash endpoints, which use their own stored paths.
  if (path.relative(root, target).split(path.sep).includes(TRASH_DIR)) {
    throw new Error("Not found");
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

// Any write (upload, copy, move, delete, new folder, restore…) can change
// folder sizes; clear the cache when it starts and again when it finishes.
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    clearSizeCache();
    res.on("finish", clearSizeCache);
  }
  next();
});
app.use(cookieParser());

// The admin login (username + password) guards everything EXCEPT the
// per-folder /share/<id> links, which use their own password + session.
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path === "/share" || req.path.startsWith("/share/")) return next();
  // Static UI code shared by the admin app and public share pages; no data.
  if (req.path.startsWith("/assets/")) return next();

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

app.use("/assets", express.static(path.join(__dirname, "..", "public-common")));
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/version", (_req: Request, res: Response) => {
  res.json({ version: APP_VERSION });
});

// --- Filesystem browser, for picking a folder to add (admin only) ---
// --- Settings (admin only) ---
function settingsPayload() {
  const p = rootPath();
  return {
    rootPath: p,
    rootName: path.basename(p) || p,
    rootAvailable: isDirSafe(p),
    defaultRootPath: DEFAULT_ROOT_FOLDER,
    maxUploadMB: DEFAULT_MAX_UPLOAD_MB,
  };
}

app.get("/api/settings", (_req: Request, res: Response) => {
  res.json(settingsPayload());
});

app.put("/api/settings", (req: Request, res: Response) => {
  const raw = req.body?.rootPath;
  if (typeof raw !== "string" || !raw.trim()) {
    return res.status(400).json({ error: "Choose a starting folder" });
  }
  const resolved = path.resolve(raw.trim());
  if (!isDirSafe(resolved)) {
    return res.status(400).json({ error: "That folder doesn't exist or isn't available" });
  }
  state.rootPath = resolved === DEFAULT_ROOT_FOLDER ? undefined : resolved;
  saveState();
  res.json(settingsPayload());
});

// With no path given, the picker opens at the starting folder; if that drive
// is unplugged, at its closest existing parent (e.g. /Volumes) instead.
function defaultBrowsePath(): string {
  let p = rootPath();
  while (!isDirSafe(p)) {
    const parent = path.dirname(p);
    if (parent === p) return os.homedir();
    p = parent;
  }
  return p;
}

app.get("/api/browse", (req: Request, res: Response) => {
  const dirPath = (req.query.path as string) || defaultBrowsePath();
  try {
    const entries = fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !isHiddenName(e.name))
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
  const requirePassword = req.body?.requirePassword;
  const resolved = path.resolve(sharePath);
  const existing = state.shares.find((s) => s.path === resolved);
  if (existing) {
    existing.permission = permission;
    if (maxUploadMB !== undefined) existing.maxUploadMB = maxUploadMB ?? undefined;
    if (typeof requirePassword === "boolean") existing.requirePassword = requirePassword;
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
    requirePassword: requirePassword !== false,
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
  const requirePassword = req.body?.requirePassword;
  if (requirePassword !== undefined) {
    if (typeof requirePassword !== "boolean") {
      return res.status(400).json({ error: "Invalid password setting" });
    }
    share.requirePassword = requirePassword;
  }
  saveState();
  res.json({ share: serializeShare(share) });
});

app.post("/api/shares/:id/regenerate-password", (req: Request, res: Response) => {
  const share = findShare(req.params.id);
  if (!share) return res.status(404).json({ error: "Share not found" });
  share.password = generatePassword();
  invalidateShareSessions(share.id);
  saveState();
  res.json({ share: serializeShare(share) });
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
  const share = findAdminShare(req.params.id);
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
      // Set by requireShare (admin) or requireShareSession (public link).
      const share = (req as any).share as Share | undefined;
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
  const share = (req as any).share as Share | undefined;
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

// --- Copy / move / delete inside shared folders (admin only) ---

// Resolves an existing item inside a share. The share root itself is refused:
// moving or deleting it would pull the folder out from under the share.
function resolveItem(share: Share, rel: unknown): string {
  if (typeof rel !== "string" || !rel.replace(/^\/+|\/+$/g, "")) {
    throw new Error("Choose a file or folder inside the share");
  }
  const target = resolveSafe(share.path, rel);
  assertRealPathWithin(share.path, target);
  if (!fs.existsSync(target)) throw new Error("That file or folder no longer exists");
  return target;
}

function resolveDestDir(body: any): string {
  const share = findAdminShare(body?.destShareId);
  if (!share) throw new Error("Destination share not found");
  const dir = resolveSafe(share.path, typeof body?.destPath === "string" ? body.destPath : "");
  assertRealPathWithin(share.path, dir);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error("Destination folder not found");
  return dir;
}

// "photos" -> "photos (2)", "a.txt" -> "a (2).txt", so nothing is overwritten.
function freeName(dir: string, name: string): string {
  if (!fs.existsSync(path.join(dir, name))) return name;
  const isDir = fs.statSync(path.join(dir, name)).isDirectory();
  const ext = isDir ? "" : path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  for (let i = 2; ; i++) {
    const candidate = `${stem} (${i})${ext}`;
    if (!fs.existsSync(path.join(dir, candidate))) return candidate;
  }
}

function isSameOrInside(parent: string, child: string): boolean {
  const p = fs.realpathSync(parent);
  const c = fs.realpathSync(child);
  return c === p || c.startsWith(p + path.sep);
}

// rename() when possible; shares can live on different drives, which rename() can't cross.
async function moveItem(src: string, dest: string) {
  try {
    await fs.promises.rename(src, dest);
  } catch (err: any) {
    if (err.code !== "EXDEV") throw err;
    await fs.promises.cp(src, dest, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });
    await fs.promises.rm(src, { recursive: true });
  }
}

async function transferItem(req: Request, res: Response, mode: "copy" | "move") {
  try {
    const share = (req as any).share as Share;
    const src = resolveItem(share, req.body?.path);
    const destDir = resolveDestDir(req.body);
    if (fs.statSync(src).isDirectory() && isSameOrInside(src, destDir)) {
      throw new Error(`Can't ${mode} a folder into itself`);
    }
    if (mode === "move" && fs.realpathSync(path.dirname(src)) === fs.realpathSync(destDir)) {
      throw new Error("It's already in that folder");
    }
    const name = freeName(destDir, path.basename(src));
    const dest = path.join(destDir, name);
    if (mode === "copy") {
      await fs.promises.cp(src, dest, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });
    } else {
      await moveItem(src, dest);
    }
    res.json({ ok: true, name });
  } catch (err: any) {
    res.status(400).json({ error: fsErrorMessage(err) });
  }
}

app.post("/api/shares/:id/folders", requireShare, async (req: Request, res: Response) => {
  try {
    const share = (req as any).share as Share;
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name || name === "." || name === ".." || /[\/\\\0]/.test(name)) {
      throw new Error("Enter a folder name without / or \\");
    }
    if (name.length > 255) throw new Error("That name is too long");
    const parent = resolveSafe(share.path, typeof req.body?.path === "string" ? req.body.path : "");
    assertRealPathWithin(share.path, parent);
    if (!isDirSafe(parent)) throw new Error("Folder not found");
    const target = path.join(parent, name);
    if (fs.existsSync(target)) throw new Error(`“${name}” already exists here`);
    await fs.promises.mkdir(target);
    res.json({ ok: true, name });
  } catch (err: any) {
    res.status(400).json({ error: fsErrorMessage(err) });
  }
});

app.post("/api/shares/:id/items/copy", requireShare, (req: Request, res: Response) => transferItem(req, res, "copy"));
app.post("/api/shares/:id/items/move", requireShare, (req: Request, res: Response) => transferItem(req, res, "move"));

// --- Recycle bin (admin only) ---

// Items inside the starting folder share its bin (one bin for the whole
// drive); items in shares outside it use a bin at that share's root.
function trashBaseFor(share: Share, target: string): string {
  const root = rootPath();
  if (isDirSafe(root) && isSameOrInside(root, target)) return root;
  return share.path;
}

// trashedPath = <base>/<TRASH_DIR>/<id>/<name>
const trashSlot = (item: TrashItem) => path.dirname(item.trashedPath);
const trashBase = (item: TrashItem) => path.dirname(path.dirname(trashSlot(item)));

function trashList(): TrashItem[] {
  return (state.trash ||= []);
}

app.delete("/api/shares/:id/items", requireShare, async (req: Request, res: Response) => {
  try {
    const share = (req as any).share as Share;
    const target = resolveItem(share, req.query.path);
    const stat = fs.statSync(target);
    const id = crypto.randomUUID();
    const slot = path.join(trashBaseFor(share, target), TRASH_DIR, id);
    await fs.promises.mkdir(slot, { recursive: true });
    const trashedPath = path.join(slot, path.basename(target));
    try {
      await moveItem(target, trashedPath);
    } catch (err) {
      await fs.promises.rm(slot, { recursive: true, force: true });
      throw err;
    }
    trashList().push({
      id,
      name: path.basename(target),
      originalPath: target,
      trashedPath,
      deletedAt: Date.now(),
      isDir: stat.isDirectory(),
      size: stat.isDirectory() ? null : stat.size,
    });
    saveState();
    res.json({ ok: true, trashId: id });
  } catch (err: any) {
    res.status(400).json({ error: fsErrorMessage(err) });
  }
});

app.get("/api/trash", (_req: Request, res: Response) => {
  const items = [...trashList()]
    .sort((a, b) => b.deletedAt - a.deletedAt)
    .map((item) => ({ ...item, available: fs.existsSync(item.trashedPath) }));
  res.json({ items });
});

function findTrash(id: string): TrashItem {
  const item = trashList().find((t) => t.id === id);
  if (!item) throw new Error("That item is no longer in the recycle bin");
  return item;
}

function dropTrash(item: TrashItem) {
  state.trash = trashList().filter((t) => t.id !== item.id);
  saveState();
}

app.post("/api/trash/:id/restore", async (req: Request, res: Response) => {
  try {
    const item = findTrash(req.params.id);
    if (!fs.existsSync(item.trashedPath)) {
      throw new Error("Can't find this item. Check that its drive is connected.");
    }
    // The original folder may have been deleted or moved since; recreate it.
    const parent = path.dirname(item.originalPath);
    await fs.promises.mkdir(parent, { recursive: true });
    const name = freeName(parent, path.basename(item.originalPath));
    const dest = path.join(parent, name);
    await moveItem(item.trashedPath, dest);
    await fs.promises.rm(trashSlot(item), { recursive: true, force: true });
    dropTrash(item);
    res.json({ ok: true, restoredTo: dest, name });
  } catch (err: any) {
    res.status(400).json({ error: fsErrorMessage(err) });
  }
});

// Permanently removes one bin entry. If its drive is unplugged the entry is
// kept, so the files aren't orphaned on the drive with no way to clear them.
async function purgeTrash(item: TrashItem): Promise<boolean> {
  if (!isDirSafe(trashBase(item))) return false;
  await fs.promises.rm(trashSlot(item), { recursive: true, force: true });
  dropTrash(item);
  return true;
}

app.delete("/api/trash/:id", async (req: Request, res: Response) => {
  try {
    if (!(await purgeTrash(findTrash(req.params.id)))) {
      throw new Error("Connect the drive this item is on, then try again.");
    }
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: fsErrorMessage(err) });
  }
});

app.delete("/api/trash", async (_req: Request, res: Response) => {
  try {
    let skipped = 0;
    for (const item of [...trashList()]) {
      if (!(await purgeTrash(item))) skipped++;
    }
    res.json({ ok: true, skipped });
  } catch (err: any) {
    res.status(400).json({ error: fsErrorMessage(err) });
  }
});

// --- Folder sizes ---
// Summing a folder means walking everything under it, which is slow for big
// trees, so results are cached until anything changes (see the middleware
// that clears this on every non-GET request).
const SIZE_CACHE_TTL_MS = 10 * 60 * 1000;
const sizeCache = new Map<string, { size: number; at: number }>();
const sizeInFlight = new Map<string, Promise<number>>();

function clearSizeCache() {
  sizeCache.clear();
}

async function walkSize(dir: string): Promise<number> {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch {
      continue; // unreadable subfolder: count what we can
    }
    // Symlinks aren't followed, so a link can't pull in files from elsewhere
    // or loop forever; the recycle bin isn't part of any folder's size.
    const files: string[] = [];
    for (const e of entries) {
      if (e.isSymbolicLink() || e.name === TRASH_DIR) continue;
      const full = path.join(current, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile()) files.push(full);
    }
    for (let i = 0; i < files.length; i += 64) {
      const stats = await Promise.all(files.slice(i, i + 64).map((f) => fs.promises.lstat(f).catch(() => null)));
      for (const st of stats) if (st) total += st.size;
    }
  }
  return total;
}

function folderSize(dir: string): Promise<number> {
  const cached = sizeCache.get(dir);
  if (cached && Date.now() - cached.at < SIZE_CACHE_TTL_MS) return Promise.resolve(cached.size);
  let pending = sizeInFlight.get(dir);
  if (!pending) {
    pending = walkSize(dir)
      .then((size) => {
        sizeCache.set(dir, { size, at: Date.now() });
        return size;
      })
      .finally(() => sizeInFlight.delete(dir));
    sizeInFlight.set(dir, pending);
  }
  return pending;
}

async function sendFolderSize(share: Share, req: Request, res: Response) {
  if (share.permission === "write") {
    return res.status(403).json({ error: "This share is write-only" });
  }
  try {
    const target = resolveSafe(share.path, (req.query.path as string) || "");
    assertRealPathWithin(share.path, target);
    if (!isDirSafe(target)) throw new Error("Not a folder");
    res.json({ size: await folderSize(target) });
  } catch (err: any) {
    res.status(400).json({ error: fsErrorMessage(err) });
  }
}

app.get("/api/shares/:id/folder-size", requireShare, (req: Request, res: Response) => {
  sendFolderSize((req as any).share, req, res);
});

// --- Shared logic used by both the admin API and the public /share links ---
function listFiles(share: Share, req: Request, res: Response) {
  const rel = (req.query.path as string) || "";
  try {
    const target = resolveSafe(share.path, rel);
    assertRealPathWithin(share.path, target);
    const entries = fs
      .readdirSync(target, { withFileTypes: true })
      .filter((e) => !isHiddenName(e.name))
      .flatMap((e) => {
        // A broken symlink or unreadable system folder (common at a drive's
        // root) is skipped rather than failing the whole listing.
        try {
          const stat = fs.statSync(path.join(target, e.name));
          return [{ name: e.name, isDir: stat.isDirectory(), size: stat.isDirectory() ? null : stat.size, addedAt: stat.mtimeMs }];
        } catch {
          return [];
        }
      })
      .sort((a, b) => b.addedAt - a.addedAt);
    res.json({ path: rel.replace(/^\/+/, ""), entries });
  } catch (err: any) {
    res.status(400).json({ error: fsErrorMessage(err) });
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
    // res.attachment() emits an RFC 5987 `filename*=UTF-8''...` parameter.
    // Writing a non-ASCII name (e.g. Bengali) straight into the header makes
    // Node throw "Invalid character in header content", which the browser
    // then surfaces as ERR_INVALID_RESPONSE.
    res.attachment(folderName + ".zip");
    const archive = archiver("zip", { zlib: { level: 6 } });
    // A file that vanishes mid-walk shouldn't kill the whole download.
    archive.on("warning", (err) => console.warn("ZIP warning:", err.message));
    // Once headers are sent, the only way left to signal a mid-stream
    // failure to the client is to abort the connection.
    archive.on("error", (err) => {
      if (!res.headersSent) res.status(500).json({ error: err.message });
      else res.destroy(err);
    });
    archive.pipe(res);
    // Never ship the recycle bin inside a ZIP of a shared folder.
    archive.directory(target, false, (entry) => (entry.name.split("/").includes(TRASH_DIR) ? false : entry));
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
  res.json({
    name: share.name,
    permission: share.permission,
    maxUploadMB: shareUploadLimitMB(share),
    requirePassword: sharePasswordRequired(share),
  });
});

shareRouter.get("/:id/status", (req: Request, res: Response) => {
  const share = findShare(req.params.id);
  if (!share) return res.status(404).json({ error: "This share link is no longer valid" });
  const authenticated =
    !sharePasswordRequired(share) || getShareSessionShareId(req.cookies?.share_session) === share.id;
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
  if (sharePasswordRequired(share) && getShareSessionShareId(req.cookies?.share_session) !== share.id) {
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

shareRouter.get("/:id/folder-size", requireShareSession, (req: Request, res: Response) => {
  sendFolderSize((req as any).share, req, res);
});

shareRouter.post("/:id/upload", requireShareSession, uploadMiddleware, (req: Request, res: Response) => {
  const files = (req.files as Express.Multer.File[]) || [];
  res.json({ ok: true, count: files.length });
});

app.use("/share", shareRouter);

// --- Tunnel control (admin only) ---
function tunnelConfig(): TunnelConfig {
  return state.tunnel ?? { mode: "quick" };
}

// Never sends the token back to the browser; only whether one is saved.
function publicTunnelConfig() {
  const cfg = tunnelConfig();
  return { mode: cfg.mode, hostname: cfg.hostname || "", hasToken: !!cfg.token };
}

app.get("/api/tunnel/status", (_req: Request, res: Response) => {
  res.json({ ...getTunnelStatus(), config: publicTunnelConfig() });
});

app.get("/api/tunnel/config", (_req: Request, res: Response) => {
  res.json(publicTunnelConfig());
});

// Accepts a bare hostname or a pasted URL ("https://files.example.com/").
function normalizeHostname(raw: string): string | null {
  const host = raw.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host) ? host : null;
}

// Tunnel tokens are base64 JSON: {"a": accountTag, "t": tunnelId, "s": secret}.
function isTunnelToken(token: string): boolean {
  try {
    const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    return !!(decoded && decoded.a && decoded.t && decoded.s);
  } catch {
    return false;
  }
}

app.put("/api/tunnel/config", (req: Request, res: Response) => {
  const mode = req.body?.mode;
  if (mode !== "quick" && mode !== "fixed") {
    return res.status(400).json({ error: "Invalid tunnel mode" });
  }
  const prev = tunnelConfig();
  const next: TunnelConfig = { mode, hostname: prev.hostname, token: prev.token };
  if (typeof req.body?.hostname === "string" && req.body.hostname.trim()) {
    const host = normalizeHostname(req.body.hostname);
    if (!host) return res.status(400).json({ error: "Invalid hostname" });
    next.hostname = host;
  }
  if (typeof req.body?.token === "string" && req.body.token.trim()) {
    // The dashboard shows `cloudflared ... --token <TOKEN>`; accept that whole line too.
    const token = req.body.token.trim().split(/\s+/).pop();
    if (!isTunnelToken(token)) return res.status(400).json({ error: "That doesn't look like a Cloudflare tunnel token" });
    next.token = token;
  }
  if (mode === "fixed" && (!next.hostname || !next.token)) {
    return res.status(400).json({ error: "A fixed URL needs both a hostname and a tunnel token" });
  }
  state.tunnel = next;
  saveState();
  res.json(publicTunnelConfig());
});

app.post("/api/tunnel/start", async (_req: Request, res: Response) => {
  const result = await startTunnel(PORT, tunnelConfig());
  res.json(result);
});

app.post("/api/tunnel/stop", (_req: Request, res: Response) => {
  res.json(stopTunnel());
});

app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  // e.g. a download whose client disconnected mid-stream: nothing left to send.
  if (res.headersSent) return res.end();
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
