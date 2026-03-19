(function (root) {
  const ns = root.__JTC__;
  const state = ns.state;

  function getElement(id) {
    return document.getElementById(id);
  }

  function registerCleanup(fn) {
    state.runtime.cleanupFns.push(fn);
  }

  function addEventListenerWithCleanup(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    registerCleanup(() => target.removeEventListener(type, handler, options));
  }

  function closeExportMenu() {
    const menu = getElement("export-menu");
    if (!menu) return;
    menu.classList.add("hidden");
    state.ui.exportMenuVisible = false;
  }

  function openExportMenu() {
    const menu = getElement("export-menu");
    if (!menu) return;
    menu.classList.remove("hidden");
    state.ui.exportMenuVisible = true;
  }

  function syncSidebarVisibility() {
    const sidebar = getElement("chatgpt-nav-sidebar");
    const toggle = getElement("chatgpt-nav-toggle");
    const chatContainer = ns.dom.getChatContainer();
    if (!sidebar || !toggle) return;

    sidebar.classList.toggle("open", state.ui.sidebarVisible);
    toggle.classList.toggle("active", state.ui.sidebarVisible);
    toggle.setAttribute("aria-pressed", state.ui.sidebarVisible ? "true" : "false");
    toggle.setAttribute("aria-hidden", state.ui.sidebarVisible ? "true" : "false");
    if (state.ui.sidebarVisible) {
      toggle.setAttribute("tabindex", "-1");
    } else {
      toggle.removeAttribute("tabindex");
    }
    toggle.title = state.ui.sidebarVisible
      ? "Close ChronoChat"
      : "Open ChronoChat";

    sidebar.style.setProperty("width", `${state.ui.sidebarWidth}px`, "important");

    if (chatContainer) {
      chatContainer.style.transition = "margin-right 0.18s ease";
      chatContainer.style.marginRight = state.ui.sidebarVisible
        ? `${state.ui.sidebarWidth}px`
        : "0px";
    }
  }

  function refreshMessages() {
    state.conversation.messages = ns.dom.collectMessages();
    ns.features.renderFiltersAndMessages();
  }

  function scheduleRefresh() {
    if (!state.runtime.refreshDebounced) {
      state.runtime.refreshDebounced = ns.utils.createDebouncer(
        refreshMessages,
        ns.config.debounceDelay,
      );
    }
    state.runtime.refreshDebounced();
  }

  function toggleSidebar(forceValue) {
    state.ui.sidebarVisible =
      typeof forceValue === "boolean" ? forceValue : !state.ui.sidebarVisible;
    syncSidebarVisibility();
    if (state.ui.sidebarVisible) {
      refreshMessages();
    } else {
      closeExportMenu();
      ns.features.clearSelection();
    }
  }

  function handleListInteraction(event) {
    const actionTarget = event.target.closest("[data-action='load-older']");
    if (actionTarget) {
      event.preventDefault();
      if (actionTarget.dataset.action === "load-older") {
        state.ui.virtualization.start = Math.max(
          0,
          state.ui.virtualization.start - ns.config.virtualListPageSize,
        );
        ns.features.renderFiltersAndMessages();
        return;
      }
    }

    const item = event.target.closest("li[data-message-index]");
    if (!item) return;
    const messageIndex = Number(item.dataset.messageIndex);
    ns.features.selectMessage(messageIndex);
    if (event.type === "click") {
      ns.features.scrollToMessage(messageIndex);
    }
  }

  function handleListKeydown(event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    const item = event.target.closest("li[data-message-index], li[data-action='load-older']");
    if (!item) return;
    event.preventDefault();
    item.click();
  }

  function handleGlobalKeydown(event) {
    const target = event.target;
    const searchInput = getElement("message-search");
    const isSearchFocused = searchInput && target === searchInput;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "j") {
      event.preventDefault();
      toggleSidebar();
      return;
    }

    if (ns.utils.isTypingTarget(target) && !isSearchFocused) {
      return;
    }

    if (!state.ui.sidebarVisible) return;

    switch (event.key) {
      case "Escape":
        if (isSearchFocused) {
          if (searchInput.value) {
            ns.features.applySearchState({ term: "" });
          } else {
            searchInput.blur();
          }
        } else {
          toggleSidebar(false);
        }
        event.preventDefault();
        break;
      case "/":
        event.preventDefault();
        ns.features.focusSearch();
        break;
      case "j":
      case "J":
        event.preventDefault();
        ns.features.selectRelativeMessage(1);
        break;
      case "k":
      case "K":
        event.preventDefault();
        ns.features.selectRelativeMessage(-1);
        break;
      case "Enter":
        if (state.ui.selectedMessageIndex >= 0) {
          event.preventDefault();
          ns.features.scrollToMessage(state.ui.selectedMessageIndex);
        }
        break;
    }
  }

  function bindUi() {
    const { sidebar, toggle } = ns.ui.ensureUiRoot();
    sidebar.style.setProperty("width", `${state.ui.sidebarWidth}px`, "important");

    addEventListenerWithCleanup(toggle, "click", () => toggleSidebar());
    addEventListenerWithCleanup(getElement("sidebar-close"), "click", () =>
      toggleSidebar(false),
    );
    addEventListenerWithCleanup(getElement("theme-toggle"), "click", () =>
      ns.features.cycleThemePreference(),
    );
    addEventListenerWithCleanup(getElement("export-toggle"), "click", (event) => {
      event.stopPropagation();
      if (state.ui.exportMenuVisible) closeExportMenu();
      else openExportMenu();
    });
    addEventListenerWithCleanup(document, "click", (event) => {
      const menu = getElement("export-menu");
      const toggleButton = getElement("export-toggle");
      if (
        state.ui.exportMenuVisible &&
        menu &&
        !menu.contains(event.target) &&
        !toggleButton.contains(event.target)
      ) {
        closeExportMenu();
      }
    });
    addEventListenerWithCleanup(getElement("export-menu"), "click", (event) => {
      const option = event.target.closest("[data-format]");
      if (!option) return;
      ns.features.exportConversation(option.dataset.format);
      closeExportMenu();
    });
    addEventListenerWithCleanup(getElement("filter-group"), "click", (event) => {
      const button = event.target.closest("[data-filter]");
      if (!button) return;
      ns.features.setFilter(button.dataset.filter);
    });
    addEventListenerWithCleanup(getElement("message-search"), "input", (event) => {
      ns.features.applySearchState({ term: event.target.value });
    });
    addEventListenerWithCleanup(getElement("message-search"), "keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        ns.features.applySearchState({ term: "" });
      }
    });
    addEventListenerWithCleanup(getElement("search-clear"), "click", () => {
      ns.features.applySearchState({ term: "" });
    });
    addEventListenerWithCleanup(getElement("regex-toggle"), "click", () => {
      ns.features.applySearchState({ isRegex: !state.ui.search.isRegex });
    });
    addEventListenerWithCleanup(getElement("case-toggle"), "click", () => {
      ns.features.applySearchState({
        caseSensitive: !state.ui.search.caseSensitive,
      });
    });
    addEventListenerWithCleanup(getElement("pref-compact"), "change", (event) => {
      ns.features.setCompact(event.target.checked);
    });
    addEventListenerWithCleanup(getElement("pref-preview-len"), "change", (event) => {
      ns.features.setPreviewLength(event.target.value);
    });
    addEventListenerWithCleanup(getElement("message-list"), "click", handleListInteraction);
    addEventListenerWithCleanup(getElement("message-list"), "keydown", handleListKeydown);
    addEventListenerWithCleanup(document, "keydown", handleGlobalKeydown);

    const resizeHandle = getElement("sidebar-resize-handle");
    addEventListenerWithCleanup(resizeHandle, "mousedown", (event) => {
      state.runtime.isResizing = true;
      state.runtime.resizeStartX = event.clientX;
      state.runtime.resizeStartWidth = state.ui.sidebarWidth;
      document.body.classList.add("jtch-resizing");
      event.preventDefault();
    });

    const onMouseMove = (event) => {
      if (!state.runtime.isResizing) return;
      const delta = state.runtime.resizeStartX - event.clientX;
      state.ui.sidebarWidth = ns.utils.clamp(
        state.runtime.resizeStartWidth + delta,
        ns.config.sidebarMinWidth,
        ns.config.sidebarMaxWidth,
      );
      sidebar.style.setProperty("width", `${state.ui.sidebarWidth}px`, "important");
      syncSidebarVisibility();
    };

    const onMouseUp = () => {
      if (!state.runtime.isResizing) return;
      state.runtime.isResizing = false;
      document.body.classList.remove("jtch-resizing");
      ns.storage.persistSidebarWidth();
    };

    addEventListenerWithCleanup(document, "mousemove", onMouseMove);
    addEventListenerWithCleanup(document, "mouseup", onMouseUp);
    addEventListenerWithCleanup(root, "mousemove", onMouseMove);
    addEventListenerWithCleanup(root, "mouseup", onMouseUp);
  }

  function startObserver() {
    if (state.runtime.observer) {
      state.runtime.observer.disconnect();
    }

    const chatContainer = ns.dom.getChatContainer();
    if (!chatContainer) {
      root.setTimeout(startObserver, ns.config.observerRetryDelay);
      return;
    }

    state.runtime.observer = new MutationObserver(() => {
      if (state.ui.sidebarVisible) {
        scheduleRefresh();
      }
    });
    state.runtime.observer.observe(chatContainer, {
      childList: true,
      subtree: true,
    });
  }

  function handleRouteChange() {
    const currentUrl = root.location.href;
    if (currentUrl === state.runtime.lastUrl) return;

    state.runtime.lastUrl = currentUrl;
    state.runtime.cachedChatContainer = null;
    state.conversation.id = ns.utils.getConversationId(currentUrl);
    state.ui.search = {
      term: "",
      isRegex: false,
      caseSensitive: false,
      lastError: null,
      matcher: null,
      lastValidMatcher: null,
      matchCount: 0,
    };
    state.ui.selectedMessageIndex = -1;
    state.ui.virtualization.start = 0;
    ns.features.setStatus("", "info");
    startObserver();
    if (state.ui.sidebarVisible) {
      refreshMessages();
    }
  }

  function startRouteWatcher() {
    state.runtime.routeWatcherId = root.setInterval(handleRouteChange, 900);
    registerCleanup(() => {
      if (state.runtime.routeWatcherId) {
        root.clearInterval(state.runtime.routeWatcherId);
        state.runtime.routeWatcherId = null;
      }
    });
  }

  function startThemeWatcher() {
    const observer = new MutationObserver(() => {
      if (state.ui.themePreference === "system-like") {
        ns.features.updateThemeUi();
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    state.runtime.hostThemeObserver = observer;
    registerCleanup(() => observer.disconnect());
  }

  function cleanup() {
    if (state.runtime.refreshDebounced?.cancel) {
      state.runtime.refreshDebounced.cancel();
    }
    if (state.runtime.observer) {
      state.runtime.observer.disconnect();
      state.runtime.observer = null;
    }
    while (state.runtime.cleanupFns.length > 0) {
      const fn = state.runtime.cleanupFns.pop();
      try {
        fn();
      } catch (_) {}
    }
  }

  async function init() {
    if (state.runtime.initialized) return;
    state.runtime.initialized = true;

    await ns.storage.load();
    ns.ui.ensureUiRoot();
    bindUi();
    ns.features.updateThemeUi();
    ns.features.setCompact(state.ui.compact);
    syncSidebarVisibility();
    refreshMessages();
    startObserver();
    startRouteWatcher();
    startThemeWatcher();
    addEventListenerWithCleanup(root, "beforeunload", cleanup);
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        ns.initPromise = init();
      },
      { once: true },
    );
  } else {
    ns.initPromise = init();
  }

  if (
    typeof chrome !== "undefined" &&
    chrome.runtime &&
    chrome.runtime.onMessage &&
    typeof chrome.runtime.onMessage.addListener === "function"
  ) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message?.action === "toggle-sidebar") {
        toggleSidebar();
      }
    });
  }

  if (root.__CHRONOCHAT_TEST__) {
    root.__ChronoChatTestApi = {
      ns,
      init,
      cleanup,
      toggleSidebar,
      refreshMessages,
      handleRouteChange,
      scheduleRefresh,
    };
  }
})(globalThis);
