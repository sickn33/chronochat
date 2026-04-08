import { loadChronoChat, flushAsync } from "./helpers/runtime.js";

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

  test("renders the minimal sidebar with only the retained controls", async () => {
    const { api } = await loadChronoChat({
      html: createHostShell(`
        <div data-message-author-role="user"><div>Alpha launch details</div></div>
        <div data-message-author-role="assistant"><div>beta release checklist</div></div>
        <div data-message-author-role="user"><div>Alpha retrospective</div></div>
      `),
    });
    api.toggleSidebar(true);
    await flushAsync();

    expect(document.getElementById("sidebar-close")).not.toBeNull();
    expect(document.getElementById("message-count")).not.toBeNull();
    expect(document.getElementById("filter-group")).not.toBeNull();
    expect(document.getElementById("message-search")).not.toBeNull();
    expect(document.getElementById("message-list")).not.toBeNull();

    expect(document.getElementById("theme-toggle")).toBeNull();
    expect(document.getElementById("export-toggle")).toBeNull();
    expect(document.getElementById("export-menu")).toBeNull();
    expect(document.getElementById("regex-toggle")).toBeNull();
    expect(document.getElementById("case-toggle")).toBeNull();
    expect(document.getElementById("search-clear")).toBeNull();
    expect(document.getElementById("pref-compact")).toBeNull();
    expect(document.getElementById("pref-preview-len")).toBeNull();
    expect(document.getElementById("sidebar-resize-handle")).toBeNull();
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

    api.toggleSidebar(true);
    await flushAsync();

    expect(toggleSlot.hidden).toBe(true);

    document.getElementById("sidebar-close").click();
    await flushAsync();

    expect(toggleSlot.hidden).toBe(false);
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
    expect(chatContainer?.style.marginLeft).toBe("336px");
    expect(chatContainer?.style.marginRight).toBe("0px");
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
    expect(chatContainer?.style.marginLeft).toBe("336px");
    expect(chatContainer?.style.marginRight).toBe("0px");
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

    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
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
});
