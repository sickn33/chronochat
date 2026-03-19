import { loadChronoChat, flushAsync } from "./helpers/runtime.js";

describe("ChronoChat content script", () => {
  test("renders sidebar, toggles search, regex and case sensitivity on runtime data", async () => {
    const { api } = await loadChronoChat({
      html: `
        <main>
          <div data-message-author-role="user"><div>Alpha launch details</div></div>
          <div data-message-author-role="assistant"><div>beta release checklist</div></div>
          <div data-message-author-role="user"><div>Alpha retrospective</div></div>
        </main>
      `,
    });
    api.toggleSidebar(true);
    await flushAsync();

    expect(document.querySelectorAll("#message-list li[data-message-index]").length).toBe(3);

    const search = document.getElementById("message-search");
    search.value = "alpha";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(document.querySelectorAll("#message-list li[data-message-index]").length).toBe(2);
    expect(document.getElementById("search-meta").textContent).toContain("2 matches");

    document.getElementById("case-toggle").click();
    expect(document.querySelectorAll("#message-list li[data-message-index]").length).toBe(0);

    search.value = "Alpha|beta";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    document.getElementById("regex-toggle").click();
    expect(document.querySelectorAll("#message-list li[data-message-index]").length).toBe(3);

    search.value = "[invalid";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(document.getElementById("search-meta").textContent).toContain(
      "Keeping previous valid search",
    );
    expect(document.querySelectorAll("#message-list li[data-message-index]").length).toBe(3);
  });

  test("keyboard navigation only uses visible items", async () => {
    const { ns, api } = await loadChronoChat({
      html: `
        <main>
          <div data-message-author-role="user"><div>first user</div></div>
          <div data-message-author-role="assistant"><div>only assistant</div></div>
          <div data-message-author-role="user"><div>second user</div></div>
        </main>
      `,
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
      html: `
        <main>
          <div data-message-author-role="user"><div>chat one user</div></div>
          <div data-message-author-role="assistant"><div>chat one assistant</div></div>
        </main>
      `,
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

  test("hides the floating jump button while the sidebar is open", async () => {
    const { api } = await loadChronoChat({
      html: `
        <main>
          <div data-message-author-role="user"><div>hello</div></div>
          <div data-message-author-role="assistant"><div>world</div></div>
        </main>
      `,
    });

    const toggle = document.getElementById("chatgpt-nav-toggle");
    expect(toggle.getAttribute("aria-hidden")).toBe("false");

    api.toggleSidebar(true);
    await flushAsync();

    expect(toggle.classList.contains("active")).toBe(true);
    expect(toggle.getAttribute("aria-hidden")).toBe("true");
    expect(toggle.getAttribute("tabindex")).toBe("-1");

    api.toggleSidebar(false);
    await flushAsync();

    expect(toggle.classList.contains("active")).toBe(false);
    expect(toggle.getAttribute("aria-hidden")).toBe("false");
    expect(toggle.hasAttribute("tabindex")).toBe(false);
  });

  test("resizes the sidebar from the drag handle and persists the width", async () => {
    const { ns, api, chrome } = await loadChronoChat({
      html: `
        <main>
          <div data-message-author-role="user"><div>hello</div></div>
          <div data-message-author-role="assistant"><div>world</div></div>
        </main>
      `,
    });

    api.toggleSidebar(true);
    await flushAsync();

    const sidebar = document.getElementById("chatgpt-nav-sidebar");
    const handle = document.getElementById("sidebar-resize-handle");

    handle.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, clientX: 100 }),
    );
    document.dispatchEvent(
      new MouseEvent("mousemove", { bubbles: true, clientX: 40 }),
    );
    await flushAsync();
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

    expect(ns.state.ui.sidebarWidth).toBe(396);
    expect(sidebar.style.getPropertyValue("width")).toBe("396px");
    expect(sidebar.style.getPropertyPriority("width")).toBe("important");
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ jtch_v2_sidebar_width: 396 }),
      expect.any(Function),
    );
  });

  test("tracks only root message nodes when nested message-like elements exist", async () => {
    const { api } = await loadChronoChat({
      html: `
        <main>
          <div class="group/conversation-turn">
            <div class="assistant-message">
              <div class="message-content message">This assistant reply contains nested message-like DOM.</div>
            </div>
          </div>
          <div class="group/conversation-turn">
            <div class="user-message">User asks a follow-up question.</div>
          </div>
        </main>
      `,
    });
    api.toggleSidebar(true);
    await flushAsync();

    expect(document.querySelectorAll("#message-list li[data-message-index]").length).toBe(2);
  });

  test("does not count code boxes as separate messages when real turns exist", async () => {
    const { api } = await loadChronoChat({
      html: `
        <main>
          <div class="group/conversation-turn">
            <div class="markdown">show me the code</div>
          </div>
          <div class="group/conversation-turn">
            <div class="markdown">Here is the implementation:</div>
            <div class="message code-block-shell">
              <pre><code>const amount = 42;</code></pre>
            </div>
          </div>
        </main>
      `,
    });
    api.toggleSidebar(true);
    await flushAsync();

    expect(document.querySelectorAll("#message-list li[data-message-index]").length).toBe(2);
  });

  test("keeps the assistant explanation in preview when a message also contains code", async () => {
    const { api } = await loadChronoChat({
      html: `
        <main>
          <div class="group/conversation-turn">
            <div class="markdown">show me the code</div>
          </div>
          <div class="group/conversation-turn">
            <div class="markdown">Here is the implementation you can send:</div>
            <div class="message code-block-shell">
              <pre><code>const amount = 42;</code></pre>
            </div>
          </div>
        </main>
      `,
    });
    api.toggleSidebar(true);
    await flushAsync();

    const assistantItem = document.querySelector('#message-list li[data-message-index="1"]');
    expect(assistantItem.textContent).toContain("Here is the implementation");
    expect(assistantItem.textContent).not.toContain("Code: const amount = 42;");
  });

  test("ignores composer-like trailing ui artifacts instead of rendering non-textual message", async () => {
    const { api } = await loadChronoChat({
      html: `
        <main>
          <div data-message-author-role="user"><div>real user message</div></div>
          <div data-message-author-role="assistant"><div>real assistant message</div></div>
          <div data-message-author-role="user">
            <form>
              <textarea placeholder="Send a message"></textarea>
              <button type="submit">Send</button>
            </form>
          </div>
        </main>
      `,
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
      html: `
        <main>
          <div data-message-author-role="user"><div>real user message</div></div>
          <div data-message-author-role="assistant"><div>real assistant message</div></div>
          <div data-message-author-role="user">
            <div>Drag files here or choose a prompt below</div>
            <form>
              <textarea placeholder="Message ChatGPT"></textarea>
              <button type="submit">Send</button>
            </form>
          </div>
        </main>
      `,
    });
    api.toggleSidebar(true);
    await flushAsync();

    expect(document.querySelectorAll("#message-list li[data-message-index]").length).toBe(2);
    expect(document.querySelector("#message-list")?.textContent).not.toContain(
      "Drag files here",
    );
  });
});
