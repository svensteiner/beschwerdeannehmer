import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { projectRoot } from "./with-app-env.mjs";
import {
  assertSupportedProductionNode,
  isSupportedProductionNode,
  MINIMUM_PRODUCTION_NODE_VERSION,
  parseNodeVersion,
  unsupportedNodeMessage,
} from "./node-runtime.mjs";
import {
  BUILD_STAMP_ENV,
  DEFAULT_START_HOST,
  DEFAULT_START_PORT,
  DESK_ENV_REL,
  LOCAL_NITRO_ENV,
  LOCAL_SERVER_REL,
  SRC_STAMP_REL,
  START_MODE,
  buildArgv,
  buildIsStale,
  copyPgliteAssets,
  deskOutputMissingTafelRoutes,
  deskServerHasRequiredRoutes,
  deskServerHasStimmeRoutes,
  deskServerHasTafelRoutes,
  deskEnvLoadedMessage,
  deskProcessEnv,
  gitHead,
  gitWorktreeFingerprint,
  isLoopbackHost,
  isViteSecretKey,
  lanStartBlockedMessage,
  lanStartSafety,
  loadDeskEnvFile,
  localServerArgv,
  mergeDeskEnv,
  missingBuildMessage,
  missingRequiredRoutesMessage,
  missingStimmeRoutesMessage,
  missingTafelRoutesMessage,
  REQUIRED_START_ROUTES,
  STIMME_START_ROUTES,
  TAFEL_START_ROUTES,
  parseDeskEnvFile,
  parseGitHead,
  parseStartArgs,
  pgliteAssetSources,
  portBusyMessage,
  portBusyStaleMessage,
  probeHost,
  probePort,
  productionBuildReady,
  readBuildStamp,
  shouldBuildFirst,
  sourceFingerprint,
  staleBuildMessage,
  startBanner,
  startBuildEnv,
  startListenUrl,
  startServerEnv,
  withLocalBin,
  writeBuildStamp,
} from "./start-desk.mjs";

test("daily start defaults to 127.0.0.1:8080, loopback only", () => {
  const opts = parseStartArgs([], {});
  assert.equal(opts.port, DEFAULT_START_PORT);
  assert.equal(opts.host, DEFAULT_START_HOST);
  assert.equal(opts.host, "127.0.0.1");
  assert.equal(opts.port, 8080);
  assert.equal(opts.skipBuild, false);
  assert.equal(opts.forceBuild, false);
  assert.equal(opts.anzeige, false);
});

test("production start requires Node 22.12 or newer", () => {
  assert.equal(MINIMUM_PRODUCTION_NODE_VERSION, "22.12.0");
  assert.deepEqual(parseNodeVersion("v22.12.0"), [22, 12, 0]);
  assert.equal(parseNodeVersion("22.12"), null);
  assert.equal(isSupportedProductionNode("22.11.99"), false);
  assert.equal(isSupportedProductionNode("22.12.0"), true);
  assert.equal(isSupportedProductionNode("22.99.0"), true);
  assert.equal(isSupportedProductionNode("23.0.0"), true);
  assert.equal(isSupportedProductionNode("20.19.0"), false);
  assert.throws(() => assertSupportedProductionNode("20.19.0"), /Node >=22\.12\.0/);
});

test("die Node-Meldung nennt eine Handlungsanweisung, nicht nur den Fehler", () => {
  // Die Inhaberin muss wissen, was zu tun ist. Eine Meldung, die nur die
  // gefundene Version nennt, ist eine Sackgasse.
  const message = unsupportedNodeMessage("20.19.0");
  assert.match(message, /Node >=22\.12\.0/);
  assert.match(message, /20\.19\.0/);
  assert.match(message, /aktualisieren|upgrade/i);
  assert.match(message, /winget upgrade --id OpenJS\.NodeJS\.LTS/);
  assert.match(message, /node --version/);
});

test("HOST=0.0.0.0 opts in to listening on all interfaces", () => {
  const opts = parseStartArgs([], { HOST: "0.0.0.0" });
  assert.equal(opts.host, "0.0.0.0");
});

