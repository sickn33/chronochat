import { loadChronoChat, flushAsync } from "./helpers/runtime.js";

describe("ChronoChat export and storage", () => {
  async function blobBytes(blob) {
    if (blob && typeof blob.arrayBuffer === "function") {
      return new Uint8Array(await blob.arrayBuffer());
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve(new Uint8Array(reader.result || new ArrayBuffer(0)));
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
  }

  test("builds export payload from the full conversation and JSON metadata", async () => {
    const { ns, api } = await loadChronoChat({
      html: `
        <header data-testid="conversation-header">
          <div data-testid="conversation-actions">
            <button type="button">Share</button>
            <button type="button">Activity</button>
          </div>
        </header>
        <main>
          <div data-message-author-role="user"><div>Alpha launch details</div></div>
          <div data-message-author-role="assistant"><div>=cmd|"danger"</div></div>
          <div data-message-author-role="user"><div>Alpha retrospective</div></div>
        </main>
      `,
    });

    api.toggleSidebar(true);
    await flushAsync();

    const search = document.getElementById("message-search");
    search.value = "retrospective";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector('[data-filter="assistant"]').dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );

    const exportedAt = "2026-01-02T03:04:05.000Z";
    const payload = ns.features.buildExportPayload(exportedAt);

    expect(payload).toMatchObject({
      conversationId: "chat:test-chat",
      exportedAt,
      messageCount: 3,
      messages: [
        {
          index: 0,
          role: "user",
          content: "Alpha launch details",
          blocks: [{ type: "paragraph", text: "Alpha launch details" }],
        },
        {
          index: 1,
          role: "assistant",
          content: '=cmd|"danger"',
          blocks: [{ type: "paragraph", text: '=cmd|"danger"' }],
        },
        {
          index: 2,
          role: "user",
          content: "Alpha retrospective",
          blocks: [{ type: "paragraph", text: "Alpha retrospective" }],
        },
      ],
    });

    const json = ns.features.generateJSON(payload);
    expect(JSON.parse(json)).toEqual({
      conversationId: "chat:test-chat",
      exportedAt,
      messageCount: 3,
      messages: payload.messages,
    });
  });

  test("preserves structured blocks while sanitizing CSV formula text", async () => {
    const { ns } = await loadChronoChat({
      html: `
        <header data-testid="conversation-header">
          <div data-testid="conversation-actions">
            <button type="button">Share</button>
            <button type="button">Activity</button>
          </div>
        </header>
        <main>
          <div data-message-author-role="user">
            <div data-message-content>
              <h2>Overview</h2>
              <p>Line one</p>
              <ul>
                <li>First bullet</li>
                <li>Second bullet</li>
              </ul>
              <blockquote>Quoted insight</blockquote>
              <pre><code class="language-js">console.log("hi");</code></pre>
              <img alt="Chart" src="data:image/png;base64,AAAA" />
              <img alt="Fallback" />
              <p>Line two</p>
            </div>
          </div>
          <div data-message-author-role="assistant">
            <div data-message-content>
              <p>+SUM(1,2)</p>
              <p>Calculator follow-up</p>
            </div>
          </div>
        </main>
      `,
    });

    const payload = ns.features.buildExportPayload("2026-01-02T03:04:05.000Z");
    const csv = ns.features.generateCSV(payload);
    const markdown = ns.features.generateMarkdown(payload);

    expect(payload.messages[0].blocks).toEqual([
      { type: "heading", level: 2, text: "Overview" },
      { type: "paragraph", text: "Line one" },
      {
        type: "list",
        ordered: false,
        items: ["First bullet", "Second bullet"],
      },
      { type: "quote", text: "Quoted insight" },
      {
        type: "code",
        language: "js",
        text: 'console.log("hi");',
      },
      {
        type: "image",
        alt: "Chart",
        src: "data:image/png;base64,AAAA",
      },
      {
        type: "image",
        alt: "Fallback",
        src: expect.stringMatching(/^data:image\/png;base64,/),
      },
      { type: "paragraph", text: "Line two" },
    ]);
    expect(payload.messages[0].content).toContain("Overview");
    expect(payload.messages[0].content).toContain("Line one");
    expect(payload.messages[1].content).toBe("+SUM(1,2)\n\nCalculator follow-up");

    expect(csv).toContain('"Index","Role","Content"');
    expect(csv).toContain(`"1","assistant","'+SUM(1,2)`);
    expect(csv).toContain("Calculator follow-up");
    expect(markdown).toContain("# Export");
    expect(markdown).toContain("## Metadata");
    expect(markdown).toContain("## 0. user");
    expect(markdown).toContain("## Overview");
    expect(markdown).toContain("Line one");
    expect(markdown).toContain("Line two");
    expect(markdown).toContain("- First bullet");
    expect(markdown).toContain("> Quoted insight");
    expect(markdown).toContain("```js");
    expect(markdown).toContain("![Chart](data:image/png;base64,AAAA)");
    expect(markdown).toContain("+SUM(1,2)\n\nCalculator follow-up");
  });

  test("keeps multiline structure for user messages rendered without semantic tags", async () => {
    const { ns } = await loadChronoChat({
      html: `
        <header data-testid="conversation-header">
          <div data-testid="conversation-actions">
            <button type="button">Share</button>
            <button type="button">Activity</button>
          </div>
        </header>
        <main>
          <div data-message-author-role="user">
            <div data-message-content>
              <span>Action plan</span><br />
              <span>- Step one</span><br />
              <span>- Step two</span>
            </div>
          </div>
        </main>
      `,
    });

    const payload = ns.features.buildExportPayload("2026-01-02T03:04:05.000Z");
    expect(payload.messages[0].blocks).toEqual([
      { type: "paragraph", text: "Action plan" },
      { type: "paragraph", text: "- Step one" },
      { type: "paragraph", text: "- Step two" },
    ]);
    expect(payload.messages[0].content).toContain("Action plan");
    expect(payload.messages[0].content).toContain("- Step one");
    expect(payload.messages[0].content).toContain("- Step two");
    expect(payload.messages[0].content).toContain("\n");
  });

  test("filters export noise lines like ChatGPT said/generated image", async () => {
    const { ns } = await loadChronoChat({
      html: `
        <header data-testid="conversation-header">
          <div data-testid="conversation-actions">
            <button type="button">Share</button>
            <button type="button">Activity</button>
          </div>
        </header>
        <main>
          <div data-message-author-role="assistant">
            <div data-message-content>
              <p>ChatGPT said:</p>
              <p>Generated image: Strategic brand marketing presentation layout</p>
              <p>Contenuto reale da mantenere.</p>
            </div>
          </div>
        </main>
      `,
    });

    const payload = ns.features.buildExportPayload("2026-01-02T03:04:05.000Z");
    expect(payload.messages).toHaveLength(1);
    expect(payload.messages[0].content).toBe("Contenuto reale da mantenere.");
    expect(payload.messages[0].content).not.toMatch(/chatgpt said|generated image/i);
    expect(payload.messages[0].blocks).toEqual([
      { type: "paragraph", text: "Contenuto reale da mantenere." },
    ]);
  });

  test("parses table rows with explicit cell separators", async () => {
    const { ns } = await loadChronoChat({
      html: `
        <header data-testid="conversation-header">
          <div data-testid="conversation-actions">
            <button type="button">Share</button>
            <button type="button">Activity</button>
          </div>
        </header>
        <main>
          <div data-message-author-role="assistant">
            <div data-message-content>
              <table>
                <tr><th>Punto 5</th><th>Fase</th></tr>
                <tr><td>Data foundation</td><td>Fase 1</td></tr>
              </table>
            </div>
          </div>
        </main>
      `,
    });

    const payload = ns.features.buildExportPayload("2026-01-02T03:04:05.000Z");
    expect(payload.messages[0].blocks).toEqual([
      {
        type: "paragraph",
        text: "Punto 5 | Fase\nData foundation | Fase 1",
      },
    ]);
    expect(payload.messages[0].content).toContain("Punto 5 | Fase");
  });

  test("downloads an export via blob URL and anchor click", async () => {
    const clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    try {
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
      });

      const result = ns.features.exportConversation("json");
      await flushAsync();

      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:jump");
      expect(result.filename).toMatch(/^chronochat-chat-test-chat-/);
      expect(result.mimeType).toBe("application/json;charset=utf-8");

      const blob = URL.createObjectURL.mock.calls[0][0];
      const blobText = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
      });
      expect(blobText).toContain('"conversationId": "chat:test-chat"');
    } finally {
      clickSpy.mockRestore();
    }
  });

  test("exports docx and pdf files with binary signatures", async () => {
    const { ns } = await loadChronoChat({
      html: `
        <header data-testid="conversation-header">
          <div data-testid="conversation-actions">
            <button type="button">Share</button>
            <button type="button">Activity</button>
          </div>
        </header>
        <main>
          <div data-message-author-role="user">
            <div data-message-content>
              <h3>Spec</h3>
              <p>Doc export body A → B.</p>
              <blockquote>Evidence note</blockquote>
              <pre><code>echo "ok"</code></pre>
              <img alt="Graph" src="data:image/png;base64,AAAA" />
            </div>
          </div>
        </main>
      `,
    });

    const clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    try {
      const docxResult = ns.features.exportConversation("docx");
      await flushAsync();
      await flushAsync();
      const docxBlob = URL.createObjectURL.mock.calls.at(-1)?.[0];
      const docxBytes = await blobBytes(docxBlob);
      expect(docxResult.mimeType).toBe(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      expect(docxResult.filename).toMatch(/\.docx$/);
      expect(String.fromCharCode(docxBytes[0], docxBytes[1])).toBe("PK");
      const docxAscii = Buffer.from(docxBytes).toString("latin1");
      expect(docxAscii).toContain("[Content_Types].xml");
      expect(docxAscii).toContain("word/document.xml");

      const pdfResult = ns.features.exportConversation("pdf");
      await flushAsync();
      await flushAsync();
      const pdfBlob = URL.createObjectURL.mock.calls.at(-1)?.[0];
      const pdfBytes = await blobBytes(pdfBlob);
      expect(pdfResult.mimeType).toBe("application/pdf");
      expect(pdfResult.filename).toMatch(/\.pdf$/);
      expect(String.fromCharCode(...pdfBytes.slice(0, 4))).toBe("%PDF");
      const pdfText = Buffer.from(pdfBytes).toString("latin1");
      expect(pdfText).toContain("/Type /XObject");
      expect(pdfText).toContain("/Subtype /Image");
    } finally {
      clickSpy.mockRestore();
    }
  });

  test("covers ordered list parsing and unsupported export formats", async () => {
    const { ns } = await loadChronoChat({
      html: `
        <header data-testid="conversation-header">
          <div data-testid="conversation-actions">
            <button type="button">Share</button>
            <button type="button">Activity</button>
          </div>
        </header>
        <main>
          <div data-message-author-role="user"><div>fallback message</div></div>
        </main>
      `,
    });

    const fixture = document.createElement("div");
    fixture.innerHTML = `
      <div data-message-content>
        <ol>
          <li>First</li>
          <li>Second</li>
        </ol>
        <figure>
          <img alt="Graph" src="/missing.png" />
          <figcaption>Figure caption</figcaption>
        </figure>
      </div>
    `;

    const blocks = ns.exporters.collectBlocksFromNode(fixture);

    expect(blocks).toEqual([
      {
        type: "list",
        ordered: true,
        items: ["First", "Second"],
      },
      {
        type: "image",
        alt: "Graph",
        src: expect.stringMatching(/^https?:\/\/localhost\/missing\.png$/),
      },
      {
        type: "paragraph",
        text: "Figure caption",
      },
    ]);
    expect(ns.exporters.dataUrlToRenderableBytes("https://example.com/image.png")).toMatchObject({
      placeholder: true,
      mimeType: "image/png",
    });
    await expect(
      ns.exporters.resolveImageBytes("https://localhost/missing.png"),
    ).resolves.toMatchObject({
      placeholder: true,
      mimeType: "image/png",
    });
    expect(ns.features.exportConversation("yaml")).toBeNull();
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
