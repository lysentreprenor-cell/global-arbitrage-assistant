import { readFileSync, readdirSync, readlinkSync } from "fs";

const PORT = parseInt(process.env.PORT || "5000", 10);
const hexPort = PORT.toString(16).toUpperCase().padStart(4, "0");

try {
  const tcp = readFileSync("/proc/net/tcp", "utf8");
  const line = tcp.split("\n").find(l => l.includes(`:${hexPort} `));
  if (!line) process.exit(0);

  const inode = line.trim().split(/\s+/)[9];
  if (!inode) process.exit(0);

  const pids = readdirSync("/proc").filter(d => /^\d+$/.test(d));
  for (const pid of pids) {
    try {
      const fds = readdirSync(`/proc/${pid}/fd`);
      for (const fd of fds) {
        try {
          const link = readlinkSync(`/proc/${pid}/fd/${fd}`);
          if (link.includes(`socket:[${inode}]`)) {
            process.kill(Number(pid));
            console.log(`[prestart] killed stale process ${pid} on port ${PORT}`);
          }
        } catch {}
      }
    } catch {}
  }
} catch {}