test("LAN start stays blocked for persistent practice data and only permits an explicit RAM demo", () => {
  assert.equal(isLoopbackHost("127.0.0.1"), true);
  assert.equal(isLoopbackHost("[::1]"), true);
  assert.equal(isLoopbackHost("0.0.0.0"), false);
  assert.equal(lanStartSafety({ host: "0.0.0.0", env: {} }).ok, false);
  assert.equal(lanStartSafety({
    host: "192.168.1.20",
    env: { SILVIA_DATA_DIR: "memory", SILVIA_ALLOW_INSECURE_LAN_TEST: "1", DATABASE_URL: "postgres://practice" },
  }).ok, false);
  assert.equal(lanStartSafety({
    host: "0.0.0.0",
    env: { SILVIA_DATA_DIR: "memory", SILVIA_ALLOW_INSECURE_LAN_TEST: "1" },
  }).ok, true);
  assert.match(lanStartBlockedMessage(), /HTTPS-Reverse-Proxy/);
});

test("PORT/HOST env and --port/--host flags, flags win", () => {
  const fromEnv = parseStartArgs([], { PORT: "8090", HOST: "127.0.0.1" });
  assert.equal(fromEnv.port, 8090);
  assert.equal(fromEnv.host, "127.0.0.1");
  const fromFlags = parseStartArgs(["--port", "8091", "--host", "0.0.0.0"], {
    PORT: "8090",
    HOST: "127.0.0.1",
  });
  assert.equal(fromFlags.port, 8091);
  assert.equal(fromFlags.host, "0.0.0.0");
  const equals = parseStartArgs(["--port=8092", "--host=127.0.0.1", "--skip-build"], {});
  assert.equal(equals.port, 8092);
  assert.equal(equals.host, "127.0.0.1");
  assert.equal(equals.skipBuild, true);
  const view = parseStartArgs(["--anzeige", "--port", "8081"], {});
  assert.equal(view.anzeige, true);
  assert.equal(view.port, 8081);
});

test("invalid port is rejected", () => {
  assert.throws(() => parseStartArgs(["--port", "nope"], {}), /invalid port/);
  assert.throws(() => parseStartArgs(["--port", "0"], {}), /invalid port/);
  assert.throws(() => parseStartArgs(["--host", ""], {}), /invalid host/);
});

test("listens with node-server, never vite dev and never a default node-server preset", () => {
  assert.equal(START_MODE, "node-server");
  const server = localServerArgv("/ordi");
  assert.ok(server[0].endsWith(join(".output", "server", "index.mjs")));
  const build = buildArgv("/ordi");
  assert.ok(build[0].endsWith(join("scripts", "build-local-node-server.mjs")));
  assert.ok(!build.includes("dev"));
  assert.ok(!build.includes("preview"));
});

test("package.json separates the safe daily and development starts", () => {
  const pkg = JSON.parse(readFileSync(join(projectRoot(), "package.json"), "utf8"));
  assert.equal(pkg.scripts.start, "node scripts/node-launcher.mjs scripts/start-desk.mjs");
  assert.equal(pkg.engines.node, ">=22.12.0");
  assert.equal(pkg.scripts.dev, "node scripts/start-dev.mjs");
  assert.match(pkg.scripts.preview, /vite preview/);
  assert.doesNotMatch(pkg.scripts.start, /vite dev/);
  const devStart = readFileSync(join(projectRoot(), "scripts", "start-dev.mjs"), "utf8");
  assert.match(devStart, /vite", "dev/);
  assert.match(devStart, /lanStartSafety/);
  const readme = readFileSync(join(projectRoot(), "README.md"), "utf8");
  const agents = readFileSync(join(projectRoot(), "AGENTS.md"), "utf8");
  assert.match(readme, /npm start.*\.env/s);
  assert.match(readme, /VITE_OPENAI_API_KEY/);
  assert.match(readme, /git pull/);
  assert.match(agents, /npm start.*\.env/s);
  assert.match(agents, /VITE_OPENAI_API_KEY/);
  assert.match(agents, /wird nicht geladen/);
  assert.match(agents, /silvia-src\.stamp/);
  assert.match(agents, /Dieser Build hat Tafel sichern\/holen nicht/);
});

