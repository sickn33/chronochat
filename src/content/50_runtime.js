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
    if (!target?.addEventListener) return;
    target.addEventListener(type, handler, options);
    registerCleanup(() => target.removeEventListener(type, handler, options));
  }

  function openSidebarNow() {
    state.ui.sidebarVisible = true;
    syncHostUi();
    syncSidebarVisibility();
    refreshMessages();
  }

  function syncSidebarVisibility() {
    const { sidebar, toggleSlot } = ns.ui.ensureUiRoot();
    const toggle = document.getElementById("chatgpt-nav-toggle");
    const chatContainer = ns.dom.getChatContainer();
    const leftRail = ns.dom.getHostLeftRail?.();
    const leftOffset = leftRail
      ? Math.max(0, Math.round(leftRail.getBoundingClientRect().right))
      : 0;

    bindUiElements();

    if (sidebar) {
      sidebar.classList.toggle("open", state.ui.sidebarVisible);
      sidebar.style.setProperty("top", "0px", "important");
      sidebar.style.setProperty("left", `${leftOffset}px`, "important");
      sidebar.style.setProperty("right", "auto", "important");
      sidebar.style.setProperty("bottom", "0px", "important");
      sidebar.style.setProperty("width", `${ns.config.sidebarWidth}px`, "important");
      sidebar.style.setProperty("height", "100vh", "important");
    }

    if (toggleSlot) {
      toggleSlot.hidden = state.ui.sidebarVisible;
    }

    if (toggle) {
      toggle.classList.toggle("active", state.ui.sidebarVisible);
      toggle.setAttribute("aria-pressed", state.ui.sidebarVisible ? "true" : "false");
      toggle.title = state.ui.sidebarVisible ? "Close ChronoChat" : "Open ChronoChat";
    }

    if (chatContainer) {
      chatContainer.style.transition = "margin-left 0.18s ease";
      chatContainer.style.marginLeft = state.ui.sidebarVisible
        ? `${ns.config.sidebarWidth}px`
        : "0px";
      chatContainer.style.marginRight = "0px";
    }

    if (!state.ui.sidebarVisible) {
      ns.features.closeExportMenu?.();
    } else {
      ns.features.updateExportMenuUi?.();
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
    const nextValue =
      typeof forceValue === "boolean" ? forceValue : !state.ui.sidebarVisible;

    if (nextValue) {
      openSidebarNow();
      return;
    }

    state.ui.sidebarVisible = false;
    syncSidebarVisibility();
    ns.features.closeExportMenu?.();
    ns.features.clearSelection();
  }

  function handleListInteraction(event) {
    const actionTarget = event.target.closest("[data-action='load-older']");
    if (actionTarget) {
      event.preventDefault();
      const currentStart = Number.isInteger(state.ui.virtualization.start)
        ? state.ui.virtualization.start
        : 0;
      state.ui.virtualization.start = Math.max(
        0,
        currentStart - ns.config.virtualListPageSize,
      );
      ns.features.renderFiltersAndMessages();
      return;
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

  function stopSidebarEventPropagation(event) {
    event.stopPropagation();
  }

  function handleDocumentClick(event) {
    if (!state.ui.exportMenuOpen) return;
    const target = event.target;
    if (target?.closest?.("#chatgpt-nav-sidebar, #export-menu, #export-toggle")) return;
    ns.features.closeExportMenu?.();
  }

  function handleExportAction(event) {
    const button = event.target.closest("[data-export-format]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    ns.features.exportConversation(button.dataset.exportFormat);
    ns.features.closeExportMenu?.();
  }

  function handleGlobalKeydown(event) {
    const target = event.target;
    const searchInput = getElement("message-search");
    const exportMenu = getElement("export-menu");
    const exportToggle = getElement("export-toggle");
    const isExportMenuFocused = Boolean(exportMenu?.contains(target));
    const isExportToggleFocused = target === exportToggle;
    const isSearchFocused = searchInput && target === searchInput;

    if (state.ui.exportMenuOpen) {
      if (event.key === "Escape") {
        event.preventDefault();
        ns.features.closeExportMenu({ restoreFocus: true });
      }
      if (isExportMenuFocused || isExportToggleFocused) {
        return;
      }
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "j") {
      event.preventDefault();
      toggleSidebar();
      return;
    }

    if (isSearchFocused) {
      if (event.key === "Escape") {
        if (searchInput.value) {
          ns.features.applySearchState({ term: "" });
        } else {
          searchInput.blur();
        }
        event.preventDefault();
      }
      return;
    }

    if (ns.utils.isTypingTarget(target)) {
      return;
    }

    if (!state.ui.sidebarVisible) return;

    switch (event.key) {
      case "Escape":
        toggleSidebar(false);
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

  function syncHostUi() {
    ns.ui.ensureHostToggleMounted();
    ns.ui.syncHostTogglePosition?.();
    bindUiElements();
    ns.features.updateThemeUi();
  }

  function bindUi() {
    bindUiElements();
    addEventListenerWithCleanup(document, "keydown", handleGlobalKeydown);
    if (!state.runtime.documentClickBound) {
      addEventListenerWithCleanup(document, "click", handleDocumentClick);
      state.runtime.documentClickBound = true;
    }
  }

  function bindUiElements() {
    const { sidebar, toggle } = ns.ui.ensureUiRoot();
    sidebar.style.setProperty("width", `${ns.config.sidebarWidth}px`, "important");

    if (!toggle.dataset.jtchBound) {
      addEventListenerWithCleanup(toggle, "click", () => toggleSidebar());
      toggle.dataset.jtchBound = "true";
    }

    if (!sidebar.dataset.jtchBound) {
      addEventListenerWithCleanup(sidebar, "pointerdown", stopSidebarEventPropagation, true);
      addEventListenerWithCleanup(sidebar, "mousedown", stopSidebarEventPropagation, true);
      sidebar.dataset.jtchBound = "true";
    }

    const closeButton = getElement("sidebar-close");
    if (closeButton && !closeButton.dataset.jtchBound) {
      addEventListenerWithCleanup(closeButton, "click", (event) => {
        event.preventDefault();
        toggleSidebar(false);
      });
      closeButton.dataset.jtchBound = "true";
    }

    const filterGroup = getElement("filter-group");
    if (filterGroup && !filterGroup.dataset.jtchBound) {
      addEventListenerWithCleanup(filterGroup, "click", (event) => {
        const button = event.target.closest("[data-filter]");
        if (!button) return;
        event.preventDefault();
        ns.features.setFilter(button.dataset.filter);
      });
      filterGroup.dataset.jtchBound = "true";
    }

    const searchInput = getElement("message-search");
    if (searchInput && !searchInput.dataset.jtchBound) {
      addEventListenerWithCleanup(searchInput, "input", (event) => {
        ns.features.applySearchState({ term: event.target.value });
      });
      addEventListenerWithCleanup(searchInput, "keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          ns.features.applySearchState({ term: "" });
        }
      });
      searchInput.dataset.jtchBound = "true";
    }

    const exportToggle = getElement("export-toggle");
    if (exportToggle && !exportToggle.dataset.jtchBound) {
      addEventListenerWithCleanup(exportToggle, "click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        ns.features.toggleExportMenu();
      });
      exportToggle.dataset.jtchBound = "true";
    }

    const exportMenu = getElement("export-menu");
    if (exportMenu && !exportMenu.dataset.jtchBound) {
      addEventListenerWithCleanup(exportMenu, "click", handleExportAction);
      addEventListenerWithCleanup(exportMenu, "keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          ns.features.closeExportMenu({ restoreFocus: true });
        }
      });
      exportMenu.dataset.jtchBound = "true";
    }

    const messageList = getElement("message-list");
    if (messageList && !messageList.dataset.jtchBound) {
      addEventListenerWithCleanup(messageList, "click", handleListInteraction);
      addEventListenerWithCleanup(messageList, "keydown", handleListKeydown);
      messageList.dataset.jtchBound = "true";
    }
  }

  function startObserver() {
    if (state.runtime.observer) {
      state.runtime.observer.disconnect();
    }
    if (state.runtime.observerRetryId) {
      root.clearTimeout(state.runtime.observerRetryId);
      state.runtime.observerRetryId = null;
    }

    const chatContainer = ns.dom.getChatContainer();
    if (!chatContainer) {
      state.runtime.observerRetryId = root.setTimeout(() => {
        state.runtime.observerRetryId = null;
        startObserver();
      }, ns.config.observerRetryDelay);
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
      matchCount: 0,
    };
    state.ui.selectedMessageIndex = -1;
    state.ui.exportMenuOpen = false;
    state.ui.virtualization.start = null;
    startObserver();
    syncHostUi();
    if (state.ui.sidebarVisible) {
      refreshMessages();
    }
  }

  function startRouteWatcher() {
    const notifyRouteChange = ns.utils.createDebouncer(handleRouteChange, 120);
    const history = root.history;

    if (history && typeof history.pushState === "function") {
      const originalPushState = history.pushState;
      try {
        history.pushState = function (...args) {
          const result = originalPushState.apply(this, args);
          notifyRouteChange();
          return result;
        };
        registerCleanup(() => {
          history.pushState = originalPushState;
        });
      } catch (_) {}
    }

    if (history && typeof history.replaceState === "function") {
      const originalReplaceState = history.replaceState;
      try {
        history.replaceState = function (...args) {
          const result = originalReplaceState.apply(this, args);
          notifyRouteChange();
          return result;
        };
        registerCleanup(() => {
          history.replaceState = originalReplaceState;
        });
      } catch (_) {}
    }

    addEventListenerWithCleanup(root, "popstate", notifyRouteChange);
    addEventListenerWithCleanup(root, "hashchange", notifyRouteChange);

    // Lightweight fallback for host navigation patterns that bypass history APIs.
    state.runtime.routeWatcherId = root.setInterval(handleRouteChange, 3500);
    registerCleanup(() => {
      if (state.runtime.routeWatcherId) {
        root.clearInterval(state.runtime.routeWatcherId);
        state.runtime.routeWatcherId = null;
      }
      notifyRouteChange.cancel?.();
    });
  }

  function startThemeWatcher() {
    const observer = new MutationObserver(() => {
      ns.features.updateThemeUi();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    state.runtime.hostThemeObserver = observer;
    registerCleanup(() => observer.disconnect());
  }

  function startHostUiWatcher() {
    if (state.runtime.hostUiObserver) {
      state.runtime.hostUiObserver.disconnect();
    }

    const sync = ns.utils.createDebouncer(syncHostUi, ns.config.hostUiSyncDelay);
    state.runtime.hostUiSync = sync;

    const observer = new MutationObserver(() => {
      sync();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
    state.runtime.hostUiObserver = observer;

    registerCleanup(() => {
      observer.disconnect();
      sync.cancel?.();
      state.runtime.hostUiObserver = null;
      state.runtime.hostUiSync = null;
    });
  }

  function cleanup() {
    if (state.runtime.refreshDebounced?.cancel) {
      state.runtime.refreshDebounced.cancel();
    }
    if (state.runtime.observer) {
      state.runtime.observer.disconnect();
      state.runtime.observer = null;
    }
    if (state.runtime.observerRetryId) {
      root.clearTimeout(state.runtime.observerRetryId);
      state.runtime.observerRetryId = null;
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
    syncSidebarVisibility();
    refreshMessages();
    startObserver();
    startRouteWatcher();
    startThemeWatcher();
    startHostUiWatcher();
    syncHostUi();
    addEventListenerWithCleanup(root, "beforeunload", cleanup);
    addEventListenerWithCleanup(root, "resize", () => {
      syncHostUi();
      syncSidebarVisibility();
    });
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
      syncHostUi,
    };
  }
})(globalThis);
