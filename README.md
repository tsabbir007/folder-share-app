# Folder Share

A self-hosted web app for sharing folders from your own machine (or server) over
the network. Pick any local folder through a browser-based file picker, generate
a password-protected share link for it, and optionally expose it to the internet
through a Cloudflare Tunnel — no port forwarding or router config required.

## Features

- **Admin UI** protected by HTTP Basic auth (`USERNAME` / `PASSWORD`) for
  browsing the filesystem and managing shares.
- **Per-folder share links** (`/share/:id`), each with its own auto-generated
  password, independent of the admin login.
- **Read / write / both permissions** per share — read-only browsing and
  downloads, upload-only drop folders, or full access.
- **In-browser preview** for images, video, audio, and PDF files.
- **Drag-and-drop uploads** (when a share allows writes).
- **One-click public tunnel** via [`cloudflared`](https://github.com/cloudflare/cloudflared),
  so a share can be reached from outside your network without exposing your
  own IP or opening firewall ports.
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

## Exposing a share publicly

From the admin UI you can start a Cloudflare Tunnel, which runs `cloudflared`
as a child process and returns a public `https://*.trycloudflare.com` URL that
proxies to your local server. Stop the tunnel from the same UI when you're
done. No Cloudflare account is required for these quick tunnels.

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
  the host, so shares configured through the admin UI keep working. Edit the
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