test("Nitro default stays vercel; only SILVIA_LOCAL_NITRO=1 picks node-server", () => {
  const cfg = readFileSync(join(projectRoot(), "vite.config.ts"), "utf8");
  assert.match(cfg, /SILVIA_LOCAL_NITRO === "1" \? "node-server" : "vercel"/);
  assert.match(cfg, /preset: process\.env\.SILVIA_LOCAL_NITRO === "1" \? "node-server" : "vercel"/);
  assert.match(cfg, /inlineDynamicImports:\s*true/);
  const buildEnv = startBuildEnv("/ordi", { PATH: "/usr/bin" });
  assert.equal(buildEnv[LOCAL_NITRO_ENV], "1");
  const listen = startServerEnv("/ordi", { host: "0.0.0.0", port: 8080 }, { PATH: "/usr/bin" });
  assert.equal(listen.PORT, "8080");
  assert.equal(listen.HOST, "0.0.0.0");
  assert.equal(listen[LOCAL_NITRO_ENV], undefined);
  assert.equal(listen.SILVIA_ANZEIGE, undefined);
  assert.equal(listen[BUILD_STAMP_ENV], undefined);
  const stamped = startServerEnv(
    "/ordi",
    { host: "0.0.0.0", port: 8080, buildStamp: "git:abc" },
    { PATH: "/usr/bin", [BUILD_STAMP_ENV]: "git:from-env" },
  );
  assert.equal(stamped[BUILD_STAMP_ENV], "git:abc");
  assert.equal(BUILD_STAMP_ENV, "SILVIA_BUILD_STAMP");
  const view = startServerEnv("/ordi", { host: "0.0.0.0", port: 8081, anzeige: true }, { PATH: "/usr/bin" });
  assert.equal(view.SILVIA_ANZEIGE, "1");
  assert.equal(view.PORT, "8081");
});

test("missing local server means build first unless --skip-build", () => {
  assert.equal(shouldBuildFirst({ forceBuild: false, skipBuild: false, hasBuild: false }), true);
  assert.equal(shouldBuildFirst({ forceBuild: false, skipBuild: false, hasBuild: true }), false);
  assert.equal(shouldBuildFirst({ forceBuild: true, skipBuild: false, hasBuild: true }), true);
  assert.equal(shouldBuildFirst({ forceBuild: true, skipBuild: true, hasBuild: false }), false);
  assert.equal(shouldBuildFirst({ forceBuild: false, skipBuild: true, hasBuild: false }), false);
  assert.match(missingBuildMessage(), /npm start/);
});

test("old Nitro output without Tafel sichern/holen rebuilds, skip-build stays refused", () => {
  assert.deepEqual(TAFEL_START_ROUTES, ["/api/tafel-backup", "/api/tafel-holen", "/holen-warten"]);
  assert.equal(deskServerHasTafelRoutes(""), false);
  assert.equal(deskServerHasTafelRoutes("only /api/tafel-backup and /holen-warten"), false);
  assert.equal(
    deskServerHasTafelRoutes("/api/tafel-backup /api/tafel-holen /holen-warten"),
    true,
  );
  assert.match(missingTafelRoutesMessage(), /Tafel sichern\/holen nicht/);
  assert.match(missingTafelRoutesMessage(), /ohne --skip-build/);
  assert.deepEqual(STIMME_START_ROUTES, ["/api/stimme/hoeren", "/api/stimme/sprechen"]);
  assert.equal(deskServerHasStimmeRoutes("/api/tafel-backup"), false);
  assert.equal(deskServerHasStimmeRoutes("/api/stimme/hoeren /api/stimme/sprechen"), true);
  assert.equal(deskServerHasRequiredRoutes(TAFEL_START_ROUTES.join(" ")), false);
  assert.equal(deskServerHasRequiredRoutes(REQUIRED_START_ROUTES.join(" ")), true);
  assert.match(missingStimmeRoutesMessage(), /Stimme/);
  assert.match(missingRequiredRoutesMessage(TAFEL_START_ROUTES.join("\n")), /Stimme/);
  assert.match(missingRequiredRoutesMessage(STIMME_START_ROUTES.join("\n")), /Tafel sichern/);
  assert.match(
    missingRequiredRoutesMessage([...TAFEL_START_ROUTES, "/api/stimme/hoeren"].join("\n")),
    /Stimme/,
  );
  assert.equal(
    shouldBuildFirst({
      forceBuild: false,
      skipBuild: false,
      hasBuild: true,
      stale: false,
      missingTafelRoutes: true,
    }),
    true,
  );
  assert.equal(
    shouldBuildFirst({
      forceBuild: false,
      skipBuild: true,
      hasBuild: true,
      stale: false,
      missingTafelRoutes: true,
    }),
    false,
  );
  assert.equal(
    deskOutputMissingTafelRoutes("/ordi", {
      exists: () => false,
      readFile: () => {
        throw new Error("missing");
      },
    }),
    true,
  );
  assert.equal(
    deskOutputMissingTafelRoutes("/ordi", {
      exists: () => true,
      readFile: () => "preset vercel, no tafel routes",
    }),
    true,
  );
  assert.equal(
    deskOutputMissingTafelRoutes("/ordi", {
      exists: () => true,
      readFile: () => TAFEL_START_ROUTES.join("\n"),
    }),
    true,
  );
  assert.equal(
    deskOutputMissingTafelRoutes("/ordi", {
      exists: () => true,
      readFile: () => REQUIRED_START_ROUTES.join("\n"),
    }),
    false,
  );
});

