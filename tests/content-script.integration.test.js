import { loadChronoChat, flushAsync } from "./helpers/runtime.js";
import { strFromU8, unzipSync } from "fflate";

function createHostShell(messagesHtml, extraHtml = "") {
  return `
    <header data-testid="conversation-header">
      <div data-testid="conversation-actions">
        <button type="button">Share</button>
        <button
          type="button"
          data-testid="activity-toggle"
          onclick="document.querySelector('[data-testid=&quot;activity-panel&quot;]')?.remove()"
        >
          Activity
        </button>
      </div>
    </header>
    <main>
      ${messagesHtml}
    </main>
    ${extraHtml}
  `;
}

function readBlobArrayBuffer(blob) {
  if (typeof blob?.arrayBuffer === "function") {
    return blob.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

describe("ChronoChat content script", () => {
  test("mounts the ChronoChat toggle inline before Share and reinjects it after rerender", async () => {
    const { api } = await loadChronoChat({
      html: createHostShell(`
        <div data-message-author-role="user"><div>Alpha launch details</div></div>
        <div data-message-author-role="assistant"><div>beta release checklist</div></div>
      `),
    });

    let actions = document.querySelector('[data-testid="conversation-actions"]');
    let toggle = document.getElementById("chatgpt-nav-toggle");
    let toggleSlot = document.getElementById("chatgpt-nav-toggle-slot");

    expect(toggle).not.toBeNull();
    expect(actions?.firstElementChild).toBe(toggleSlot);
    expect(toggleSlot?.contains(toggle)).toBe(true);
    expect(actions?.children[1]?.textContent).toBe("Share");

    actions.innerHTML = `
      <button type="button">Share</button>
      <button type="button">Activity</button>
    `;
    api.syncHostUi();
    await flushAsync();

    actions = document.querySelector('[data-testid="conversation-actions"]');
    toggle = document.getElementById("chatgpt-nav-toggle");
    toggleSlot = document.getElementById("chatgpt-nav-toggle-slot");

    expect(toggle).not.toBeNull();
    expect(actions?.firstElementChild).toBe(toggleSlot);
    expect(toggleSlot?.contains(toggle)).toBe(true);
    expect(actions?.children[1]?.textContent).toBe("Share");
  });

  test("mounts the ChronoChat toggle in the current ChatGPT thread header", async () => {
    await loadChronoChat({
      html: `
        <header data-testid="conversation-header">
          <button type="button" data-testid="open-sidebar-button">Open sidebar</button>
          <div data-testid="thread-header-right-actions-container">
            <div data-testid="thread-header-right-actions">
              <button type="button" data-testid="share-chat-button"></button>
              <button
                type="button"
                data-testid="conversation-options-button"
                aria-label="Open conversation options"
              ></button>
            </div>
          </div>
        </header>
        <main>
          <div data-message-author-role="user"><div>Live selector check</div></div>
          <div data-message-author-role="assistant"><div>Modern header response</div></div>
        </main>
      `,
    });

    const actions = document.querySelector('[data-testid="thread-header-right-actions"]');
    const toggle = document.getElementById("chatgpt-nav-toggle");
    const toggleSlot = document.getElementById("chatgpt-nav-toggle-slot");

    expect(toggle).not.toBeNull();
    expect(actions?.firstElementChild).toBe(toggleSlot);
    expect(toggleSlot?.contains(toggle)).toBe(true);
    expect(actions?.children[1]?.getAttribute("data-testid")).toBe("share-chat-button");
  });

  test("does not crash when ChatGPT rerenders the header reference during toggle placement", async () => {
    const { ns } = await loadChronoChat({
      html: `
        <header data-testid="conversation-header">
          <div data-testid="thread-header-right-actions">
            <button type="button" data-testid="share-chat-button">Share</button>
            <button type="button" data-testid="conversation-options-button">Options</button>
          </div>
        </header>
        <main>
          <div data-message-author-role="user"><div>Live selector check</div></div>
          <div data-message-author-role="assistant"><div>Modern header response</div></div>
        </main>
      `,
    });

    const actions = document.querySelector('[data-testid="thread-header-right-actions"]');
    const staleReference = document.createElement("button");
    staleReference.type = "button";
    staleReference.textContent = "Share";
    actions.appendChild(staleReference);

    ns.dom.getConversationActionBar = () => actions;
    ns.dom.getConversationActionReference = () => {
      staleReference.remove();
      return staleReference;
    };

    expect(() => ns.ui.syncHostTogglePosition()).not.toThrow();
    expect(actions.lastElementChild).toBe(document.getElementById("chatgpt-nav-toggle-slot"));
  });

  test("renders sidebar controls promised by the product contract", async () => {
    const { api } = await loadChronoChat({
      html: createHostShell(`
        <div data-message-author-role="user"><div>Alpha launch details</div></div>
        <div data-message-author-role="assistant"><div>beta release checklist</div></div>
        <div data-message-author-role="user"><div>Alpha retrospective</div></div>
      `),
    });
    api.toggleSidebar(true);
    await flushAsync();

    expect(document.querySelector(".jtch-title")?.textContent).toBe("ChronoChat");
    expect(document.getElementById("chatgpt-nav-toggle")?.textContent).toBe("Chrono");
    expect(document.getElementById("chatgpt-nav-edge-toggle")).not.toBeNull();
    expect(document.getElementById("sidebar-close")).not.toBeNull();
    expect(document.getElementById("message-count")).not.toBeNull();
    expect(document.getElementById("filter-group")).not.toBeNull();
    expect(document.getElementById("message-search")).not.toBeNull();
    expect(document.getElementById("message-list")).not.toBeNull();
    expect(document.getElementById("export-group")?.tagName).toBe("DETAILS");
    expect(document.querySelector(".jtch-export-menu-button")?.textContent).toBe("Export");
    expect(document.querySelectorAll("[data-export-format]").length).toBe(5);
    expect(document.querySelector('[data-export-format="pdf"]')).not.toBeNull();
    expect(document.querySelector('[data-export-format="zip"]')).not.toBeNull();
    expect(document.getElementById("regex-toggle")).toBeNull();
    expect(document.getElementById("case-toggle")).toBeNull();
    expect(document.getElementById("sidebar-resize-handle")).not.toBeNull();
    expect(document.getElementById("preview-controls")).not.toBeNull();
    expect(document.getElementById("attachment-dropbox")).not.toBeNull();
    expect(document.getElementById("attachment-types")).not.toBeNull();
    expect(document.querySelector(".jtch-attachment-caret")).not.toBeNull();
    expect(document.getElementById("attachment-list")).not.toBeNull();
    });

  test("renders sidebar search on runtime data", async () => {
    const { api } = await loadChronoChat({
      html: createHostShell(`
        <div data-message-author-role="user"><div>Alpha launch details</div></div>
        <div data-message-author-role="assistant"><div>beta release checklist</div></div>
        <div data-message-author-role="user"><div>Alpha retrospective</div></div>
      `),
    });
    api.toggleSidebar(true);
    await flushAsync();

    expect(document.querySelectorAll("#message-list li[data-message-index]").length).toBe(3);

    const search = document.getElementById("message-search");
    search.value = "alpha";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(document.querySelectorAll("#message-list li[data-message-index]").length).toBe(2);
    expect(document.getElementById("search-meta").textContent).toContain("2 matches");
  });

  test("shows longer multi-line message previews in the sidebar", async () => {
    const longMessage = [
      "Questo messaggio ha una prima frase abbastanza generica,",
      "ma poi contiene dettagli riconoscibili su fondi comuni, liquidita, costi,",
      "allocazione azionaria, scenari KID e confronto ETF che devono restare visibili",
      "nella preview per distinguere meglio il risultato nella sidebar.",
    ].join(" ");
    const { ns, api } = await loadChronoChat({
      html: createHostShell(`
        <div data-message-author-role="assistant"><div>${longMessage}</div></div>
      `),
    });
    api.toggleSidebar(true);
    await flushAsync();

    const itemText = document.querySelector(".jtch-item-text");
    expect(ns.config.maxPreviewLength).toBe(360);
    expect(itemText?.textContent).toContain("scenari KID");
    expect(itemText?.textContent).toContain("confronto ETF");
  });

  test("renders Markdown syntax in sidebar previews instead of showing raw markers", async () => {
    const { api } = await loadChronoChat({
      html: createHostShell(`
        <div data-message-author-role="assistant">
          <div class="markdown">
            <h2>Sintesi brutale</h2>
            <p>Risposta con <strong>enfasi</strong> e <code>codice</code>.</p>
            <ul><li>Primo punto</li></ul>
            <table>
              <tr><th>Voce</th><th>Importo</th></tr>
              <tr><td>Fondi</td><td>€2.221,47</td></tr>
            </table>
          </div>
        </div>
      `),
    });
    api.toggleSidebar(true);
    await flushAsync();

    const itemText = document.querySelector(".jtch-item-text");
    expect(itemText?.textContent).toContain("Sintesi brutale");
    expect(itemText?.textContent).toContain("enfasi");
    expect(itemText?.textContent).toContain("codice");
    expect(itemText?.textContent).toContain("Voce · Importo");
    expect(itemText?.textContent).not.toContain("##");
    expect(itemText?.textContent).not.toContain("**");
    expect(itemText?.textContent).not.toContain("| --- |");
    expect(document.querySelector(".jtch-item")?.getAttribute("aria-label")).not.toContain(
      "##",
    );
    expect(document.querySelector(".jtch-item")?.getAttribute("aria-label")).not.toContain(
      "**",
    );
    expect(itemText?.querySelector(".jtch-preview-row.strong")?.textContent).toBe(
      "Sintesi brutale",
    );
    expect(itemText?.querySelector("strong")?.textContent).toBe("enfasi");
    expect(itemText?.querySelector("code")?.textContent).toBe("codice");
  });

  test("preserves ChatGPT Message writing blocks as distinct Markdown sections", async () => {
    const { ns, api } = await loadChronoChat({
      html: createHostShell(`
        <div data-message-author-role="assistant">
          <div class="markdown prose markdown-new-styling">
            <p>Io lo manderei così:</p>
            <div class="group relative clear-both my-4 w-full overflow-visible">
              <div
                class="relative w-full overflow-clip rounded-[24px]"
                data-testid="writing-block-container"
              >
                <div data-testid="writing-block-header-sticky-container">
                  <div data-testid="writing-block-header-surface">
                    <div class="truncate">Message</div>
                    <button type="button" aria-label="Copy">Copy</button>
                  </div>
                </div>
                <div class="writing-block-editor">
                  <div
                    class="ProseMirror markdown prose"
                    contenteditable="true"
                  >
                    <p>Buongiorno Dottore, le scrivo per aggiornarla.</p>
                    <p>Secondo lei conviene fare una visita allergologica?</p>
                  </div>
                </div>
              </div>
            </div>
            <p>Solo se vuoi, aggiungi una frase finale.</p>
          </div>
        </div>
      `),
    });

    api.toggleSidebar(true);
    await flushAsync();

    const message = ns.state.conversation.messages[0];
    expect(message.fullText).toContain("Io lo manderei così:");
    expect(message.fullText).toContain("**Message**");
    expect(message.fullText).toContain(
      "Buongiorno Dottore, le scrivo per aggiornarla.",
    );
    expect(message.fullText).toContain(
      "Secondo lei conviene fare una visita allergologica?",
    );
    expect(message.fullText).toContain("Solo se vuoi, aggiungi una frase finale.");
    expect(message.fullText).not.toContain("MessageBuongiorno");
    expect(ns.state.conversation.messages).toHaveLength(1);
    expect(document.querySelectorAll("#message-list li[data-message-index]")).toHaveLength(1);
    expect(document.querySelector(".jtch-item-text")?.textContent).toContain("Message");
  });

  test("collects uploaded file tiles and generated images in the Files dropbox", async () => {
    const imageSource = "data:image/png;base64,iVBORw0KGgo=";
    const { ns, api } = await loadChronoChat({
      html: createHostShell(`
        <div data-message-author-role="user">
          <div
            class="relative group/file-tile"
            role="group"
            aria-label="20260424_Rendiconto Costi Oneri Incentivi_70835790.pdf"
          >
            <button type="button" aria-label="20260424_Rendiconto Costi Oneri Incentivi_70835790.pdf"></button>
            <div class="truncate font-semibold">20260424_Rendiconto Costi Oneri Incentivi_70835790.pdf</div>
            <div class="truncate text-token-text-secondary">PDF</div>
          </div>
        </div>
        <div data-message-author-role="assistant">
          <div class="markdown">
            <p>Generated chart follows.</p>
            <img alt="scenario-chart.png" src="${imageSource}" />
          </div>
        </div>
      `),
    });
    api.toggleSidebar(true);
    await flushAsync();

    expect(ns.state.conversation.attachments.length).toBe(2);
    expect(document.getElementById("attachment-count").textContent).toBe("2");
    expect(document.getElementById("attachment-dropbox").open).toBe(false);
    document.querySelector(".jtch-attachment-summary").click();
    expect(document.getElementById("attachment-dropbox").open).toBe(true);
    expect(document.getElementById("attachment-list").textContent).toContain(
      "20260424_Rendiconto Costi Oneri Incentivi_70835790.pdf",
    );
    expect(document.getElementById("attachment-list").textContent).toContain(
      "scenario-chart.png",
    );
    expect(document.querySelector(".jtch-attachment-preview img")?.getAttribute("src")).toBe(
      imageSource,
    );
  });

  test("keeps Files dropbox controls accessible with long attachment names", async () => {
    const previewClick = jest.fn();
    const longName =
      "20260424_Rendiconto_Costi_Oneri_Incentivi_con_allegati_e_note_finali_70835790.pdf";
    const { ns, api } = await loadChronoChat({
      html: createHostShell(`
        <div data-message-author-role="user">
          <div
            class="relative group/file-tile"
            role="group"
            aria-label="${longName}"
          >
            <button type="button" data-preview-action aria-label="${longName}"></button>
            <div class="truncate font-semibold">${longName}</div>
            <div class="truncate text-token-text-secondary">PDF</div>
          </div>
        </div>
      `),
    });
    document.querySelector("[data-preview-action]").addEventListener("click", previewClick);

    api.toggleSidebar(true);
    await flushAsync();

    document.querySelector(".jtch-attachment-summary").click();
    expect(document.querySelector(".jtch-attachment-summary").getAttribute("aria-label")).toBe(
      "Conversation files, 1 file",
    );
    expect(document.querySelector(".jtch-attachment-item").getAttribute("aria-label")).toContain(
      longName,
    );
    expect(document.querySelector(".jtch-attachment-item").getAttribute("title")).toBe(longName);
    expect(document.querySelector(".jtch-attachment-action").getAttribute("title")).toBe(
      `Open ${longName}`,
    );

    const openButton = document.querySelector('[data-attachment-action="open"]');
    openButton.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    await flushAsync();

    expect(previewClick).toHaveBeenCalled();
    expect(ns.state.ui.sidebarVisible).toBe(false);
  });

  test("captures live ChatGPT uploaded and generated image media wrappers", async () => {
    const uploadedSource =
      "https://chatgpt.com/backend-api/estuary/content?id=file_uploaded";
    const generatedSource =
      "https://chatgpt.com/backend-api/estuary/content?id=file_generated";
    const { ns, api } = await loadChronoChat({
      html: createHostShell(`
        <div data-message-author-role="user">
          <button type="button" aria-label="Open image in full view">
            <img alt="Uploaded image" src="${uploadedSource}" />
          </button>
          <div>test</div>
        </div>
        <h4>You said:</h4>
        <h4>ChatGPT said:</h4>
        <button type="button">
          <img alt="Generated image" src="${generatedSource}" />
        </button>
        <button type="button" aria-label="Edit image">Edit</button>
        <button type="button" aria-label="Share this image"></button>
      `),
    });

    api.toggleSidebar(true);
    await flushAsync();

    const generatedAttachment = ns.state.conversation.attachments.find(
      (attachment) => attachment.url === generatedSource,
    );
    const uploadedAttachment = ns.state.conversation.attachments.find(
      (attachment) => attachment.url === uploadedSource,
    );

    expect(uploadedAttachment).toMatchObject({
      name: "Uploaded image",
      kind: "image",
      role: "user",
      messageIndex: 0,
    });
    expect(generatedAttachment).toMatchObject({
      name: "Generated image",
      kind: "image",
      role: "assistant",
      messageIndex: 1,
    });
    expect(ns.state.conversation.messages[1]).toMatchObject({
      role: "assistant",
      preview: "Message contains an image or attachment",
    });
    expect(document.querySelectorAll(".jtch-attachment-item.kind-image")).toHaveLength(2);
    expect(document.getElementById("attachment-types").textContent).toContain("Image");
  });

  test("downloads an attachment from the Files dropbox without persisting message text in prefs", async () => {
    const originalFetch = global.fetch;
    const anchorClick = jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    global.fetch = jest.fn(async () => ({
      ok: true,
      blob: async () => new Blob(["image-bytes"], { type: "image/png" }),
    }));

    const { ns, api, chrome } = await loadChronoChat({
      html: createHostShell(`
        <div data-message-author-role="assistant">
          <div class="markdown">
            <p>private generated image context</p>
            <img alt="private-chart.png" src="https://chatgpt.com/backend-api/files/private-chart.png" />
          </div>
        </div>
      `),
    });
    api.toggleSidebar(true);
    await flushAsync();

    const attachment = ns.state.conversation.attachments[0];
    await ns.features.downloadAttachment(attachment.id);
    await ns.storage.save();

    expect(global.fetch).toHaveBeenCalledWith(attachment.url, { credentials: "include" });
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(anchorClick).toHaveBeenCalled();
    expect(ns.state.runtime.cachedAttachmentKeys.has(attachment.cacheKey)).toBe(true);
    expect(document.getElementById("search-meta").textContent).toBe("");
    expect(JSON.stringify(chrome.__storageState.jtch_v3_prefs)).not.toContain(
      "private generated image context",
    );

    global.fetch = originalFetch;
    anchorClick.mockRestore();
  });

  test("collects spreadsheet data-grid artifacts in the Files dropbox", async () => {
    const actionClick = jest.fn();
    const downloadClick = jest.fn();
    const { ns, api } = await loadChronoChat({
      html: createHostShell(`
        <div data-message-author-role="assistant">
          <div class="flex flex-col gap-2 w-[80%]">
            <div class="border-token-border-default text-token-text-primary relative overflow-hidden rounded-2xl border">
              <div class="flex items-center justify-between gap-2 px-4 py-3 bg-token-main-surface-primary">
                <span class="grow items-center truncate font-semibold capitalize">
                  investimenti 27042026 (1)
                  <button type="button" role="combobox">Sheet0</button>
                </span>
                <div class="flex items-center gap-3">
                  <span data-state="closed"><button class="flex items-center text-xs" data-grid-action="open">Open grid</button></span>
                  <span data-state="closed"><button class="flex items-center text-xs" data-grid-action="download">Download grid</button></span>
                </div>
              </div>
              <div class="flex items-center justify-center bg-token-main-surface-primary" style="height: 300px;">
                <canvas data-testid="data-grid-canvas" tabindex="0">
                  <table role="grid" aria-rowcount="16" aria-colcount="11">
                    <thead><tr><th role="columnheader">Unnamed: 0</th></tr></thead>
                    <tbody><tr><td role="gridcell">Investimenti</td></tr></tbody>
                  </table>
                </canvas>
              </div>
            </div>
          </div>
        </div>
      `),
    });
    document.querySelector("[data-grid-action='open']").addEventListener("click", actionClick);
    document.querySelector("[data-grid-action='download']").addEventListener("click", downloadClick);

    api.toggleSidebar(true);
    await flushAsync();

    expect(ns.state.conversation.attachments.length).toBe(1);
    expect(ns.state.conversation.attachments[0]).toMatchObject({
      name: "investimenti 27042026 (1)",
      typeLabel: "Sheet",
      kind: "spreadsheet",
      role: "assistant",
    });
    expect(document.getElementById("attachment-list").textContent).toContain(
      "investimenti 27042026 (1)",
    );
    expect(document.querySelector(".jtch-attachment-kind")?.textContent).toBe("Sheet");
    expect(document.querySelector(".jtch-attachment-source")?.textContent).toBe("AI");
    expect(document.getElementById("attachment-types").textContent).toContain("XLS");
    expect(document.getElementById("attachment-list").textContent).not.toContain("Sheet0");

    await ns.features.openAttachment(ns.state.conversation.attachments[0].id);
    expect(actionClick).toHaveBeenCalled();
    expect(ns.state.ui.sidebarVisible).toBe(false);

    api.toggleSidebar(true);
    await flushAsync();
    await ns.features.downloadAttachment(ns.state.conversation.attachments[0].id);
    expect(downloadClick).toHaveBeenCalled();
    expect(actionClick).toHaveBeenCalledTimes(1);
  });

  test("keeps attachment-only spreadsheet turns even when they have no readable title text", async () => {
    const { ns, api } = await loadChronoChat({
      html: createHostShell(`
        <div data-message-author-role="assistant">
          <div class="relative overflow-hidden rounded-2xl border">
            <div class="flex items-center justify-center" style="height: 300px;">
              <canvas data-testid="data-grid-canvas" tabindex="0" width="1024" height="600"></canvas>
            </div>
          </div>
        </div>
      `),
    });

    api.toggleSidebar(true);
    await flushAsync();

    expect(ns.state.conversation.messages.length).toBe(1);
    expect(ns.state.conversation.attachments.length).toBe(1);
    expect(ns.state.conversation.attachments[0]).toMatchObject({
      name: "Spreadsheet artifact",
      typeLabel: "Sheet",
      kind: "spreadsheet",
    });
    expect(document.getElementById("attachment-types").textContent).toContain("XLS");
  });

  test("keeps distinct spreadsheet artifacts when live ChatGPT gives them the same title", async () => {
    const spreadsheetArtifact = `
      <div class="flex flex-col gap-2 w-[80%]">
        <div class="border-token-border-default text-token-text-primary relative overflow-hidden rounded-2xl border">
          <div class="flex items-center justify-between gap-2 px-4 py-3 bg-token-main-surface-primary">
            <span class="grow items-center truncate font-semibold capitalize">
              Chronochat Test
              <button type="button" role="combobox">Sheet1</button>
            </span>
          </div>
          <div class="flex items-center justify-center bg-token-main-surface-primary">
            <div class="border-token-border-default border-t">
              <canvas data-testid="data-grid-canvas" tabindex="0" width="1024" height="600"></canvas>
            </div>
          </div>
        </div>
      </div>
    `;
    const { ns, api } = await loadChronoChat({
      html: createHostShell(`
        <div data-message-author-role="user">
          ${spreadsheetArtifact}
          ${spreadsheetArtifact}
        </div>
      `),
    });

    api.toggleSidebar(true);
    await flushAsync();

    const spreadsheetAttachments = ns.state.conversation.attachments.filter(
      (attachment) => attachment.kind === "spreadsheet",
    );
    expect(spreadsheetAttachments).toHaveLength(2);
    expect(spreadsheetAttachments.map((attachment) => attachment.name)).toEqual([
      "Chronochat Test",
      "Chronochat Test",
    ]);
    expect(document.querySelectorAll(".jtch-attachment-item.kind-spreadsheet")).toHaveLength(2);
  });

  test("keeps attachment-only Excel upload tiles with aria labels", async () => {
    const { ns, api } = await loadChronoChat({
      html: createHostShell(`
        <div data-message-author-role="user">
          <div class="relative group/file-tile" role="group" aria-label="investimenti.xlsx">
            <button type="button" aria-label="investimenti.xlsx"></button>
          </div>
        </div>
      `),
    });

    api.toggleSidebar(true);
    await flushAsync();

    expect(ns.state.conversation.messages.length).toBe(1);
    expect(ns.state.conversation.attachments.length).toBe(1);
    expect(ns.state.conversation.attachments[0]).toMatchObject({
      name: "investimenti.xlsx",
      typeLabel: "XLSX",
      kind: "file",
      role: "user",
    });
    expect(document.getElementById("attachment-types").textContent).toContain("XLSX");
  });

  test("captures file controls exposed only through filename aria labels", async () => {
    const { ns, api } = await loadChronoChat({
      html: createHostShell(`
        <div data-message-author-role="user">
          <div>Uploaded document</div>
          <button
            type="button"
            aria-label="Open visita-allergica.pdf"
            data-testid="attachment-control"
          ></button>
        </div>
      `),
    });

    api.toggleSidebar(true);
    await flushAsync();

    expect(ns.state.conversation.attachments).toHaveLength(1);
    expect(ns.state.conversation.attachments[0]).toMatchObject({
      name: "visita-allergica.pdf",
      typeLabel: "PDF",
      kind: "file",
      role: "user",
    });
    expect(document.getElementById("attachment-types").textContent).toContain("PDF");
  });

  test("collects spreadsheet artifacts even when ChatGPT mounts them outside message turns", async () => {
    const { ns, api } = await loadChronoChat({
      html: createHostShell(`
          <div data-message-author-role="user"><div>please inspect this workbook</div></div>
          <section class="relative overflow-hidden rounded-2xl border">
            <div class="flex items-center justify-between">
              <span class="font-semibold">
                investimenti fuori turno
                <button type="button" role="combobox">Sheet0</button>
              </span>
              <button type="button">Open</button>
            </div>
            <canvas data-testid="data-grid-canvas" tabindex="0"></canvas>
          </section>
        `),
    });

    api.toggleSidebar(true);
    await flushAsync();

    expect(ns.state.conversation.messages.length).toBe(1);
    expect(ns.state.conversation.attachments.length).toBe(1);
    expect(ns.state.conversation.attachments[0]).toMatchObject({
      name: "investimenti fuori turno",
      typeLabel: "Sheet",
      kind: "spreadsheet",
      role: "unknown",
      messageIndex: -1,
    });
    expect(document.getElementById("attachment-types").textContent).toContain("XLS");
    expect(document.getElementById("attachment-list").textContent).toContain(
      "investimenti fuori turno",
    );
  });

  test("does not collect profile menu or avatar chrome as conversation files", async () => {
    const { ns, api } = await loadChronoChat({
      html: createHostShell(
        `
          <div data-message-author-role="user"><div>normal message</div></div>
        `,
        `
          <nav aria-label="Account">
            <div role="group" aria-label="Open profile menu">
              <span>File</span>
              <span>Chat</span>
              <button type="button">Open</button>
            </div>
            <img alt="Profile image" src="data:image/png;base64,avatar" />
          </nav>
        `,
      ),
    });

    api.toggleSidebar(true);
    await flushAsync();

    expect(ns.state.conversation.attachments.length).toBe(0);
    expect(document.getElementById("attachment-types").textContent).toBe("No files");
    expect(document.getElementById("attachment-list").textContent).toContain(
      "No files in this conversation yet.",
    );
  });

  test("save does not open a preview when no direct download action is exposed", async () => {
    const previewClick = jest.fn();
    const { ns, api } = await loadChronoChat({
      html: createHostShell(`
        <div data-message-author-role="user">
          <div
            class="relative group/file-tile"
            role="group"
            aria-label="Preview-only.pdf"
          >
            <button type="button" data-preview-action aria-label="Preview-only.pdf"></button>
            <div class="truncate font-semibold">Preview-only.pdf</div>
            <div class="truncate text-token-text-secondary">PDF</div>
          </div>
        </div>
      `),
    });
    document.querySelector("[data-preview-action]").addEventListener("click", previewClick);

    api.toggleSidebar(true);
    await flushAsync();

    await ns.features.downloadAttachment(ns.state.conversation.attachments[0].id);
    expect(previewClick).not.toHaveBeenCalled();
    expect(document.getElementById("search-meta").textContent).toContain(
      "No direct download action",
    );
  });

  test("reopens the sidebar after an attachment preview closes", async () => {
    const { ns, api } = await loadChronoChat({
      html: createHostShell(`
        <div data-message-author-role="user">
          <div
            class="relative group/file-tile"
            role="group"
            aria-label="Preview.pdf"
          >
            <button type="button" data-preview-action aria-label="Preview.pdf"></button>
            <div class="truncate font-semibold">Preview.pdf</div>
            <div class="truncate text-token-text-secondary">PDF</div>
          </div>
        </div>
      `),
    });
    document.querySelector("[data-preview-action]").addEventListener("click", () => {
      const dialog = document.createElement("div");
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-label", "Visualizzatore Preview.pdf");
      document.body.appendChild(dialog);
    });

    api.toggleSidebar(true);
    await flushAsync();

    await ns.features.openAttachment(ns.state.conversation.attachments[0].id);
    await flushAsync();

    expect(ns.state.ui.sidebarVisible).toBe(false);
    expect(document.querySelector("[role='dialog']")).not.toBeNull();

    document.querySelector("[role='dialog']").remove();
    await flushAsync();
    await flushAsync();

    expect(ns.state.ui.sidebarVisible).toBe(true);
    expect(document.getElementById("chatgpt-nav-sidebar")?.classList.contains("open")).toBe(
      true,
    );
  });

  test("keyboard navigation only uses visible items", async () => {
    const { ns, api } = await loadChronoChat({
      html: createHostShell(`
        <div data-message-author-role="user"><div>first user</div></div>
        <div data-message-author-role="assistant"><div>only assistant</div></div>
        <div data-message-author-role="user"><div>second user</div></div>
      `),
    });
    api.toggleSidebar(true);
    await flushAsync();

    document
      .querySelector('[data-filter="assistant"]')
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(document.querySelectorAll("#message-list li[data-message-index]").length).toBe(1);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "j", bubbles: true }));
    expect(ns.state.ui.selectedMessageIndex).toBe(1);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  test("route change resets conversation state only", async () => {
    const { ns, api } = await loadChronoChat({
      pathname: "/c/chat-one",
      html: createHostShell(`
        <div data-message-author-role="user"><div>chat one user</div></div>
        <div data-message-author-role="assistant"><div>chat one assistant</div></div>
      `),
    });
    api.toggleSidebar(true);
    await flushAsync();

    window.history.replaceState({}, "", "/c/chat-two");
    api.handleRouteChange();
    await flushAsync();

    expect(ns.state.conversation.id).toBe("chat:chat-two");
    expect(ns.state.ui.search.term).toBe("");
    expect(ns.state.ui.selectedMessageIndex).toBe(-1);
  });

  test("clicking the host toggle opens ChronoChat even if Activity is present", async () => {
    const { api } = await loadChronoChat({
      html: createHostShell(
        `
          <div data-message-author-role="user"><div>hello</div></div>
          <div data-message-author-role="assistant"><div>world</div></div>
        `,
        `
          <aside data-testid="activity-panel">
            <div>
              <span>Activity</span>
              <button
                type="button"
                aria-label="Close activity"
                onclick="this.closest('[data-testid=&quot;activity-panel&quot;]').remove()"
              >
                ×
              </button>
            </div>
          </aside>
        `,
      ),
    });

    const toggle = document.getElementById("chatgpt-nav-toggle");
    toggle.click();
    await flushAsync();

    expect(document.querySelector('[data-testid="activity-panel"]')).not.toBeNull();
    expect(document.getElementById("chatgpt-nav-sidebar")?.classList.contains("open")).toBe(
      true,
    );
    expect(api.ns.state.ui.sidebarVisible).toBe(true);
  });

  test("hides the host toggle while ChronoChat is open and restores it when closed", async () => {
    const { api } = await loadChronoChat({
      html: createHostShell(`
        <div data-message-author-role="user"><div>hello</div></div>
        <div data-message-author-role="assistant"><div>world</div></div>
      `),
    });

    const toggleSlot = document.getElementById("chatgpt-nav-toggle-slot");
    const edgeToggle = document.getElementById("chatgpt-nav-edge-toggle");
    expect(edgeToggle.hidden).toBe(false);

    api.toggleSidebar(true);
    await flushAsync();

    expect(toggleSlot.hidden).toBe(true);
    expect(edgeToggle.hidden).toBe(true);

    document.getElementById("sidebar-close").click();
    await flushAsync();

    expect(toggleSlot.hidden).toBe(false);
    expect(edgeToggle.hidden).toBe(false);
  });

  test("left edge quick-open button opens ChronoChat", async () => {
    const { api } = await loadChronoChat({
      html: createHostShell(`
        <div data-message-author-role="user"><div>hello</div></div>
        <div data-message-author-role="assistant"><div>world</div></div>
      `),
    });

    const edgeToggle = document.getElementById("chatgpt-nav-edge-toggle");
    expect(edgeToggle.textContent).toBe(">");
    expect(edgeToggle.hidden).toBe(false);

    edgeToggle.click();
    await flushAsync();

    expect(api.ns.state.ui.sidebarVisible).toBe(true);
    expect(document.getElementById("chatgpt-nav-sidebar")?.classList.contains("open")).toBe(
      true,
    );
    expect(edgeToggle.hidden).toBe(true);
  });

  test("opens ChronoChat on the left without covering the host left rail", async () => {
    const { api } = await loadChronoChat({
      html: `
        <aside id="host-left-rail">
          <div>ChatGPT</div>
        </aside>
        ${createHostShell(`
          <div data-message-author-role="user"><div>hello</div></div>
          <div data-message-author-role="assistant"><div>world</div></div>
        `)}
      `,
    });

    const leftRail = document.getElementById("host-left-rail");
    leftRail.getBoundingClientRect = () => ({
      width: 88,
      height: 860,
      top: 0,
      right: 88,
      bottom: 860,
      left: 0,
    });

    api.toggleSidebar(true);
    await flushAsync();

    const sidebar = document.getElementById("chatgpt-nav-sidebar");
    const chatContainer = document.querySelector("main");

    expect(sidebar?.classList.contains("open")).toBe(true);
    expect(sidebar?.style.getPropertyValue("left")).toBe("88px");
      expect(chatContainer?.style.marginLeft).toBe("");
      expect(chatContainer?.style.marginRight).toBe("");
    });

    test("does not shift existing host inline layout styles when the sidebar opens", async () => {
      const { api } = await loadChronoChat({
        html: createHostShell(`
          <div data-message-author-role="user"><div>hello</div></div>
          <div data-message-author-role="assistant"><div>world</div></div>
        `),
      });
      const chatContainer = document.querySelector("main");
      chatContainer.style.marginLeft = "24px";
      chatContainer.style.marginRight = "12px";
      chatContainer.style.transition = "opacity 1s ease";

      api.toggleSidebar(true);
      await flushAsync();
      expect(chatContainer.style.marginLeft).toBe("24px");
      expect(chatContainer.style.marginRight).toBe("12px");
      expect(chatContainer.style.transition).toBe("opacity 1s ease");

      api.toggleSidebar(false);
      await flushAsync();
      expect(chatContainer.style.marginLeft).toBe("24px");
      expect(chatContainer.style.marginRight).toBe("12px");
      expect(chatContainer.style.transition).toBe("opacity 1s ease");
    });

    test("shifts the host chat only when the resized sidebar would cover it", async () => {
      const { ns, api } = await loadChronoChat({
        html: createHostShell(`
          <div data-message-author-role="user"><div>hello</div></div>
          <div data-message-author-role="assistant"><div>world</div></div>
        `),
      });
      const chatContainer = document.querySelector("main");
      chatContainer.getBoundingClientRect = () => ({
        width: 760,
        height: 680,
        top: 80,
        right: 1230,
        bottom: 760,
        left: 470,
      });

      api.toggleSidebar(true);
      await flushAsync();
      expect(chatContainer.style.marginLeft).toBe("");

      ns.features.setSidebarWidth(520);
      api.toggleSidebar(true);
      await flushAsync();
      expect(chatContainer.style.marginLeft).toBe("34px");

      api.toggleSidebar(false);
      await flushAsync();
      expect(chatContainer.style.marginLeft).toBe("");
    });

    test("does not shift the host chat at default width even when the container starts near the sidebar", async () => {
      const { ns, api } = await loadChronoChat({
        html: createHostShell(`
          <div data-message-author-role="user"><div>hello</div></div>
          <div data-message-author-role="assistant"><div>world</div></div>
        `),
      });
      const chatContainer = document.querySelector("main");
      chatContainer.getBoundingClientRect = () => ({
        width: 760,
        height: 680,
        top: 80,
        right: 1020,
        bottom: 760,
        left: 260,
      });

      api.toggleSidebar(true);
      await flushAsync();
      expect(chatContainer.style.marginLeft).toBe("");

      ns.features.setSidebarWidth(360);
      api.syncHostUi();
      await flushAsync();
      expect(chatContainer.style.marginLeft).toBe("");
    });

    test("keeps resize shifting stable while the shifted chat rect changes during drag", async () => {
      const { ns, api } = await loadChronoChat({
        html: createHostShell(`
          <div data-message-author-role="user"><div>hello</div></div>
          <div data-message-author-role="assistant"><div>world</div></div>
        `),
      });
      const chatContainer = document.querySelector("main");
      let currentLeft = 470;
      chatContainer.getBoundingClientRect = () => ({
        width: 760,
        height: 680,
        top: 80,
        right: currentLeft + 760,
        bottom: 760,
        left: currentLeft,
      });

      api.toggleSidebar(true);
      ns.features.setSidebarWidth(520);
      api.toggleSidebar(true);
      await flushAsync();
      expect(chatContainer.style.marginLeft).toBe("34px");

      currentLeft = 538;
      api.toggleSidebar(true);
      await flushAsync();
      expect(chatContainer.style.marginLeft).toBe("34px");
    });

  test("clicking the host toggle does not try to close the host activity rail first", async () => {
    const { api } = await loadChronoChat({
      html: `
        <header data-testid="conversation-header">
          <div data-testid="conversation-actions">
            <button type="button">Share</button>
            <button type="button" data-testid="activity-toggle">Activity</button>
          </div>
        </header>
        <main>
          <div data-message-author-role="user"><div>hello</div></div>
          <div data-message-author-role="assistant"><div>world</div></div>
        </main>
        <aside data-testid="activity-panel">
          <div>
            <span>Activity</span>
            <button
              type="button"
              aria-label="Close activity"
              onclick="this.closest('[data-testid=&quot;activity-panel&quot;]').remove()"
            >
              ×
            </button>
          </div>
        </aside>
      `,
    });

    document.querySelector('[data-testid="activity-panel"]').getBoundingClientRect = () => ({
      width: 392,
      height: 860,
      top: 0,
      right: 1280,
      bottom: 860,
      left: 888,
    });

    document.getElementById("chatgpt-nav-toggle").click();
    await flushAsync();

    expect(document.querySelector('[data-testid="activity-panel"]')).not.toBeNull();
    expect(document.getElementById("chatgpt-nav-sidebar")?.classList.contains("open")).toBe(
      true,
    );
  });

  test("clicking the host toggle opens ChronoChat even while the host activity rail is open", async () => {
    const { api } = await loadChronoChat({
      html: `
        <header data-testid="conversation-header">
          <div data-testid="conversation-actions">
            <button type="button">Share</button>
            <button type="button">Activity</button>
          </div>
        </header>
        <main>
          <div data-message-author-role="user"><div>hello</div></div>
          <div data-message-author-role="assistant"><div>world</div></div>
        </main>
        <aside data-testid="activity-panel">
          <div>
            <span>Activity</span>
            <button type="button" aria-label="Close activity">×</button>
          </div>
        </aside>
      `,
    });

    window.innerWidth = 1280;
    const panel = document.querySelector('[data-testid="activity-panel"]');
    panel.getBoundingClientRect = () => ({
      width: 392,
      height: 820,
      top: 16,
      right: 1272,
      bottom: 836,
      left: 880,
    });

    document.getElementById("chatgpt-nav-toggle").click();
    await flushAsync();

    const sidebar = document.getElementById("chatgpt-nav-sidebar");

    expect(sidebar?.classList.contains("open")).toBe(true);
    expect(api.ns.state.ui.sidebarVisible).toBe(true);
    expect(panel.style.getPropertyValue("opacity")).toBe("");
    expect(panel.style.getPropertyValue("pointer-events")).toBe("");
  });

  test("does not treat an unrelated right-side panel with a close button as Activity", async () => {
    const { api } = await loadChronoChat({
      html: `
        <header data-testid="conversation-header">
          <div data-testid="conversation-actions">
            <button type="button">Share</button>
          </div>
        </header>
        <main>
          <div data-message-author-role="user"><div>hello</div></div>
          <div data-message-author-role="assistant"><div>world</div></div>
        </main>
        <aside id="aux-panel">
          <div>
            <span>Details</span>
            <button type="button" aria-label="Close">×</button>
          </div>
        </aside>
      `,
    });

    const panel = document.getElementById("aux-panel");
    panel.getBoundingClientRect = () => ({
      width: 320,
      height: 760,
      top: 0,
      right: 1280,
      bottom: 760,
      left: 960,
    });

    document.getElementById("chatgpt-nav-toggle").click();
    await flushAsync();

    expect(api.ns.dom.getHostSidePanel()).toBeNull();
    expect(document.getElementById("chatgpt-nav-sidebar")?.classList.contains("open")).toBe(
      true,
    );
    expect(api.ns.state.ui.sidebarVisible).toBe(true);
  });

  test("detects a fallback host rail on narrow layouts", async () => {
    const originalInnerWidth = window.innerWidth;

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 430,
    });

    try {
      const { api } = await loadChronoChat({
        html: `
          <header data-testid="conversation-header">
            <div data-testid="conversation-actions">
              <button type="button">Share</button>
              <button type="button">Activity</button>
            </div>
          </header>
          <main>
            <div data-message-author-role="user"><div>hello</div></div>
            <div data-message-author-role="assistant"><div>world</div></div>
          </main>
          <aside id="fallback-activity-panel">
            <div>
              <span>Activity</span>
              <button type="button" aria-label="Close activity">×</button>
            </div>
            <div>Thinking</div>
            <div>Sources</div>
          </aside>
        `,
      });

      const panel = document.getElementById("fallback-activity-panel");
      panel.getBoundingClientRect = () => ({
        width: 320,
        height: 760,
        top: 0,
        right: 430,
        bottom: 760,
        left: 110,
      });

      expect(api.ns.dom.getHostSidePanel()).toBe(panel);
    } finally {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        writable: true,
        value: originalInnerWidth,
      });
    }
  });

  test("does not treat an unrelated right-side panel as the activity rail", async () => {
    const { api } = await loadChronoChat({
      html: `
        <header data-testid="conversation-header">
          <div data-testid="conversation-actions">
            <button type="button">Share</button>
            <button type="button">Activity</button>
          </div>
        </header>
        <main>
          <div data-message-author-role="user"><div>hello</div></div>
          <div data-message-author-role="assistant"><div>world</div></div>
        </main>
        <aside id="generic-right-panel">
          <div>
            <span>Inspector</span>
            <button type="button" aria-label="Close panel">×</button>
          </div>
          <div>Status</div>
        </aside>
      `,
    });

    const panel = document.getElementById("generic-right-panel");
    panel.getBoundingClientRect = () => ({
      width: 320,
      height: 760,
      top: 0,
      right: 1280,
      bottom: 760,
      left: 960,
    });

    expect(api.ns.dom.getHostSidePanel()).toBeNull();

    document.getElementById("chatgpt-nav-toggle").click();
    await flushAsync();

    expect(document.getElementById("chatgpt-nav-sidebar")?.classList.contains("open")).toBe(
      true,
    );
  });

  test("opens ChronoChat to the right of the host left rail", async () => {
    const { api } = await loadChronoChat({
      html: `
        <aside id="app-left-rail"></aside>
        <header data-testid="conversation-header">
          <div data-testid="conversation-actions">
            <button type="button">Share</button>
            <button type="button">Activity</button>
          </div>
        </header>
        <main>
          <div data-message-author-role="user"><div>hello</div></div>
          <div data-message-author-role="assistant"><div>world</div></div>
        </main>
      `,
    });

    const rail = document.getElementById("app-left-rail");
    rail.getBoundingClientRect = () => ({
      width: 88,
      height: 820,
      top: 0,
      right: 88,
      bottom: 820,
      left: 0,
    });

    api.toggleSidebar(true);
    await flushAsync();

    const sidebar = document.getElementById("chatgpt-nav-sidebar");
    const chatContainer = document.querySelector("main");

    expect(sidebar?.classList.contains("open")).toBe(true);
    expect(sidebar?.style.getPropertyValue("left")).toBe("88px");
      expect(chatContainer?.style.marginLeft).toBe("");
      expect(chatContainer?.style.marginRight).toBe("");
    });

  test("close button click closes the sidebar", async () => {
    const { api } = await loadChronoChat({
      html: createHostShell(`
        <div data-message-author-role="user"><div>hello</div></div>
        <div data-message-author-role="assistant"><div>world</div></div>
      `),
    });

    api.toggleSidebar(true);
    await flushAsync();

    document.getElementById("sidebar-close").click();
    await flushAsync();

    expect(api.ns.state.ui.sidebarVisible).toBe(false);
    expect(document.getElementById("chatgpt-nav-sidebar")?.classList.contains("open")).toBe(
      false,
    );
  });

  test("cleanup does not throw after sidebar lifecycle changes", async () => {
    const { api } = await loadChronoChat({
      html: createHostShell(`
        <div data-message-author-role="user"><div>hello</div></div>
        <div data-message-author-role="assistant"><div>world</div></div>
      `),
    });

    expect(() => api.cleanup()).not.toThrow();
  });

  test("rebinds sidebar controls after page lifecycle cleanup and reinit", async () => {
    const { ns, api } = await loadChronoChat({
      html: createHostShell(`
        <div data-message-author-role="user"><div>first user</div></div>
        <div data-message-author-role="assistant"><div>only assistant</div></div>
        <div data-message-author-role="user"><div>second user</div></div>
      `),
    });

    api.toggleSidebar(true);
    await flushAsync();

    api.cleanup();
    await api.init();
    api.toggleSidebar(true);
    await flushAsync();

    document
      .querySelector('[data-filter="assistant"]')
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(ns.state.ui.currentFilter).toBe("assistant");
    expect(document.querySelectorAll("#message-list li[data-message-index]").length).toBe(1);
  });

    test("filter clicks update the visible message list", async () => {
      const { api } = await loadChronoChat({
        html: createHostShell(`
          <div data-message-author-role="user"><div>first user</div></div>
          <div data-message-author-role="assistant"><div>only assistant</div></div>
          <div data-message-author-role="user"><div>second user</div></div>
        `),
      });

      api.toggleSidebar(true);
      await flushAsync();

      document
        .querySelector('[data-filter="assistant"]')
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flushAsync();

      expect(document.querySelectorAll("#message-list li[data-message-index]").length).toBe(1);
      expect(document.querySelector("#message-list")?.textContent).toContain("only assistant");
    });

    test("search stays plain case-insensitive without regex or Aa controls", async () => {
      const { api } = await loadChronoChat({
        html: createHostShell(`
          <div data-message-author-role="user"><div>Alpha [draft] launch details</div></div>
          <div data-message-author-role="assistant"><div>alpha lowercase reply</div></div>
          <div data-message-author-role="user"><div>Beta plan</div></div>
        `),
      });

      api.toggleSidebar(true);
      await flushAsync();

      const search = document.getElementById("message-search");
      expect(document.getElementById("regex-toggle")).toBeNull();
      expect(document.getElementById("case-toggle")).toBeNull();

      search.value = "Alpha";
      search.dispatchEvent(new Event("input", { bubbles: true }));
      expect(document.querySelectorAll("#message-list li[data-message-index]").length).toBe(2);

      search.value = "[";
      search.dispatchEvent(new Event("input", { bubbles: true }));
      expect(document.querySelectorAll("#message-list li[data-message-index]").length).toBe(1);
      expect(document.getElementById("search-meta").textContent).not.toContain("Invalid regex");
    });

    test("exports JSON, CSV, Markdown, and PDF through the dropdown menu", async () => {
      const anchorClick = jest
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});
      const { api } = await loadChronoChat({
        html: createHostShell(`
          <div data-message-author-role="user"><div>Export me</div></div>
          <div data-message-author-role="assistant"><div>Export reply</div></div>
        `),
      });

      api.toggleSidebar(true);
      await flushAsync();

      const exportGroup = document.getElementById("export-group");
      expect(exportGroup.open).toBe(false);
      document.querySelector(".jtch-export-menu-button").click();
      expect(exportGroup.open).toBe(true);
      document.querySelector('[data-export-format="json"]').click();
      expect(exportGroup.open).toBe(false);
      document.querySelector(".jtch-export-menu-button").click();
      document.querySelector('[data-export-format="csv"]').click();
      document.querySelector(".jtch-export-menu-button").click();
      document.querySelector('[data-export-format="markdown"]').click();
      document.querySelector(".jtch-export-menu-button").click();
      document.querySelector('[data-export-format="pdf"]').click();
      await flushAsync();

      expect(anchorClick).toHaveBeenCalledTimes(3);
      expect(URL.createObjectURL).toHaveBeenCalledTimes(3);
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3);
      expect(document.querySelector(".jtch-print-frame")).not.toBeNull();
      expect(document.getElementById("search-meta").textContent).toContain("PDF export opened");
      anchorClick.mockRestore();
    });

    test("exports a ZIP bundle with conversation files, manifest, and fetchable attachments", async () => {
      const originalFetch = global.fetch;
      const anchorClick = jest
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});
      global.fetch = jest.fn(async (url) => {
        if (String(url).includes("report.pdf")) {
          const bytes = new TextEncoder().encode("pdf-bytes");
          return {
            ok: true,
            blob: async () => ({
              size: bytes.byteLength,
              type: "application/pdf",
              arrayBuffer: async () => bytes.buffer,
            }),
          };
        }
        return {
          ok: false,
          status: 404,
          blob: async () => new Blob(["missing"]),
        };
      });

      const { ns, api } = await loadChronoChat({
        html: createHostShell(`
          <div data-message-author-role="user">
            <div>Here is the report</div>
            <a href="https://chatgpt.com/backend-api/files/report.pdf">report.pdf</a>
          </div>
          <div data-message-author-role="assistant">
            <div>And here is a local preview without a URL</div>
            <div class="relative group/file-tile" role="group" aria-label="preview-only.pdf">
              <button type="button" aria-label="preview-only.pdf"></button>
              <div class="truncate font-semibold">preview-only.pdf</div>
              <div class="truncate text-token-text-secondary">PDF</div>
            </div>
          </div>
        `),
      });
      api.toggleSidebar(true);
      await flushAsync();

      const createObjectURL = URL.createObjectURL;
      await ns.features.downloadZipExport();

      const zipBlob = createObjectURL.mock.calls.at(-1)?.[0];
      const zipBytes = new Uint8Array(await readBlobArrayBuffer(zipBlob));
      const files = unzipSync(zipBytes);
      const manifest = JSON.parse(strFromU8(files["attachments-manifest.json"]));
      const conversationJson = JSON.parse(strFromU8(files["conversation.json"]));
      const markdown = strFromU8(files["conversation.md"]);

      expect(anchorClick).toHaveBeenCalled();
      expect(files["conversation.csv"]).toBeDefined();
      expect(files["attachments/01-report.pdf"]).toBeDefined();
      expect(strFromU8(files["attachments/01-report.pdf"])).toBe("pdf-bytes");
      expect(manifest.attachments).toHaveLength(2);
      expect(manifest.attachments[0]).toMatchObject({
        name: "report.pdf",
        included: true,
        exportPath: "attachments/01-report.pdf",
        mimeType: "application/pdf",
      });
      expect(manifest.attachments[1]).toMatchObject({
        name: "preview-only.pdf",
        included: false,
      });
      expect(manifest.attachments[1].reason).toContain("No readable file URL");
      expect(conversationJson.conversation.attachmentCount).toBe(2);
      expect(conversationJson.conversation.attachments[0].included).toBe(true);
      expect(markdown).toContain("## Files (2)");
      expect(document.getElementById("search-meta").textContent).toContain(
        "ZIP exported: 1/2 files included",
      );

      global.fetch = originalFetch;
      anchorClick.mockRestore();
    });

    test("removed search mode prefs cannot change visible results", async () => {
      const { ns, api } = await loadChronoChat({
        html: createHostShell(`
          <div data-message-author-role="user"><div>Alpha launch details</div></div>
          <div data-message-author-role="assistant"><div>alpha lowercase reply</div></div>
        `),
      });

      api.toggleSidebar(true);
      await flushAsync();

      const search = document.getElementById("message-search");
      search.value = "alpha";
      search.dispatchEvent(new Event("input", { bubbles: true }));
      expect(document.querySelectorAll("#message-list li[data-message-index]").length).toBe(2);

      ns.features.applySearchState({ regex: true, caseSensitive: true });
      expect(ns.state.ui.search.regex).toBe(false);
      expect(ns.state.ui.search.caseSensitive).toBe(false);
      expect(document.querySelectorAll("#message-list li[data-message-index]").length).toBe(2);
      expect(document.getElementById("search-meta").textContent).toBe("2 matches");
    });

    test("resizes sidebar and persists only UI preferences", async () => {
      const { ns, api, chrome } = await loadChronoChat({
        html: createHostShell(`
          <div data-message-author-role="user"><div>private message content</div></div>
          <div data-message-author-role="assistant"><div>private assistant content</div></div>
        `),
      });

      api.toggleSidebar(true);
      ns.features.setSidebarWidth(420);
      api.syncHostUi();
      await ns.storage.save();

      expect(document.getElementById("chatgpt-nav-sidebar").style.width).toBe("420px");
      expect(chrome.__storageState.jtch_v3_prefs.sidebarWidth).toBe(420);
      expect(JSON.stringify(chrome.__storageState.jtch_v3_prefs)).not.toContain(
        "private message content",
      );
      expect(JSON.stringify(chrome.__storageState.jtch_v3_prefs)).not.toContain(
        "private assistant content",
      );
    });

    test("drags the sidebar resize handle and changes preview text size", async () => {
      const { ns, api, chrome } = await loadChronoChat({
        html: createHostShell(`
          <div data-message-author-role="user"><div>private message content</div></div>
          <div data-message-author-role="assistant"><div>private assistant content</div></div>
        `),
      });

      api.toggleSidebar(true);
      await flushAsync();

      const sidebar = document.getElementById("chatgpt-nav-sidebar");
      const resizeHandle = document.getElementById("sidebar-resize-handle");
      resizeHandle.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, clientX: 336 }),
      );
      window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 420 }));
      window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

      expect(sidebar.style.width).toBe("420px");
      expect(ns.state.ui.sidebarWidth).toBe(420);

      document
        .querySelector('[data-preview-size-action="increase"]')
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(ns.state.ui.previewFontSize).toBe(13);
      expect(sidebar.style.getPropertyValue("--jtch-preview-font-size")).toBe("13px");
      expect(
        document.querySelector('[data-preview-size-action="reset"]').getAttribute(
          "aria-pressed",
        ),
      ).toBe("false");

      document
        .querySelector('[data-preview-size-action="reset"]')
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(ns.state.ui.previewFontSize).toBe(12);
      expect(sidebar.style.getPropertyValue("--jtch-preview-font-size")).toBe("12px");
      expect(
        document.querySelector('[data-preview-size-action="reset"]').getAttribute(
          "aria-pressed",
        ),
      ).toBe("true");

      await ns.storage.save();
      expect(chrome.__storageState.jtch_v3_prefs.previewFontSize).toBe(12);
      expect(chrome.__storageState.jtch_v3_prefs.search).toBeUndefined();
      expect(JSON.stringify(chrome.__storageState.jtch_v3_prefs)).not.toContain(
        "private message content",
      );
    });

    test("loads persisted sidebar width and preview font size while ignoring removed search options", async () => {
      const { ns } = await loadChronoChat({
        html: createHostShell(`
          <div data-message-author-role="user"><div>stored prefs message</div></div>
        `),
        storageSeed: {
          jtch_v3_prefs: {
            sidebarWidth: 410,
            previewFontSize: 14,
            search: { regex: true, caseSensitive: true },
          },
        },
      });

      expect(ns.state.ui.sidebarWidth).toBe(410);
      expect(ns.state.ui.previewFontSize).toBe(14);
      expect(ns.state.ui.search.regex).toBe(false);
      expect(ns.state.ui.search.caseSensitive).toBe(false);
    });

    test("virtual list starts on latest messages and loads earlier matches", async () => {
      const messages = Array.from({ length: 90 }, (_, index) => {
        const role = index % 2 === 0 ? "user" : "assistant";
        return `<div data-message-author-role="${role}"><div>message ${index}</div></div>`;
      }).join("");
      const { api } = await loadChronoChat({
        html: createHostShell(messages),
      });

      api.toggleSidebar(true);
      await flushAsync();

      expect(document.querySelector("#message-list")?.textContent).toContain("message 89");
      expect(document.querySelector("#message-list")?.textContent).not.toContain("message 0");

      document.querySelector("[data-action='load-older']").click();
      await flushAsync();

      expect(document.querySelector("#message-list")?.textContent).toContain("message 0");
    });

  test("clicking a sidebar message scrolls to the source message node", async () => {
    const { api } = await loadChronoChat({
      html: createHostShell(`
        <div data-message-author-role="user"><div>first user</div></div>
        <div data-message-author-role="assistant"><div>only assistant</div></div>
      `),
    });

    api.toggleSidebar(true);
    await flushAsync();

    const item = document.querySelector('#message-list li[data-message-index="1"]');
    item.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: "start" }),
    );
    expect(api.ns.state.conversation.messages[1].domNode.classList).toContain(
      "jtch-target-highlight",
    );
  });

  test("recreated sidebar keeps close, filter, and message click interactions working", async () => {
    const { api } = await loadChronoChat({
      html: createHostShell(`
        <div data-message-author-role="user"><div>first user</div></div>
        <div data-message-author-role="assistant"><div>only assistant</div></div>
        <div data-message-author-role="user"><div>second user</div></div>
      `),
    });

    api.toggleSidebar(true);
    await flushAsync();

    document.getElementById("chatgpt-nav-sidebar").remove();
    api.toggleSidebar(true);
    await flushAsync();

    document
      .querySelector('[data-filter="assistant"]')
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushAsync();

    expect(document.querySelectorAll("#message-list li[data-message-index]").length).toBe(1);

    document
      .querySelector('#message-list li[data-message-index="1"]')
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();

    document.getElementById("sidebar-close").click();
    await flushAsync();

    expect(api.ns.state.ui.sidebarVisible).toBe(false);
  });

  test("opening the activity panel leaves left-docked ChronoChat open", async () => {
    const { api } = await loadChronoChat({
      html: createHostShell(`
        <div data-message-author-role="user"><div>hello</div></div>
        <div data-message-author-role="assistant"><div>world</div></div>
      `),
    });

    const toggle = document.getElementById("chatgpt-nav-toggle");
    toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushAsync();

    expect(document.getElementById("chatgpt-nav-sidebar")?.classList.contains("open")).toBe(
      true,
    );

    const panel = document.createElement("aside");
    panel.dataset.testid = "activity-panel";
    panel.innerHTML = `
      <div>
        <span>Activity</span>
        <button type="button" aria-label="Close activity">×</button>
      </div>
    `;
    document.body.appendChild(panel);
    api.syncHostUi();
    await flushAsync();

    expect(document.getElementById("chatgpt-nav-sidebar")?.classList.contains("open")).toBe(
      true,
    );
    expect(api.ns.state.ui.sidebarVisible).toBe(true);
    expect(document.getElementById("chatgpt-nav-toggle")).toBe(toggle);
  });

  test("tracks only root message nodes when nested message-like elements exist", async () => {
    const { api } = await loadChronoChat({
      html: createHostShell(`
        <div class="group/conversation-turn">
          <div class="assistant-message">
            <div class="message-content message">This assistant reply contains nested message-like DOM.</div>
          </div>
        </div>
        <div class="group/conversation-turn">
          <div class="user-message">User asks a follow-up question.</div>
        </div>
      `),
    });
    api.toggleSidebar(true);
    await flushAsync();

    expect(document.querySelectorAll("#message-list li[data-message-index]").length).toBe(2);
  });

  test("does not count code boxes as separate messages when real turns exist", async () => {
    const { api } = await loadChronoChat({
      html: createHostShell(`
        <div class="group/conversation-turn">
          <div class="markdown">show me the code</div>
        </div>
        <div class="group/conversation-turn">
          <div class="markdown">Here is the implementation:</div>
          <div class="message code-block-shell">
            <pre><code>const amount = 42;</code></pre>
          </div>
        </div>
      `),
    });
    api.toggleSidebar(true);
    await flushAsync();

    expect(document.querySelectorAll("#message-list li[data-message-index]").length).toBe(2);
  });

  test("keeps the assistant explanation in preview when a message also contains code", async () => {
    const { api } = await loadChronoChat({
      html: createHostShell(`
        <div class="group/conversation-turn">
          <div class="markdown">show me the code</div>
        </div>
        <div class="group/conversation-turn">
          <div class="markdown">Here is the implementation you can send:</div>
          <div class="message code-block-shell">
            <pre><code>const amount = 42;</code></pre>
          </div>
        </div>
      `),
    });
    api.toggleSidebar(true);
    await flushAsync();

    const assistantItem = document.querySelector('#message-list li[data-message-index="1"]');
    expect(assistantItem.textContent).toContain("Here is the implementation");
    expect(assistantItem.textContent).not.toContain("Code: const amount = 42;");
  });

  test("ignores composer-like trailing ui artifacts instead of rendering non-textual message", async () => {
    const { api } = await loadChronoChat({
      html: createHostShell(`
        <div data-message-author-role="user"><div>real user message</div></div>
        <div data-message-author-role="assistant"><div>real assistant message</div></div>
        <div data-message-author-role="user">
          <form>
            <textarea placeholder="Send a message"></textarea>
            <button type="submit">Send</button>
          </form>
        </div>
      `),
    });
    api.toggleSidebar(true);
    await flushAsync();

    expect(document.querySelectorAll("#message-list li[data-message-index]").length).toBe(2);
    expect(document.querySelector("#message-list")?.textContent).not.toContain(
      "Non-textual message",
    );
  });

    test("ignores trailing composer wrappers even when they contain visible helper text", async () => {
    const { api } = await loadChronoChat({
      html: createHostShell(`
        <div data-message-author-role="user"><div>real user message</div></div>
        <div data-message-author-role="assistant"><div>real assistant message</div></div>
        <div data-message-author-role="user">
          <div>Drag files here or choose a prompt below</div>
          <form>
            <textarea placeholder="Message ChatGPT"></textarea>
            <button type="submit">Send</button>
          </form>
        </div>
      `),
    });
    api.toggleSidebar(true);
    await flushAsync();

    expect(document.querySelectorAll("#message-list li[data-message-index]").length).toBe(2);
      expect(document.querySelector("#message-list")?.textContent).not.toContain(
        "Drag files here",
      );
    });

    test("uses rendered message index for fallback role parity after skipped artifacts", async () => {
      const { api } = await loadChronoChat({
        html: createHostShell(`
          <div data-testid="conversation-turn">
            <form>
              <textarea placeholder="Message ChatGPT"></textarea>
            </form>
          </div>
          <div data-testid="conversation-turn"><div>first real message without metadata</div></div>
          <div data-testid="conversation-turn"><div>second real message without metadata</div></div>
        `),
      });

      api.toggleSidebar(true);
      await flushAsync();

      const items = Array.from(document.querySelectorAll("#message-list li[data-message-index]"));
      expect(items[0].dataset.role).toBe("user");
      expect(items[1].dataset.role).toBe("assistant");
    });

    test("creates a root conversation id for root URLs with model query params", async () => {
      const { ns } = await loadChronoChat({
        pathname: "/?model=text-davinci-002-render-sha",
        html: createHostShell(`
          <div data-message-author-role="user"><div>root chat message</div></div>
        `),
      });

      expect(ns.state.conversation.id).toBe("chat:root");
    });

    test("represents image-only messages instead of dropping them", async () => {
      const { api } = await loadChronoChat({
        html: createHostShell(`
          <div data-message-author-role="assistant">
            <img alt="Generated image" src="data:image/png;base64,abc" />
          </div>
        `),
      });

      api.toggleSidebar(true);
      await flushAsync();

      expect(document.querySelector("#message-list")?.textContent).toContain(
        "Message contains an image or attachment",
      );
    });
  });
