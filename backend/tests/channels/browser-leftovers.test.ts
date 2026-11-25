import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { killLeftoverBrowsers, leftoverBrowserPids } from "../../src/providers/WhatsApp/Implementations/browserProcesses";

// a fake /proc: pid -> [parent, command line]
const fakeProc = (procs: Record<number, [number, string[]]>) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "proc-"));
  Object.entries(procs).forEach(([pid, [ppid, args]]) => {
    fs.mkdirSync(path.join(dir, pid));
    fs.writeFileSync(path.join(dir, pid, "stat"), `${pid} (chrome (x)) S ${ppid} 1 1 0`);
    fs.writeFileSync(path.join(dir, pid, "cmdline"), args.join("\0") + "\0");
  });
  fs.mkdirSync(path.join(dir, "self"));
  return dir;
};

describe("processos do navegador que ficaram abertos", () => {
  let proc: string;
  beforeEach(() => {
    proc = fakeProc({
      1: [0, ["node", "dist/server.js"]],
      100: [1, ["/usr/bin/chromium", "--no-sandbox", "--user-data-dir=/data/wwebjs/session-bd_3"]],
      101: [100, ["/usr/lib/chromium/chromium", "--type=zygote"]],
      102: [101, ["/usr/lib/chromium/chromium", "--type=renderer"]],
      200: [1, ["/usr/bin/chromium", "--user-data-dir=/data/wwebjs/session-bd_30"]],
      201: [200, ["/usr/lib/chromium/chromium", "--type=renderer"]]
    });
  });
  afterEach(() => fs.rmSync(proc, { recursive: true, force: true }));

  it("acha o navegador do número e todos os processos que ele abriu, e nenhum de outro número", () => {
    expect(leftoverBrowserPids("/data/wwebjs/session-bd_3", proc)).toEqual([100, 101, 102]);
    expect(leftoverBrowserPids("/data/wwebjs/session-bd_30/", proc)).toEqual([200, 201]);
    expect(leftoverBrowserPids("/data/wwebjs/session-bd_9", proc)).toEqual([]);
  });
  it("encerra só esses; sem /proc (fora do Linux) não faz nada", () => {
    const kill = vi.fn();
    expect(killLeftoverBrowsers("/data/wwebjs/session-bd_3", proc, kill)).toBe(3);
    expect(kill.mock.calls.map(c => c[0])).toEqual([100, 101, 102]);
    expect(killLeftoverBrowsers("/data/wwebjs/session-bd_3", path.join(proc, "nao-existe"), kill)).toBe(0);
  });
  it("um processo que já terminou não atrapalha", () => {
    const kill = vi.fn((pid: number) => { if (pid === 101) throw new Error("ESRCH"); });
    expect(killLeftoverBrowsers("/data/wwebjs/session-bd_3", proc, kill)).toBe(2);
  });
});