test("git pull makes npm start rebuild even when .output already exists", () => {
  assert.equal(parseGitHead("abc1234\n"), "abc1234");
  assert.equal(parseGitHead("not-a-sha"), "");
  assert.equal(gitHead("/ordi", () => "deadbeef"), "deadbeef");
  assert.equal(gitHead("/ordi", () => { throw new Error("no git"); }), "");
  assert.equal(gitWorktreeFingerprint("/ordi", () => ""), "");
  const dirty = gitWorktreeFingerprint("/ordi", (bin, args) => {
    assert.equal(bin, "git");
    assert.deepEqual(args, ["-C", "/ordi", "diff", "--binary", "HEAD", "--"]);
    return "diff --git a/src/a.ts b/src/a.ts\n";
  });
  assert.match(dirty, /^[0-9a-f]{64}$/);
  assert.equal(sourceFingerprint("/ordi", { gitHead: "cafebabe", gitWorktreeFingerprint: "" }), "git:cafebabe");
  assert.equal(
    sourceFingerprint("/ordi", { gitHead: "cafebabe", gitWorktreeFingerprint: dirty }),
    `git:cafebabe:worktree:${dirty}`,
  );
  assert.notEqual(
    sourceFingerprint("/ordi", { gitHead: "cafebabe", gitWorktreeFingerprint: dirty }),
    "git:cafebabe",
  );
  assert.equal(
    sourceFingerprint("/ordi", {
      gitHead: "cafebabe",
      gitWorktreeFingerprint: null,
      stat: () => ({ isDirectory: () => false, isFile: () => true, mtimeMs: 1234 }),
    }),
    "git:cafebabe:mtime:1234",
  );
  assert.equal(sourceFingerprint("/ordi", { gitHead: "", stat: () => { throw new Error("missing"); }, readdir: () => [] }), "");
  assert.equal(buildIsStale({ hasBuild: true, sourceRev: "git:new", buildRev: "git:old" }), true);
  assert.equal(buildIsStale({ hasBuild: true, sourceRev: "git:same", buildRev: "git:same" }), false);
  assert.equal(buildIsStale({ hasBuild: true, sourceRev: "git:new", buildRev: "" }), true);
  assert.equal(buildIsStale({ hasBuild: false, sourceRev: "git:new", buildRev: "" }), false);
  assert.equal(buildIsStale({ hasBuild: true, sourceRev: "", buildRev: "" }), false);
  assert.equal(
    shouldBuildFirst({ forceBuild: false, skipBuild: false, hasBuild: true, stale: true }),
    true,
  );
  assert.equal(
    shouldBuildFirst({ forceBuild: false, skipBuild: true, hasBuild: true, stale: true }),
    false,
  );
  const files = new Map();
  writeBuildStamp("/ordi", "git:abc", {
    writeFile: (path, text) => {
      files.set(path, text);
    },
  });
  assert.equal(files.get(join("/ordi", SRC_STAMP_REL)), "git:abc\n");
  assert.equal(
    readBuildStamp("/ordi", { readFile: (path) => files.get(path) }),
    "git:abc",
  );
  assert.equal(SRC_STAMP_REL, join(".output", "silvia-src.stamp"));
  assert.match(staleBuildMessage(), /git pull/);
  assert.match(staleBuildMessage(), /Baue neu/);
});

test("productionBuildReady wants .output/server/index.mjs, not the vercel folder", () => {
  assert.equal(LOCAL_SERVER_REL, join(".output", "server", "index.mjs"));
  const existsOk = (path) => path.replaceAll("\\", "/").endsWith(".output/server/index.mjs");
  assert.equal(productionBuildReady("/ordi", existsOk), true);
  assert.equal(
    productionBuildReady("/ordi", (path) => path.replaceAll("\\", "/").includes(".vercel")),
    false,
  );
});

