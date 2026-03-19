import { loadChronoChat, flushAsync } from "./helpers/runtime.js";

describe("ChronoChat export and storage", () => {
  test("builds export payload with inferred roles and sanitized CSV", async () => {
    const { ns, api } = await loadChronoChat({
      html: `
        <main>
          <div data-message-author-role="user"><div>=cmd|"danger"</div></div>
          <div class="assistant-message"><div>Assistant without explicit role</div></div>
        </main>
      `,
    });
    api.toggleSidebar(true);
    await flushAsync();

    const payload = ns.features.buildExportPayload();
    expect(payload[0].role).toBe("user");
    expect(payload[1].role).toBe("assistant");

    const csv = ns.features.generateCSV(payload);
    expect(csv).toContain(`'=cmd|""danger""`);
  });

  test("loads persisted prefs, theme and width from chrome.storage.local", async () => {
    const { ns } = await loadChronoChat({
      html: `
        <main>
          <div data-message-author-role="user"><div>stored prefs message</div></div>
        </main>
      `,
      storageSeed: {
        jtch_v2_prefs: { compact: true, previewLen: 180 },
        jtch_v2_theme: "light",
        jtch_v2_sidebar_width: 420,
      },
    });

    expect(ns.state.ui.compact).toBe(true);
    expect(ns.state.ui.previewLen).toBe(180);
    expect(ns.state.ui.themePreference).toBe("light");
    expect(ns.state.ui.sidebarWidth).toBe(420);
    expect(document.getElementById("chatgpt-nav-sidebar").classList.contains("theme-light")).toBe(
      true,
    );
  });
});
