import { spawn, ChildProcess } from "child_process";

let proc: ChildProcess | null = null;
let url: string | null = null;

const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

export function getTunnelStatus() {
  return { running: !!proc, url };
}

export function startTunnel(port: number): Promise<{ running: boolean; url: string | null; error?: string }> {
  return new Promise((resolve) => {
    if (proc) {
      return resolve({ running: true, url });
    }

    url = null;
    let settled = false;
    let child: ChildProcess;
    try {
      child = spawn("cloudflared", ["tunnel", "--url", `http://127.0.0.1:${port}`]);
    } catch (err: any) {
      return resolve({ running: false, url: null, error: err.message });
    }
    proc = child;

    const onData = (data: Buffer) => {
      const text = data.toString();
      const match = text.match(URL_RE);
      if (match && !settled) {
        url = match[0];
        settled = true;
        resolve({ running: true, url });
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);

    child.on("exit", () => {
      proc = null;
      url = null;
    });
    child.on("error", (err) => {
      proc = null;
      if (!settled) {
        settled = true;
        resolve({ running: false, url: null, error: err.message });
      }
    });

    setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve({ running: !!proc, url, error: proc ? "Tunnel is taking longer than expected to connect" : "Failed to start tunnel" });
      }
    }, 15000);
  });
}

export function stopTunnel(): { running: boolean } {
  if (proc) {
    proc.kill();
    proc = null;
    url = null;
  }
  return { running: false };
}