test("banner names Tagesbetrieb without HMR and localhost for 0.0.0.0", () => {
  assert.equal(startListenUrl({ host: "0.0.0.0", port: 8080 }), "http://localhost:8080");
  assert.equal(startListenUrl({ host: "127.0.0.1", port: 8090 }), "http://127.0.0.1:8090");
  const banner = startBanner({ host: "0.0.0.0", port: 8080 });
  assert.match(banner, /Tagesbetrieb ohne HMR/);
  assert.match(banner, /http:\/\/localhost:8080/);
  assert.match(banner, /http:\/\/localhost:8080\/app/);
  assert.match(banner, /http:\/\/localhost:8080\/login/);
  assert.match(banner, /Huber-Demo/);
  assert.match(banner, /npm run dev/);
  assert.match(banner, /Anzeige/);
  assert.match(banner, /--port 8081/);
  assert.match(banner, /wenn die Tafel schon offen ist/);
  assert.doesNotMatch(banner, /HMR update/);
});

test("a taken port is named in German before a second npm start", async () => {
  assert.equal(probeHost("0.0.0.0"), "127.0.0.1");
  assert.match(portBusyMessage({ host: "0.0.0.0", port: 8080 }), /Port 8080 ist schon belegt/);
  assert.match(portBusyMessage({ host: "0.0.0.0", port: 8080 }), /http:\/\/localhost:8080\/app/);
  assert.match(portBusyMessage({ host: "0.0.0.0", port: 8080 }), /--port 8081/);
  assert.match(portBusyMessage({ host: "0.0.0.0", port: 8080 }), /Anzeige/);
  assert.doesNotMatch(portBusyMessage({ host: "0.0.0.0", port: 8080 }), /älter als git pull/);
  const staleBusy = portBusyMessage({ host: "0.0.0.0", port: 8080, stale: true });
  assert.match(staleBusy, /Port 8080 ist schon belegt/);
  assert.match(staleBusy, /älter als git pull/);
  assert.match(staleBusy, /Prozess beenden/);
  assert.match(portBusyStaleMessage(), /npm start neu/);
  const { createServer } = await import("node:net");
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  assert.equal(await probePort({ host: "127.0.0.1", port }), true);
  await new Promise((resolve) => server.close(resolve));
  assert.equal(await probePort({ host: "127.0.0.1", port }), false);
});

test("npm start parses .env KEY=VALUE, export, quotes, and skips comments", () => {
  const parsed = parseDeskEnvFile(
    "\uFEFF# comment\r\nexport OPENAI_API_KEY=\"sk-quoted\"\r\nDATABASE_URL=postgres://desk\nSILVIA_LLM_PROVIDER=openai\n'NOT_A_KEY'\n1BAD=no\nFOO-BAR=no\n",
  );
  assert.equal(parsed.OPENAI_API_KEY, "sk-quoted");
  assert.equal(parsed.DATABASE_URL, "postgres://desk");
  assert.equal(parsed.SILVIA_LLM_PROVIDER, "openai");
  assert.equal(parsed["1BAD"], undefined);
  assert.equal(parsed["FOO-BAR"], undefined);
  assert.equal(parsed["'NOT_A_KEY'"], undefined);
});

test("VITE_ OpenAI and other client secrets never load from .env", () => {
  assert.equal(isViteSecretKey("VITE_OPENAI_API_KEY"), true);
  assert.equal(isViteSecretKey("VITE_FOO_SECRET"), true);
  assert.equal(isViteSecretKey("VITE_AUTH_TOKEN"), true);
  assert.equal(isViteSecretKey("OPENAI_API_KEY"), false);
  assert.equal(isViteSecretKey("VITE_AUTH_ENABLED"), false);
  const parsed = parseDeskEnvFile(
    "OPENAI_API_KEY=sk-ok\nVITE_OPENAI_API_KEY=sk-leaked\nVITE_AUTH_ENABLED=false\n",
  );
  assert.equal(parsed.OPENAI_API_KEY, "sk-ok");
  assert.equal(parsed.VITE_OPENAI_API_KEY, undefined);
  assert.equal(parsed.VITE_AUTH_ENABLED, "false");
});

