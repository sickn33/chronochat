import { loadChronoChat, flushAsync } from "./helpers/runtime.js";

describe("ChronoChat export and storage", () => {
  test("builds export payload with inferred roles and sanitized CSV", async () => {
    const { ns, api } = await loadChronoChat({
      html: `
        <header data-testid="conversation-header">
          <div data-testid="conversation-actions">
            <button type="button">Share</button>
            <button type="button">Activity</button>
          </div>
        </header>
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

  test("ignores removed legacy prefs and width entries from chrome.storage.local", async () => {
    const { ns } = await loadChronoChat({
      html: `
        <header data-testid="conversation-header">
          <div data-testid="conversation-actions">
            <button type="button">Share</button>
            <button type="button">Activity</button>
          </div>
        </header>
        <main>
          <div data-message-author-role="user"><div>stored prefs message</div></div>
        </main>
      `,
      storageSeed: {
        jtch_v2_prefs: { compact: true, previewLen: 180 },
        jtch_v2_theme: "light",
        jtch_v2_sidebar_width: 420,
        jtch_v2_toggle_position: { left: 100, top: 120 },
      },
    });

    expect(ns.state.ui.compact).toBeUndefined();
    expect(ns.state.ui.previewLen).toBeUndefined();
    expect(ns.state.ui.themePreference).toBeUndefined();
    expect(ns.state.ui.sidebarWidth).toBeUndefined();
    expect(ns.state.ui.togglePosition).toBeUndefined();
    expect(document.getElementById("chatgpt-nav-sidebar").style.getPropertyValue("width")).toBe(
      "336px",
    );
  });
});
