const fs = require("fs");
const os = require("os");
const path = require("path");

function skip(reason) {
  console.log(`SKIP smoke: ${reason}`);
  process.exit(0);
}

function isLinuxWithoutDisplay() {
  return (
    process.platform === "linux" &&
    !process.env.DISPLAY &&
    !process.env.WAYLAND_DISPLAY
  );
}

function isLaunchEnvironmentError(error) {
  const message = String(error?.message || error || "");
  return (
    /Executable doesn't exist/i.test(message) ||
    /Failed to launch/i.test(message) ||
    /Missing X server/i.test(message) ||
    /X11/i.test(message) ||
    /Wayland/i.test(message) ||
    /DISPLAY/i.test(message) ||
    /browserType\.launchPersistentContext/i.test(message) ||
    /Failed to connect to the browser/i.test(message)
  );
}

async function main() {
  if (isLinuxWithoutDisplay()) {
    skip("no DISPLAY or WAYLAND_DISPLAY available");
  }

  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch (error) {
    skip(`playwright is unavailable (${error.message})`);
  }

  const repoRoot = path.resolve(__dirname, "..");
  const fixturePath = path.join(
    repoRoot,
    "tests",
    "smoke",
    "chatgpt-fixture.html",
  );
  const fixtureHtml = fs.readFileSync(fixturePath, "utf8");
  const extensionPath = repoRoot;
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chronochat-smoke-"));

  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
  } catch (error) {
    if (isLaunchEnvironmentError(error)) {
      skip(error.message);
    }
    throw error;
  }

  try {
    const page = context.pages()[0] || (await context.newPage());
    await page.route("**/*", (route) => {
      const request = route.request();
      if (request.isNavigationRequest()) {
        route.fulfill({
          status: 200,
          contentType: "text/html; charset=utf-8",
          body: fixtureHtml,
        });
        return;
      }

      route.fulfill({ status: 204, body: "" });
    });

    await page.goto("https://chatgpt.com/c/smoke");
    await page.waitForSelector("#chatgpt-nav-toggle", { timeout: 15000 });

    const actionBar = page.locator('[data-testid="conversation-actions"]');
    const firstChildId = await actionBar
      .locator(":scope > *")
      .first()
      .getAttribute("id");
    if (firstChildId !== "chatgpt-nav-toggle-slot") {
      throw new Error("host toggle slot was not injected before Share");
    }

    await page.click("#chatgpt-nav-toggle");
    await page.waitForFunction(
      () => document.getElementById("chatgpt-nav-sidebar")?.classList.contains("open"),
      null,
      { timeout: 15000 },
    );

    const exportControlsPresent = await page.evaluate(() => {
      return Boolean(
        document.getElementById("export-toggle") &&
          document.getElementById("export-menu"),
      );
    });
    if (!exportControlsPresent) {
      throw new Error("export controls were not present after opening the sidebar");
    }

    const exportFormats = await page.evaluate(() => {
      return Array.from(
        document.querySelectorAll("#export-menu [data-export-format]"),
      ).map((node) => node.dataset.exportFormat);
    });
    if (
      exportFormats.join(",") !== "json,csv,markdown,docx,pdf"
    ) {
      throw new Error(
        `unexpected export formats: ${exportFormats.join(",") || "(none)"}`,
      );
    }

    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () => !document.getElementById("chatgpt-nav-sidebar")?.classList.contains("open"),
      null,
      { timeout: 15000 },
    );

    const shortcut = process.platform === "darwin" ? "Meta+J" : "Control+J";
    await page.keyboard.press(shortcut);
    await page.waitForFunction(
      () => document.getElementById("chatgpt-nav-sidebar")?.classList.contains("open"),
      null,
      { timeout: 15000 },
    );

    await page.keyboard.press("/");
    await page.waitForFunction(
      () => document.activeElement?.id === "message-search",
      null,
      { timeout: 15000 },
    );

    await page.keyboard.press("Escape");
    await page.waitForFunction(
      () => document.activeElement?.id !== "message-search",
      null,
      { timeout: 15000 },
    );

    await page.click("#sidebar-close");
    await page.waitForFunction(
      () => !document.getElementById("chatgpt-nav-sidebar")?.classList.contains("open"),
      null,
      { timeout: 15000 },
    );

    console.log("SMOKE PASS: toggle injection, sidebar open/close, and keyboard shortcuts");
  } finally {
    await context?.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`SMOKE FAIL: ${error.stack || error.message || error}`);
  process.exit(1);
});
