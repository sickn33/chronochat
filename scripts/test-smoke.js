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

    const actionBar = page.locator(
      [
        '[data-testid="thread-header-right-actions"]',
        '[data-testid="conversation-actions"]',
      ].join(", "),
    );
    const firstChildId = await actionBar
      .locator(":scope > *")
      .first()
      .getAttribute("id");
    if (firstChildId !== "chatgpt-nav-toggle-slot") {
      throw new Error("host toggle slot was not injected before the host action");
    }

    await page.click("#chatgpt-nav-toggle");
    await page.waitForFunction(
      () => document.getElementById("chatgpt-nav-sidebar")?.classList.contains("open"),
      null,
      { timeout: 15000 },
    );

    const exportControlsPresent = await page.evaluate(() => {
      return Boolean(
        document.getElementById("export-group")?.tagName === "DETAILS" &&
          document.querySelector("#export-group .jtch-export-menu-button") &&
          document.querySelector("#export-group [data-export-format]"),
      );
    });
    if (!exportControlsPresent) {
      throw new Error("export controls were not present after opening the sidebar");
    }

    const exportFormats = await page.evaluate(() => {
      return Array.from(
        document.querySelectorAll("#export-group [data-export-format]"),
      ).map((node) => node.dataset.exportFormat);
    });
    if (
      exportFormats.join(",") !== "json,csv,markdown,pdf,zip"
    ) {
      throw new Error(
        `unexpected export formats: ${exportFormats.join(",") || "(none)"}`,
      );
    }

    const exportMenuOpens = await page.evaluate(() => {
      const menu = document.getElementById("export-group");
      document.querySelector("#export-group .jtch-export-menu-button")?.click();
      const opened = Boolean(menu?.open);
      document.querySelector('#export-group [data-export-format="json"]')?.click();
      return opened && !menu?.open;
    });
    if (!exportMenuOpens) {
      throw new Error("export dropdown did not open and close correctly");
    }

    const sidebarMessages = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll("#message-list li[data-message-index]"),
      ).map((node) => node.textContent || ""),
    );
    if (sidebarMessages.some((text) => text.includes("Niccolò Lucioli Pro"))) {
      throw new Error("profile menu chrome was collected as a conversation message");
    }

    const marksResult = await page.evaluate(async () => {
      const bookmarkButton = document.querySelector(
        '[data-message-index="0"] [data-mark-action="bookmark"]',
      );
      if (!bookmarkButton) {
        return { ok: false, reason: "mark buttons missing" };
      }
      bookmarkButton.click();
      await new Promise((resolve) => window.setTimeout(resolve, 50));
      const decisionButton = document.querySelector(
        '[data-message-index="1"] [data-mark-action="decision"]',
      );
      if (!decisionButton) {
        return { ok: false, reason: "decision button missing after bookmark render" };
      }
      decisionButton.click();
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      document.querySelector('[data-filter="marked"]')?.click();
      const visible = Array.from(
        document.querySelectorAll("#message-list li[data-message-index]"),
      ).map((node) => ({
        index: node.dataset.messageIndex,
        text: node.textContent || "",
      }));
      return {
        ok: visible.length === 2,
        visible,
      };
    });
    if (!marksResult.ok) {
      throw new Error(`mark filter check failed: ${JSON.stringify(marksResult)}`);
    }

    await page.reload();
    await page.waitForSelector("#chatgpt-nav-toggle", { timeout: 15000 });
    await page.click("#chatgpt-nav-toggle");
    await page.waitForFunction(
      () => document.getElementById("chatgpt-nav-sidebar")?.classList.contains("open"),
      null,
      { timeout: 15000 },
    );
    const persistedMarks = await page.evaluate(() => {
      document.querySelector('[data-filter="marked"]')?.click();
      const visible = Array.from(
        document.querySelectorAll("#message-list li[data-message-index]"),
      );
      return {
        visibleCount: visible.length,
        bookmarkPressed: document
          .querySelector('[data-message-index="0"] [data-mark-action="bookmark"]')
          ?.getAttribute("aria-pressed"),
        decisionPressed: document
          .querySelector('[data-message-index="1"] [data-mark-action="decision"]')
          ?.getAttribute("aria-pressed"),
      };
    });
    if (
      persistedMarks.visibleCount !== 2 ||
      persistedMarks.bookmarkPressed !== "true" ||
      persistedMarks.decisionPressed !== "true"
    ) {
      throw new Error(`mark persistence check failed: ${JSON.stringify(persistedMarks)}`);
    }
    await page.click('[data-filter="all"]');

    const jumpResult = await page.evaluate(async () => {
      const targetItem = Array.from(
        document.querySelectorAll("#message-list li[data-message-index]"),
      ).find((node) => node.textContent?.includes("beta release checklist"));
      if (!targetItem) {
        return { ok: false, reason: "target sidebar item missing" };
      }

      targetItem.click();
      await new Promise((resolve) => window.setTimeout(resolve, 50));

      const highlighted = document.querySelector(".jtch-target-highlight");
      return {
        ok: Boolean(highlighted?.textContent?.includes("beta release checklist")),
        highlightedText: highlighted?.textContent || "",
      };
    });
    if (!jumpResult.ok) {
      throw new Error(`message jump failed: ${JSON.stringify(jumpResult)}`);
    }

    await page.click(".jtch-attachment-summary");
    await page.waitForFunction(
      () => document.getElementById("attachment-dropbox")?.open,
      null,
      { timeout: 15000 },
    );

    const filesUi = await page.evaluate(() => {
      const sidebar = document.getElementById("chatgpt-nav-sidebar");
      const dropbox = document.getElementById("attachment-dropbox");
      const summary = document.querySelector(".jtch-attachment-summary");
      const item = document.querySelector(".jtch-attachment-item");
      const actions = document.querySelector(".jtch-attachment-actions");
      const sidebarRect = sidebar?.getBoundingClientRect();
      const itemRect = item?.getBoundingClientRect();
      const actionsRect = actions?.getBoundingClientRect();
      return {
        count: document.getElementById("attachment-count")?.textContent,
        open: Boolean(dropbox?.open),
        summaryLabel: summary?.getAttribute("aria-label"),
        imagePreview: Boolean(document.querySelector(".jtch-attachment-preview img")),
        actionButtons: document.querySelectorAll(".jtch-attachment-action").length,
        sidebarOverflow: sidebar ? sidebar.scrollWidth - sidebar.clientWidth : 0,
        itemWithinSidebar:
          Boolean(sidebarRect && itemRect) && itemRect.right <= sidebarRect.right + 1,
        actionsWithinItem:
          Boolean(itemRect && actionsRect) && actionsRect.right <= itemRect.right + 1,
      };
    });
    if (
      filesUi.count !== "2" ||
      !filesUi.open ||
      filesUi.summaryLabel !== "Conversation files, 2 files" ||
      !filesUi.imagePreview ||
      filesUi.actionButtons !== 4 ||
      filesUi.sidebarOverflow > 1 ||
      !filesUi.itemWithinSidebar ||
      !filesUi.actionsWithinItem
    ) {
      throw new Error(`Files dropbox UI check failed: ${JSON.stringify(filesUi)}`);
    }

    await page.click("#sidebar-close");
    await page.waitForFunction(
      () => !document.getElementById("chatgpt-nav-sidebar")?.classList.contains("open"),
      null,
      { timeout: 15000 },
    );

    await page.evaluate(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "j",
          metaKey: navigator.platform.includes("Mac"),
          ctrlKey: !navigator.platform.includes("Mac"),
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await page.waitForFunction(
      () => document.getElementById("chatgpt-nav-sidebar")?.classList.contains("open"),
      null,
      { timeout: 15000 },
    );

    await page.evaluate(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "/",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await page.waitForFunction(
      () => document.activeElement?.id === "message-search",
      null,
      { timeout: 15000 },
    );

    await page.evaluate(() => {
      document.getElementById("message-search")?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
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

    console.log(
      "SMOKE PASS: toggle injection, profile filtering, marks persistence, message jump, Files dropbox UI, sidebar open/close, and keyboard shortcuts",
    );
  } finally {
    await context?.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`SMOKE FAIL: ${error.stack || error.message || error}`);
  process.exit(1);
});
