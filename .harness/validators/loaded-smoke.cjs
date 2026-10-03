const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

async function main() {
  // Resolve the pinned CLI supplied by npx, including its optional Playwright peer.
  const harnessRoot = path.dirname(require.resolve("hedera-harness/package.json", {
    paths: process.env.PATH.split(path.delimiter),
  }));
  const load = file => import(pathToFileURL(path.join(harnessRoot, "dist", file)).href);
  const { createDevServerSession, loadDevServerConfig } = await load("validation/devServer.js");
  const { launchSharedBrowser } = await load("mcpBrowser.js");
  const workspace = process.cwd();
  const config = await loadDevServerConfig(path.join(workspace, ".harness/validators/playwright-smoke.yaml"));
  let server;
  let browser;
  try {
    server = await createDevServerSession(workspace, config, "loaded-smoke");
    browser = await launchSharedBrowser(workspace);
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    page.on("pageerror", error => errors.push(error.message));
    for (const route of ["/", "/markets/0"]) {
      const response = await page.goto(new URL(route, server.url).href, { waitUntil: "domcontentloaded", timeout: 60000 });
      assert.equal(response.status(), 200, `${route}: HTTP status`);
      if (route === "/") {
        await page.locator('article h2 a[href^="/markets/"]').first().waitFor({ state: "visible", timeout: 60000 });
      } else {
        await page.getByText("Resolved YES", { exact: false }).first().waitFor({ state: "visible", timeout: 60000 });
        const entries = page.locator('ol li a[href^="https://hashscan.io/testnet/transaction/"]');
        await entries.nth(7).waitFor({ state: "visible", timeout: 60000 });
        assert.equal(await entries.count(), 8, "market 0: eight activity transaction links");
      }
      assert.deepEqual(errors, [], `${route}: browser errors`);
      console.log(`[loaded-smoke] ${route}: loaded content passed, consoleErrors=0`);
    }
  } finally {
    try { if (browser) await browser.close(); }
    finally { if (server) await server.stop(); }
  }
}
main().catch(error => { console.error(`[loaded-smoke] ${error.message}`); process.exitCode = 1; });
