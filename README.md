# Folder Share

A self-hosted web app for sharing folders from your own machine (or server) over
the network. Pick any local folder through a browser-based file picker, generate
a password-protected share link for it, and optionally expose it to the internet
through a Cloudflare Tunnel — no port forwarding or router config required.

## Features

- **Admin UI** protected by HTTP Basic auth (`USERNAME` / `PASSWORD`) for
  browsing the filesystem and managing shares.
- **Per-folder share links** (`/share/:id`), each with its own auto-generated
  password, independent of the admin login. The password can be turned off
  per share, so anyone with the link can open it.
- **Read / write / both permissions** per share — read-only browsing and
  downloads, upload-only drop folders, or full access.
- **In-browser preview** for images, video, audio, and PDF files.
- **Drag-and-drop uploads** (when a share allows writes).
- **All folders view**: besides "All shared folders", the admin sidebar has
  "All folders", a file browser over the starting folder (set under
  **Settings**). If that folder is on an unplugged drive, the view says so and
  picks up again as soon as the drive is reconnected.
- **Copy, move, and delete** files and folders from the admin UI (the ⋮ menu
  or right-click on an item). Copy/move can target any folder inside any
  shared folder; name clashes get a ` (2)` suffix instead of overwriting.
- **Recycle bin**: deleting moves items to a hidden `.folder-share-trash`
  folder on the same drive (at the root of the starting folder, or of the
  share for shares outside it), so even huge folders are "deleted" instantly.
  From **Recycle bin** in the sidebar the admin can restore items to where
  they were, delete them forever, or empty the bin. Share-link users can never
  see the bin, and it's left out of ZIP downloads. Binned items still use disk
  space until the bin is emptied.
