const fs = require("fs");
const os = require("os");
const path = require("path");

function skip(reason) {
  console.log(`SKIP Alpine smoke: ${reason}`);
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
    "alpine-chat-fixture.html",
  );
  const fixtureHtml = fs.readFileSync(fixturePath, "utf8");
  const extensionPath = repoRoot;
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chronochat-alpine-"));
  const expectedSnippets = [
    "il workbook torna?",
    "quasi si, ma non lo lascerei",
    "come si calcola il conversion rate",
    "Conversion Rate",
    "nel workbook abbiamo messo 9.51%",
    "tasso calcolato sui lead",
    "ma queste formule sono corrette?",
    "etichette da pulire",
    "perchè il CTR viene praticamente identico",
    "click e impression sono distribuiti",
    "come facciamo a correggere tutto",
    "alpine_a390_kpi_digital_media_report_CORRETTO.xlsx",
    "in confronto al mercato reale questo CTR",
    "CTR medio",
    "dammi il cazzo di workbook",
    "alpine_a390_kpi_workbook_REALISTICO.xlsx",
  ];

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

    await page.goto(
      "https://chatgpt.com/g/g-p-69e1e171f9e48191ad2a86185aae25f5-alpine/c/69ff4bdd-f014-83eb-a2c4-a09a7dd8ad35",
    );
    await page.waitForSelector("#chatgpt-nav-toggle", { timeout: 15000 });

    const pageMarkerCount = await page.evaluate(
      () =>
        Array.from(
          document.querySelectorAll("h1, h2, h3, h4, h5, h6, [role='heading']"),
        ).filter((heading) => /^(you said|chatgpt said):?$/i.test(heading.textContent.trim()))
          .length,
    );
    if (pageMarkerCount !== 16) {
      throw new Error(`expected 16 ChatGPT turn markers, found ${pageMarkerCount}`);
    }

    await page.click("#chatgpt-nav-toggle");
    await page.waitForFunction(
      () => document.getElementById("chatgpt-nav-sidebar")?.classList.contains("open"),
      null,
      { timeout: 15000 },
    );
    await page.waitForFunction(
      () => document.querySelectorAll("#message-list li[data-message-index]").length === 16,
      null,
      { timeout: 15000 },
    );

    const result = await page.evaluate((snippets) => {
      const items = Array.from(
        document.querySelectorAll("#message-list li[data-message-index]"),
      );
      const sidebarMessages = items.map((item) =>
        (item.textContent || "").replace(/\s+/g, " ").trim(),
      );
      const roles = items.map((item) => item.dataset.role);
      return {
        count: sidebarMessages.length,
        roles,
        missingSnippets: snippets.filter(
          (snippet, index) => !sidebarMessages[index]?.includes(snippet),
        ),
        sidebarMessages,
        profileCaptured: sidebarMessages.some((text) =>
          /Niccolo Lucioli|Profile image|Open profile menu/.test(text),
        ),
      };
    }, expectedSnippets);

    if (result.count !== 16) {
      throw new Error(`expected 16 sidebar messages, found ${result.count}`);
    }
    if (result.profileCaptured) {
      throw new Error("profile menu chrome was collected as a conversation message");
    }
    if (result.missingSnippets.length) {
      throw new Error(
        `missing expected Alpine snippets: ${JSON.stringify(result.missingSnippets)}\n${JSON.stringify(result.sidebarMessages, null, 2)}`,
      );
    }
    const expectedRoles = Array.from({ length: 16 }, (_, index) =>
      index % 2 === 0 ? "user" : "assistant",
    );
    if (result.roles.join(",") !== expectedRoles.join(",")) {
      throw new Error(`unexpected role order: ${result.roles.join(",")}`);
    }

    console.log(
      "ALPINE SMOKE PASS: 16 ChatGPT turn markers recovered as 16 ordered ChronoChat sidebar messages",
    );
  } finally {
    await context?.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`ALPINE SMOKE FAIL: ${error.stack || error.message || error}`);
  process.exit(1);
});