test("process.env wins over .env and a missing file is empty", () => {
  assert.deepEqual(loadDeskEnvFile("/ordi"), {});
  const merged = mergeDeskEnv(
    { OPENAI_API_KEY: "sk-file", DATABASE_URL: "postgres://file", HOME: "/from-file" },
    { OPENAI_API_KEY: "sk-process", PATH: "/usr/bin" },
  );
  assert.equal(merged.OPENAI_API_KEY, "sk-process");
  assert.equal(merged.DATABASE_URL, "postgres://file");
  assert.equal(merged.HOME, "/from-file");
  assert.equal(merged.PATH, "/usr/bin");
  assert.doesNotMatch(deskEnvLoadedMessage(), /OPENAI|sk-|VITE_/);
});

test("npm start injects OPENAI_API_KEY from .env into the node-server child", () => {
  const dir = mkdtempSync(join(tmpdir(), "silvia-env-"));
  try {
    writeFileSync(
      join(dir, DESK_ENV_REL),
      "OPENAI_API_KEY=sk-from-file\nVITE_OPENAI_API_KEY=sk-leaked\nDATABASE_URL=postgres://desk\n",
    );
    const fromFile = startServerEnv(dir, { host: "127.0.0.1", port: 8080 }, { PATH: "/usr/bin" });
    assert.equal(fromFile.OPENAI_API_KEY, "sk-from-file");
    assert.equal(fromFile.DATABASE_URL, "postgres://desk");
    assert.equal(fromFile.VITE_OPENAI_API_KEY, undefined);
    const child = spawnSync(
      process.execPath,
      [
        "-e",
        "process.stdout.write(process.env.OPENAI_API_KEY ? 'has-openai-key' : 'missing'); process.stdout.write('|'); process.stdout.write(process.env.VITE_OPENAI_API_KEY ? 'has-vite-secret' : 'no-vite-secret'); process.stdout.write('|'); process.stdout.write(process.env.DATABASE_URL ? 'has-db' : 'missing-db');",
      ],
      { env: fromFile, encoding: "utf8" },
    );
    assert.equal(child.status, 0);
    assert.equal(child.stdout, "has-openai-key|no-vite-secret|has-db");
    assert.doesNotMatch(child.stdout, /sk-/);
    assert.doesNotMatch(deskEnvLoadedMessage(), /sk-/);
    const fromProcess = startServerEnv(
      dir,
      { host: "127.0.0.1", port: 8080 },
      { PATH: "/usr/bin", OPENAI_API_KEY: "sk-from-process" },
    );
    assert.equal(fromProcess.OPENAI_API_KEY, "sk-from-process");
    const migrateEnv = deskProcessEnv(dir, { PATH: "/usr/bin" });
    assert.equal(migrateEnv.DATABASE_URL, "postgres://desk");
    const missing = startServerEnv("/ordi", { host: "0.0.0.0", port: 8080 }, { PATH: "/usr/bin" });
    assert.equal(missing.OPENAI_API_KEY, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("PATH includes node_modules/.bin so vite build is found without npm", () => {
  const env = withLocalBin("/ordi", { PATH: "/usr/bin", HOME: "/home/kassa" });
  assert.equal(env.HOME, "/home/kassa");
  assert.ok(env.PATH.startsWith(join("/ordi", "node_modules", ".bin")));
  const again = withLocalBin("/ordi", env);
  assert.equal(again.PATH, env.PATH);
});

test("copies PGLite wasm next to the node-server entry", () => {
  const files = pgliteAssetSources("/ordi");
  assert.equal(files.length, 3);
  assert.deepEqual(
    files.map((f) => f.name),
    ["pglite.data", "pglite.wasm", "initdb.wasm"],
  );
  for (const file of files) {
    assert.ok(file.from.includes(join("node_modules", "@electric-sql", "pglite", "dist")));
    assert.ok(file.to.includes(join(".output", "server")));
  }
  const copied = [];
  const names = copyPgliteAssets("/ordi", {
    exists: () => true,
    copyFile: (from, to) => {
      copied.push([from, to]);
    },
  });
  assert.deepEqual(names, ["pglite.data", "pglite.wasm", "initdb.wasm"]);
  assert.equal(copied.length, 3);
  assert.throws(
    () => copyPgliteAssets("/ordi", { exists: () => false, copyFile: () => {} }),
    /missing PGLite asset/,
  );
});