- **One-click public tunnel** via [`cloudflared`](https://github.com/cloudflare/cloudflared),
  so a share can be reached from outside your network without exposing your
  own IP or opening firewall ports — either a random `trycloudflare.com` URL
  or a fixed URL on your own domain.
- **Brute-force protection**: failed logins (admin or share) are rate-limited
  per IP — after 10 failed attempts, that IP is locked out for 3 minutes.
- **Path traversal / symlink escape protection**: all file access is resolved
  and re-checked against the shared folder's real path.

## Requirements

- Node.js 20+
- [`cloudflared`](https://github.com/cloudflare/cloudflared) on your `PATH`
  (only needed if you use the tunnel feature)

## Getting started

```bash
npm install
cp .env.example .env   # then edit USERNAME / PASSWORD
npm run build
npm start
```

The app listens on `http://localhost:3000` by default (see `PORT` below).

For local development with auto-reload via `ts-node`:

```bash
npm run dev
```

## Configuration

Set these in `.env` (see `.env.example`):

| Variable        | Required | Default                | Description                                                                 |
| --------------- | -------- | ----------------------- | ----------------------------------------------------------------------------- |
| `USERNAME`      | yes      | —                       | Admin login username.                                                        |
| `PASSWORD`      | yes      | —                       | Admin login password. The app refuses to start if this or `USERNAME` is unset. |
| `PORT`          | no       | `3000`                  | Port the server listens on.                                                   |
| `MAX_UPLOAD_MB` | no       | `5120` (5 GB)           | Default max size, in MB, for a single uploaded file. Can be overridden per share from the admin UI. |
| `ROOT_FOLDER`   | no       | `/Volumes/EB HDD 1`     | Default starting folder: what "All folders" shows and where the folder picker opens. Can be changed from **Settings** in the admin UI. |
| `DATA_DIR`      | no       | project root            | Directory where `.state.json` (share list + passwords) is stored. Set this to a mounted volume when running in Docker. |

## How sharing works

1. Log in to the admin UI with `USERNAME` / `PASSWORD`.
2. Browse the server's filesystem and pick a folder to share.
3. Choose a permission: `read`, `write`, or `both`.
4. For `write` or `both` shares, optionally set a per-share upload size limit
   (in MB). Leave it blank to use the global `MAX_UPLOAD_MB` default. It can
   be changed any time from the share's card in the admin UI.
5. The app generates a share ID and password, giving you a link like
   `http://localhost:3000/share/<id>`.
6. Send that link (and password) to whoever needs access — they authenticate
   separately from the admin login and only ever see that one folder.

Regenerating a share's password immediately invalidates any existing sessions
for that link. Deleting a share does the same.

Each share has a **Require password** switch (in the "Share a folder" dialog
and in Share settings). With it off, the link opens straight into the folder
with no login — only do this for folders you're happy for anyone with the link
to see.

## Exposing a share publicly

From the admin UI you can start a Cloudflare Tunnel, which runs `cloudflared`
as a child process. Pick the kind of public URL with the settings button next
to **Start tunnel** (or "Public URL settings" in the top-right tunnel menu):

- **Random URL** (default) — a new `https://<random>.trycloudflare.com`
  address each time the tunnel starts. No Cloudflare account needed. Old
  links stop working when the tunnel restarts.
- **Fixed URL** — always the same address, e.g. `https://files.example.com`.
  This needs a free Cloudflare account and a domain whose DNS is on
  Cloudflare. One-time setup:
  1. Cloudflare dashboard → **Zero Trust → Networks → Tunnels → Create a
     tunnel** (type *Cloudflared*), give it a name.
  2. Copy the token from the install command it shows (you can paste the
     whole command; the app keeps only the token).
  3. Under **Public Hostname**, add your hostname (e.g. `files.example.com`)
     with service `HTTP` → `localhost:<PORT>` (the app's `PORT`, e.g. `3100`).
  4. In the app's Public URL settings, choose **Fixed URL**, enter the same
     hostname and the token, and save.

The token is stored in `.state.json` alongside the share passwords and is
never sent back to the browser.

## Running with Docker

### Quick start

```bash
cp .env.example .env   # then edit USERNAME / PASSWORD / PORT
docker compose up --build -d
```

This builds the image and starts the container in the background, listening
on the `PORT` you set in `.env` (`docker-compose.yml` maps that same port on
the host — keep the two in sync if you change it).

Useful day-to-day commands:

```bash
docker compose logs -f       # follow logs
docker compose restart       # restart the container
docker compose down          # stop and remove the container (data is kept)
docker compose up --build -d # rebuild after pulling code changes
```

### What `docker-compose.yml` does

- Builds the image from the included `Dockerfile`.
- Reads `USERNAME` / `PASSWORD` / `PORT` / `MAX_UPLOAD_MB` from `.env` via
  `env_file`.
- Persists `.state.json` (your share list, passwords, and upload-limit
  overrides) in a named volume (`folder-share-data`) mounted at `/data`, so
  it survives container rebuilds and restarts.
- Mounts host folders into the container at the **same path** they exist on
  the host, so shares configured through the admin UI keep working. All of
  `/Volumes` is mounted (not individual drives) so external drives can be
  ejected and reconnected without restarting the container. Edit the
  `volumes:` section to add the drives/folders you want to be able to select
  — anything not listed there won't be visible to the folder picker inside
  the container, even if it exists on the host.
- Sets `restart: unless-stopped`, so the app comes back up automatically
  after a host reboot or crash.

### Image details

- Multi-stage build: compiles TypeScript in a build stage, then copies only
  `dist/`, `public/`, `public-share/`, and production dependencies into a
  slim `node:20-alpine` runtime image.
- Bundles `cloudflared`, so the tunnel feature works out of the box in the
  container too — no extra install step.
- Runs as a non-root `app` user, with `/data` pre-created and owned by that
  user for the state volume.

### Running without Compose

If you'd rather manage the container yourself:

```bash
docker build -t folder-share-app .
docker run -d \
  --name folder-share \
  -p 3000:3000 \
  --env-file .env \
  -e DATA_DIR=/data \
  -v folder-share-data:/data \
  -v "/path/on/host:/path/on/host" \
  folder-share-app
```

Adjust the `-p` mapping and the `-v` host-folder mounts to match your setup,
same as in `docker-compose.yml` above.

### Updating

After pulling new code, rebuild the image so the container picks up the
changes — `docker compose up --build -d` (or `docker build` + `docker run`
again if you're not using Compose). The named volume keeps your `.state.json`
across rebuilds, so shares and passwords aren't lost.

## Security notes

- Always change the default `PASSWORD` before exposing this app to a network
  you don't fully trust — the server will not start with the `.env.example`
  defaults, but you should still pick a strong password.
- Admin auth is HTTP Basic over whatever transport you put in front of it
  (plain HTTP by default). If you expose the admin UI beyond localhost, put it
  behind TLS (e.g. via a tunnel, reverse proxy, or Cloudflare) rather than
  relying on Basic auth over plain HTTP.
- Only `cloudflared`, spawned by this process on localhost, is trusted for
  `X-Forwarded-*` headers (`trust proxy: loopback`).

## Project structure

```
src/
  server.ts    Express app: admin auth, share management, file browsing,
               upload/download/preview, tunnel control
  tunnel.ts    Spawns and manages the cloudflared child process
public/        Admin UI (folder picker + share management)
public-share/  Public share-link UI
```
