import fs from "fs";
import path from "path";

// The Chromium of one WhatsApp number (its "--user-data-dir" is the login folder of that number) and every process it started.
// A browser whose close timed out (or that crashed half open) leaves these alive; after hours of reopening a number that never
// connects, the container ran out of processes ("pthread_create", "Cannot fork") and the whole API got sick. Only Linux has /proc:
// elsewhere nothing is found.
export const leftoverBrowserPids = (profileDir: string, procDir = "/proc"): number[] => {
  const want = path.resolve(profileDir);
  let entries: string[];
  try {
    entries = fs.readdirSync(procDir).filter(n => /^\d+$/.test(n));
  } catch (e) {
    return [];
  }
  const parent = new Map<number, number>();
  const roots: number[] = [];
  entries.forEach(name => {
    const pid = Number(name);
    try {
      const stat = fs.readFileSync(path.join(procDir, name, "stat"), "utf8");
      // "pid (comm) state ppid ...": the name may hold spaces and parentheses, so read after the last ")"
      const ppid = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
      if (Number.isFinite(ppid)) parent.set(pid, ppid);
      const args = fs.readFileSync(path.join(procDir, name, "cmdline"), "utf8").split("\0");
      const dir = args.find(a => a.startsWith("--user-data-dir="));
      if (dir && path.resolve(dir.slice("--user-data-dir=".length)) === want) roots.push(pid);
    } catch (e) {
      // the process ended meanwhile
    }
  });
  if (!roots.length) return [];
  const found = new Set(roots);
  // the children of those (renderers, GPU, zygote), at any depth
  let grew = true;
  while (grew) {
    grew = false;
    parent.forEach((ppid, pid) => {
      if (!found.has(pid) && found.has(ppid)) { found.add(pid); grew = true; }
    });
  }
  found.delete(process.pid);
  return [...found].sort((a, b) => a - b);
};

export const killLeftoverBrowsers = (profileDir: string, procDir = "/proc", kill: (pid: number) => void = pid => process.kill(pid, "SIGKILL")): number => {
  let n = 0;
  leftoverBrowserPids(profileDir, procDir).forEach(pid => {
    try { kill(pid); n += 1; } catch (e) { /* already gone */ }
  });
  return n;
};
