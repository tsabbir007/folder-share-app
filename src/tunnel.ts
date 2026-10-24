import { spawn, ChildProcess } from "child_process";

// "quick": a throwaway https://<random>.trycloudflare.com URL, no account needed.
// "fixed": a named Cloudflare Tunnel (token from the Zero Trust dashboard) that
// always serves the same hostname on the user's own domain.
export type TunnelMode = "quick" | "fixed";

export interface TunnelConfig {
  mode: TunnelMode;
  hostname?: string;
  token?: string;
}

export interface TunnelStatus {
  running: boolean;
  url: string | null;
  mode: TunnelMode | null;
  error?: string;
}

let proc: ChildProcess | null = null;
let url: string | null = null;
let runningMode: TunnelMode | null = null;

const QUICK_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;
// Logged by `cloudflared tunnel run` once an edge connection is up.
const FIXED_READY_RE = /Registered tunnel connection|Connection [a-f0-9-]+ registered/i;
const FIXED_FATAL_RE = /Unauthorized|invalid token|Provided Tunnel token is not valid/i;

export function getTunnelStatus(): TunnelStatus {
  return { running: !!proc, url, mode: proc ? runningMode : null };
}

export function startTunnel(port: number, config: TunnelConfig): Promise<TunnelStatus> {
  return new Promise((resolve) => {
    if (proc) {
      return resolve(getTunnelStatus());
    }

    let args: string[];
    const env = { ...process.env };
    if (config.mode === "fixed") {
      if (!config.token || !config.hostname) {
        return resolve({ running: false, url: null, mode: null, error: "Fixed URL needs a tunnel token and hostname" });
      }
      // Passed via env rather than argv so the token doesn't show up in `ps`.
      env.TUNNEL_TOKEN = config.token;
      args = ["tunnel", "--no-autoupdate", "run"];
    } else {
      args = ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${port}`];
    }

    url = null;
    runningMode = config.mode;
    let settled = false;
    const settle = (status: TunnelStatus) => {
      if (settled) return;
      settled = true;
      resolve(status);
    };

    let child: ChildProcess;
    try {
      child = spawn("cloudflared", args, { env });
    } catch (err: any) {
      return resolve({ running: false, url: null, mode: null, error: err.message });
    }
    proc = child;

    const onData = (data: Buffer) => {
      const text = data.toString();
      if (config.mode === "fixed") {
        if (FIXED_FATAL_RE.test(text)) {
          child.kill();
          settle({ running: false, url: null, mode: null, error: "Cloudflare rejected the tunnel token" });
        } else if (FIXED_READY_RE.test(text) && !url) {
          url = "https://" + config.hostname;
          settle(getTunnelStatus());
        }
      } else {
        const match = text.match(QUICK_URL_RE);
        if (match && !url) {
          url = match[0];
          settle(getTunnelStatus());
        }
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);

    child.on("exit", () => {
      if (proc === child) {
        proc = null;
        url = null;
        runningMode = null;
      }
      settle({ running: false, url: null, mode: null, error: "Tunnel exited unexpectedly" });
    });
    child.on("error", (err) => {
      if (proc === child) {
        proc = null;
        runningMode = null;
      }
      settle({ running: false, url: null, mode: null, error: err.message });
    });

    setTimeout(() => {
      // A bad or revoked token makes cloudflared retry forever without a
      // clear error line, so a fixed tunnel that never registers is given up on.
      if (config.mode === "fixed" && !url && proc === child) {
        child.kill();
        return settle({
          running: false,
          url: null,
          mode: null,
          error: "Couldn't connect the fixed tunnel. Check the tunnel token in Cloudflare.",
        });
      }
      settle({
        ...getTunnelStatus(),
        error: proc ? "Tunnel is taking longer than expected to connect" : "Failed to start tunnel",
      });
    }, 20000);
  });
}

export function stopTunnel(): TunnelStatus {
  if (proc) {
    proc.kill();
    proc = null;
    url = null;
    runningMode = null;
  }
  return getTunnelStatus();
}
