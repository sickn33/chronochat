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
          <div data-message-author-role="user"><div>  =cmd|"danger"</div></div>
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
      expect(ns.features.generateCSV([{ index: 2, role: "user", content: "  =SUM(1,2)" }])).toContain(
        "'  =SUM(1,2)",
      );

      const markdown = ns.features.generateMarkdown(payload);
      expect(markdown).toContain("### Message 0 - user");
      expect(markdown).toContain(`=cmd|"danger"`);
  });

  test("preserves rendered Markdown structure in Markdown and PDF exports", async () => {
    const { ns, api } = await loadChronoChat({
      html: `
        <header data-testid="conversation-header">
          <div data-testid="conversation-actions">
            <button type="button">Share</button>
            <button type="button">Activity</button>
          </div>
        </header>
        <main>
          <div data-message-author-role="user">
            <div class="whitespace-pre-wrap">Prima riga<br>Seconda riga
Terza riga dopo testo pre-wrap</div>
          </div>
          <div data-message-author-role="assistant">
            <div class="markdown">
              <h2>Sintesi brutale</h2>
              <p>Intro con <strong>enfasi</strong> e numeri.</p>
              <ul>
                <li>Tenere monitorata la posizione</li>
                <li>Valutare una struttura ETF</li>
              </ul>
              <table>
                <thead>
                  <tr><th>Voce</th><th>Importo</th></tr>
                </thead>
                <tbody>
                  <tr><td>Fondi comuni</td><td>€2.221,47</td></tr>
                  <tr><td>Liquidità conto</td><td>€1.528,05</td></tr>
                </tbody>
              </table>
              <pre><code>const net = gross - fees;</code></pre>
            </div>
          </div>
        </main>
      `,
    });
    api.toggleSidebar(true);
    await flushAsync();

    const [userMessage, message] = ns.features.buildExportPayload();
    expect(userMessage.content).toMatch(
      /Prima riga\n+Seconda riga\n+Terza riga dopo testo pre-wrap/,
    );
    expect(userMessage.content).not.toContain("Prima riga Seconda riga");

    expect(message.content).toContain("## Sintesi brutale");
    expect(message.content).toContain("Intro con **enfasi** e numeri.");
    expect(message.content).toContain("- Tenere monitorata la posizione");
    expect(message.content).toContain("| Voce | Importo |");
    expect(message.content).toContain("| Fondi comuni | €2.221,47 |");
    expect(message.content).toContain("```");
    expect(message.content).toContain("const net = gross - fees;");

    const markdown = ns.features.generateMarkdown([message]);
    expect(markdown).toContain("## Sintesi brutale");
    expect(markdown).toContain("| Liquidità conto | €1.528,05 |");

    const html = ns.features.generatePrintableHTML([userMessage, message]);
    expect(html).toContain("User query <span>Message 0</span>");
    expect(html).toContain('class="message role-user"');
    expect(html).toContain("border-left: 5px solid #111827;");
    expect(html).toContain("Assistant response <span>Message 1</span>");
    expect(html).toContain("<h2>Sintesi brutale</h2>");
    expect(html).toContain("<ul><li>Tenere monitorata la posizione</li>");
    expect(html).toContain("<th>Voce</th>");
    expect(html).toContain("<td>€2.221,47</td>");
    expect(html).toContain("<pre><code>const net = gross - fees;</code></pre>");
    expect(html).not.toContain(".message { break-inside: avoid;");
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
      expect(ns.state.ui.sidebarWidth).toBe(336);
      expect(ns.state.ui.togglePosition).toBeUndefined();
    expect(document.getElementById("chatgpt-nav-sidebar").style.getPropertyValue("width")).toBe(
      "336px",
    );
  });
});
