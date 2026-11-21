// Free ports for the end-to-end suites (the API and the mocks): asked to the system at start, so two suites (or two runs) at the same
// time never collide on a fixed port. Synchronous on purpose: the suites build their URLs at load time.
const { execFileSync } = require("child_process");

const freePorts = n => {
  const script = `
    const net = require("net");
    const servers = [];
    let left = ${Number(n)};
    for (let i = 0; i < ${Number(n)}; i += 1) {
      const s = net.createServer();
      s.listen(0, "127.0.0.1", () => { servers.push(s); if (--left === 0) { const ports = servers.map(x => x.address().port); servers.forEach(x => x.close()); process.stdout.write(JSON.stringify(ports)); } });
    }`;
  return JSON.parse(execFileSync(process.execPath, ["-e", script]).toString());
};

module.exports = { freePorts };
