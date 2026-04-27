(function (root) {
  const ns = root.__JTC__;
  const state = ns.state;

  function getElement(id) {
    return document.getElementById(id);
  }

  function registerCleanup(fn) {
    state.runtime.cleanupFns.push(fn);
  }

  function clearBoundMarkers() {
    document
      .querySelectorAll("[data-jtch-bound]")
      .forEach((element) => {
        delete element.dataset.jtchBound;
      });
  }

    function addEventListenerWithCleanup(target, type, handler, options) {
      if (!target?.addEventListener) return;
      target.addEventListener(type, handler, options);
      registerCleanup(() => target.removeEventListener(type, handler, options));
    }

    function getSidebarWidth() {
      return ns.utils.clamp(
        state.ui.sidebarWidth || ns.config.sidebarWidth,
        ns.config.minSidebarWidth,
        ns.features.getResponsiveMaxSidebarWidth(),
      );
    }

    function captureInlineStyle(element) {
      return {
        element,
        transition: {
          value: element.style.getPropertyValue("transition"),
          priority: element.style.getPropertyPriority("transition"),
        },
        marginLeft: {
          value: element.style.getPropertyValue("margin-left"),
          priority: element.style.getPropertyPriority("margin-left"),
        },
        marginRight: {
          value: element.style.getPropertyValue("margin-right"),
          priority: element.style.getPropertyPriority("margin-right"),
        },
        appliedShift: 0,
        contentLeft: element.getBoundingClientRect?.().left || 0,
      };
    }

    function restoreInlineStyleValue(element, name, snapshot) {
      if (snapshot.value) {
        element.style.setProperty(name, snapshot.value, snapshot.priority);
      } else {
        element.style.removeProperty(name);
      }
    }

    function restoreHostInlineStyles() {
      const snapshot = state.runtime.hostStyleState;
      if (!snapshot?.element?.isConnected) {
        state.runtime.hostStyleState = null;
        return;
      }
      restoreInlineStyleValue(snapshot.element, "transition", snapshot.transition);
      restoreInlineStyleValue(snapshot.element, "margin-left", snapshot.marginLeft);
      restoreInlineStyleValue(snapshot.element, "margin-right", snapshot.marginRight);
      state.runtime.hostStyleState = null;
    }

    function buildShiftedMargin(snapshot, shift) {
      const roundedShift = Math.max(0, Math.round(shift));
      return snapshot.value ? `calc(${snapshot.value} + ${roundedShift}px)` : `${roundedShift}px`;
    }

    function getVisibleElementLeft(element) {
      const rect = element?.getBoundingClientRect?.();
      if (!rect || rect.width <= 0 || rect.height <= 0) return null;
      return rect.left;
    }

    function getMessageContentLeft(messageNode) {
      const selectors = [
        ".markdown",
        ".whitespace-pre-wrap",
        "[role='group']",
        "article",
        "p",
        "pre",
        "table",
        "img",
        "canvas",
      ].join(",");
      const candidates = [
        ...Array.from(messageNode?.querySelectorAll?.(selectors) || []),
        messageNode,
      ];
      const leftValues = candidates
        .map(getVisibleElementLeft)
        .filter((left) => typeof left === "number" && left > 0);
      return leftValues.length ? Math.min(...leftValues) : null;
    }

    function getChatContentLeft(container, fallbackLeft) {
      const messageNodes = state.conversation.messages?.length
        ? state.conversation.messages.map((message) => message.domNode)
        : Array.from(
            container.querySelectorAll?.(
              "div[data-message-author-role], [data-testid*='conversation-turn'], article[data-testid*='conversation-turn']",
            ) || [],
          );
      const leftValues = messageNodes
        .map(getMessageContentLeft)
        .filter((left) => typeof left === "number" && left > 0);
      return leftValues.length ? Math.min(...leftValues) : fallbackLeft;
    }

    function applyHostShiftIfNeeded(leftOffset, sidebarWidth) {
      const container = ns.dom.getChatContainer?.();
      if (!state.ui.sidebarVisible || !container?.isConnected) {
        restoreHostInlineStyles();
        return;
      }

      const rect = container.getBoundingClientRect?.();
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        restoreHostInlineStyles();
        return;
      }

      const currentContentLeft = getChatContentLeft(container, rect.left);
      const defaultWidth = ns.config.sidebarWidth;
      const widthTrigger = Math.max(defaultWidth + 40, currentContentLeft - leftOffset - 24);
      if (sidebarWidth <= widthTrigger) {
        restoreHostInlineStyles();
        return;
      }

      const sidebarRight = leftOffset + sidebarWidth;
      const desiredLeft = sidebarRight + 18;

      if (!state.runtime.hostStyleState?.element?.isConnected) {
        state.runtime.hostStyleState = captureInlineStyle(container);
        state.runtime.hostStyleState.contentLeft = currentContentLeft;
      }

      const snapshot = state.runtime.hostStyleState;
      if (snapshot.element !== container) {
        restoreHostInlineStyles();
        state.runtime.hostStyleState = captureInlineStyle(container);
        state.runtime.hostStyleState.contentLeft = currentContentLeft;
      }

      const activeSnapshot = state.runtime.hostStyleState;
      const contentLeft = activeSnapshot.contentLeft || rect.left;
      const overlap = desiredLeft - contentLeft;
      if (overlap <= 0) {
        restoreHostInlineStyles();
        return;
      }
      const shift = Math.ceil(overlap * 0.5);
      if (activeSnapshot.appliedShift === shift) return;

      activeSnapshot.element.style.setProperty(
        "margin-left",
        buildShiftedMargin(activeSnapshot.marginLeft, shift),
        "important",
      );
      if (!activeSnapshot.transition.value) {
        activeSnapshot.element.style.setProperty(
          "transition",
          "margin-left 0.18s ease",
          "important",
        );
      }
      activeSnapshot.appliedShift = shift;
    }

    function openSidebarNow() {
      state.ui.sidebarVisible = true;
      syncHostUi();
      syncSidebarVisibility();
      refreshMessages();
      ns.features.focusSearch();
    }

  function syncSidebarVisibility() {
    const { sidebar, edgeToggle, toggleSlot } = ns.ui.ensureUiRoot();
    const toggle = document.getElementById("chatgpt-nav-toggle");
    const leftRail = ns.dom.getHostLeftRail?.();
    const leftOffset = leftRail
      ? Math.max(0, Math.round(leftRail.getBoundingClientRect().right))
      : 0;

    bindUiElements();

      const sidebarWidth = getSidebarWidth();
      if (sidebar) {
        sidebar.classList.toggle("open", state.ui.sidebarVisible);
        sidebar.style.setProperty("top", "0px", "important");
        sidebar.style.setProperty("left", `${leftOffset}px`, "important");
        sidebar.style.setProperty("right", "auto", "important");
        sidebar.style.setProperty("bottom", "0px", "important");
        sidebar.style.setProperty("width", `${sidebarWidth}px`, "important");
        sidebar.style.setProperty("height", "100vh", "important");
        sidebar.style.setProperty(
          "--jtch-preview-font-size",
          `${state.ui.previewFontSize}px`,
          "important",
        );
        const resizeHandle = getElement("sidebar-resize-handle");
        if (resizeHandle) {
          resizeHandle.setAttribute("aria-valuemin", String(ns.config.minSidebarWidth));
          resizeHandle.setAttribute("aria-valuemax", String(ns.config.maxSidebarWidth));
          resizeHandle.setAttribute("aria-valuenow", String(sidebarWidth));
        }
      }

      applyHostShiftIfNeeded(leftOffset, sidebarWidth);

    if (toggleSlot) {
      toggleSlot.hidden = state.ui.sidebarVisible;
    }

    if (toggle) {
      toggle.classList.toggle("active", state.ui.sidebarVisible);
      toggle.setAttribute("aria-pressed", state.ui.sidebarVisible ? "true" : "false");
      toggle.title = state.ui.sidebarVisible ? "Close ChronoChat" : "Open ChronoChat";
    }

    if (edgeToggle) {
      edgeToggle.hidden = state.ui.sidebarVisible;
      edgeToggle.setAttribute("aria-hidden", state.ui.sidebarVisible ? "true" : "false");
      edgeToggle.style.setProperty("left", `${Math.max(0, leftOffset)}px`, "important");
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
      ns.features.clearSelection();
      document.getElementById("chatgpt-nav-toggle")?.focus?.();
    }

  function isElementVisiblyAvailable(element) {
    if (!element?.isConnected || element.hidden) return false;
    if (element.getAttribute("aria-hidden") === "true") return false;
    const style = root.getComputedStyle?.(element);
    return style?.display !== "none" && style?.visibility !== "hidden";
  }

  function isAttachmentPreviewSurfaceOpen() {
    const selectors = [
      "[role='dialog']",
      "[aria-modal='true']",
      "[data-testid*='preview']",
      "[data-testid*='Preview']",
      "[data-testid*='viewer']",
      "[data-testid*='Viewer']",
      "[data-testid*='modal']",
      "[data-testid*='Modal']",
      "[aria-label*='preview']",
      "[aria-label*='Preview']",
      "[aria-label*='viewer']",
      "[aria-label*='Viewer']",
      "[aria-label*='visualizzatore']",
      "[aria-label*='Visualizzatore']",
    ].join(",");

    return Array.from(root.document?.querySelectorAll(selectors) || []).some((element) => {
      if (element.closest?.("#chatgpt-nav-sidebar, #chatgpt-nav-toggle-slot")) {
        return false;
      }
      if (
        element.matches?.("a, button, input, select, textarea, [role='button'], [role='combobox']")
      ) {
        return false;
      }
      if (element.closest?.("[data-message-author-role]")) {
        return false;
      }
      return isElementVisiblyAvailable(element);
    });
  }

  function clearPreviewRestoreTimeout() {
    if (!state.runtime.previewRestoreTimeoutId) return;
    root.clearTimeout(state.runtime.previewRestoreTimeoutId);
    state.runtime.previewRestoreTimeoutId = null;
  }

  function resetPreviewRestoreState() {
    clearPreviewRestoreTimeout();
    state.runtime.previewRestorePending = false;
    state.runtime.previewRestoreSeen = false;
  }

  function restoreSidebarAfterPreviewClose() {
    resetPreviewRestoreState();
    if (!state.ui.sidebarVisible) {
      root.setTimeout(() => {
        if (!state.ui.sidebarVisible && root.document?.body) {
          openSidebarNow();
        }
      }, 0);
    }
  }

  function checkAttachmentPreviewRestore() {
    if (!state.runtime.previewRestorePending) return;

    if (isAttachmentPreviewSurfaceOpen()) {
      state.runtime.previewRestoreSeen = true;
      return;
    }

    if (state.runtime.previewRestoreSeen) {
      restoreSidebarAfterPreviewClose();
    }
  }

  function startAttachmentPreviewRestoreWatcher() {
    if (state.runtime.previewRestoreObserver || !root.document?.body) return;
    const observer = new MutationObserver(checkAttachmentPreviewRestore);
    observer.observe(root.document.body, {
      attributes: true,
      attributeFilter: ["aria-hidden", "aria-modal", "class", "hidden", "open", "style"],
      childList: true,
      subtree: true,
    });
    state.runtime.previewRestoreObserver = observer;
    registerCleanup(() => {
      observer.disconnect();
      state.runtime.previewRestoreObserver = null;
    });
  }

  function armPreviewSidebarRestore() {
    startAttachmentPreviewRestoreWatcher();
    clearPreviewRestoreTimeout();
    state.runtime.previewRestorePending = true;
    state.runtime.previewRestoreSeen = isAttachmentPreviewSurfaceOpen();
    root.setTimeout(checkAttachmentPreviewRestore, 0);
    state.runtime.previewRestoreTimeoutId = root.setTimeout(() => {
      if (!state.runtime.previewRestoreSeen) {
        resetPreviewRestoreState();
      }
    }, 2500);
  }

  function closeSidebarForPreview() {
    if (!state.ui.sidebarVisible) return;
    armPreviewSidebarRestore();
    state.ui.sidebarVisible = false;
    syncSidebarVisibility();
    ns.features.clearSelection();
  }

  function handleListInteraction(event) {
    const actionTarget = event.target.closest("[data-action='load-older']");
    if (actionTarget) {
      event.preventDefault();
        state.ui.virtualization.visibleStart = Math.max(
          0,
          (state.ui.virtualization.visibleStart || 0) - ns.config.virtualListPageSize,
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
    if (event.target?.closest?.("#sidebar-resize-handle")) return;
    event.stopPropagation();
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

  function syncHostUi() {
    ns.ui.ensureHostToggleMounted();
    ns.ui.syncHostTogglePosition?.();
    bindUiElements();
    ns.features.updateThemeUi();
  }

  function bindUi() {
    bindUiElements();
    addEventListenerWithCleanup(document, "keydown", handleGlobalKeydown);
    addEventListenerWithCleanup(
      document,
      "jtch:prepare-attachment-preview",
      closeSidebarForPreview,
    );
  }

    function bindUiElements() {
      const { sidebar, toggle, edgeToggle } = ns.ui.ensureUiRoot();
      sidebar.style.setProperty("width", `${getSidebarWidth()}px`, "important");

    if (!toggle.dataset.jtchBound) {
      addEventListenerWithCleanup(toggle, "click", () => toggleSidebar());
      toggle.dataset.jtchBound = "true";
    }

    if (edgeToggle && !edgeToggle.dataset.jtchBound) {
      addEventListenerWithCleanup(edgeToggle, "click", () => toggleSidebar(true));
      edgeToggle.dataset.jtchBound = "true";
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

      const exportGroup = getElement("export-group");
      if (exportGroup && !exportGroup.dataset.jtchBound) {
        addEventListenerWithCleanup(exportGroup, "click", (event) => {
          const button = event.target.closest("[data-export-format]");
          if (!button) return;
          event.preventDefault();
          ns.features.downloadExport(button.dataset.exportFormat);
        });
        exportGroup.dataset.jtchBound = "true";
      }

      document.querySelectorAll("[data-search-option]").forEach((button) => {
        if (button.dataset.jtchBound) return;
        addEventListenerWithCleanup(button, "click", (event) => {
          event.preventDefault();
          const option = button.dataset.searchOption;
          ns.features.applySearchState({
            [option]: !state.ui.search[option],
          });
        });
        button.dataset.jtchBound = "true";
      });

      const previewControls = getElement("preview-controls");
      if (previewControls && !previewControls.dataset.jtchBound) {
        addEventListenerWithCleanup(previewControls, "click", (event) => {
          const button = event.target.closest("[data-preview-size-action]");
          if (!button) return;
          event.preventDefault();
          const action = button.dataset.previewSizeAction;
          const current = state.ui.previewFontSize || ns.config.previewFontSize;
          const next =
            action === "increase"
              ? current + 1
              : action === "decrease"
                ? current - 1
                : ns.config.previewFontSize;
          ns.features.setPreviewFontSize(next);
          syncSidebarVisibility();
        });
        previewControls.dataset.jtchBound = "true";
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

      const messageList = getElement("message-list");
    if (messageList && !messageList.dataset.jtchBound) {
      addEventListenerWithCleanup(messageList, "click", handleListInteraction);
      addEventListenerWithCleanup(messageList, "keydown", handleListKeydown);
        messageList.dataset.jtchBound = "true";
      }

      const attachmentList = getElement("attachment-list");
      if (attachmentList && !attachmentList.dataset.jtchBound) {
        addEventListenerWithCleanup(attachmentList, "click", handleAttachmentInteraction);
        addEventListenerWithCleanup(attachmentList, "keydown", handleAttachmentKeydown);
        attachmentList.dataset.jtchBound = "true";
      }

      const resizeHandle = getElement("sidebar-resize-handle");
      if (resizeHandle && !resizeHandle.dataset.jtchBound) {
        addEventListenerWithCleanup(resizeHandle, "pointerdown", handleResizeDragStart);
        addEventListenerWithCleanup(resizeHandle, "mousedown", handleResizeDragStart);
        addEventListenerWithCleanup(resizeHandle, "touchstart", handleResizeDragStart);
        addEventListenerWithCleanup(resizeHandle, "keydown", handleResizeKeydown);
        resizeHandle.dataset.jtchBound = "true";
      }
    }

    function handleResizeKeydown(event) {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "Home") {
        ns.features.setSidebarWidth(ns.config.minSidebarWidth);
      } else if (event.key === "End") {
        ns.features.setSidebarWidth(ns.config.maxSidebarWidth);
      } else {
        ns.features.setSidebarWidth(
          state.ui.sidebarWidth + (event.key === "ArrowRight" ? 16 : -16),
        );
      }
      syncSidebarVisibility();
    }

    function handleAttachmentInteraction(event) {
      const button = event.target.closest("[data-attachment-action]");
      if (!button) return;
      event.preventDefault();
      const { attachmentAction, attachmentId } = button.dataset;
      if (attachmentAction === "open") {
        ns.features.openAttachment(attachmentId);
      } else if (attachmentAction === "download") {
        ns.features.downloadAttachment(attachmentId);
      }
    }

    function handleAttachmentKeydown(event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      const button = event.target.closest("[data-attachment-action]");
      if (!button) return;
      event.preventDefault();
      button.click();
    }

    function getResizeClientX(event) {
      const touch = event.touches?.[0] || event.changedTouches?.[0];
      return touch ? touch.clientX : event.clientX;
    }

    function handleResizeDragStart(event) {
      if (event.type === "mousedown" && event.button !== 0) return;
      if (state.runtime.resizingSidebar) return;
      event.preventDefault();
      event.stopPropagation();
      const sidebar = getElement("chatgpt-nav-sidebar");
      const startLeft = sidebar?.getBoundingClientRect?.().left || 0;
      const isTouch = event.type === "touchstart";
      const isMouse = event.type === "mousedown";
      const moveEventName = isTouch ? "touchmove" : isMouse ? "mousemove" : "pointermove";
      const upEventName = isTouch ? "touchend" : isMouse ? "mouseup" : "pointerup";
      const cancelEventName = isTouch ? "touchcancel" : isMouse ? "mouseleave" : "pointercancel";
      const onMove = (moveEvent) => {
        moveEvent.preventDefault?.();
        const clientX = getResizeClientX(moveEvent);
        if (typeof clientX !== "number") return;
        ns.features.setSidebarWidth(clientX - startLeft);
        syncSidebarVisibility();
      };
      const onUp = () => {
        state.runtime.resizingSidebar = false;
        root.removeEventListener(moveEventName, onMove);
        root.removeEventListener(upEventName, onUp);
        root.removeEventListener(cancelEventName, onUp);
      };
      state.runtime.resizingSidebar = true;
      if (!isMouse && !isTouch) {
        event.currentTarget?.setPointerCapture?.(event.pointerId);
      }
      root.addEventListener(moveEventName, onMove, { passive: false });
      root.addEventListener(upEventName, onUp);
      root.addEventListener(cancelEventName, onUp);
    }

  function startObserver() {
    if (state.runtime.observer) {
      state.runtime.observer.disconnect();
    }

      const chatContainer = ns.dom.getChatContainer();
      if (!chatContainer) {
        if (state.runtime.observerRetryId) {
          root.clearTimeout(state.runtime.observerRetryId);
        }
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
      resetPreviewRestoreState();
      state.ui.search = {
        ...state.ui.search,
        term: "",
        matchCount: 0,
        error: "",
      };
      state.ui.selectedMessageIndex = -1;
      state.ui.virtualization.visibleStart = null;
    startObserver();
    syncHostUi();
    if (state.ui.sidebarVisible) {
      refreshMessages();
    }
  }

    function startRouteWatcher() {
      const history = root.history;
      if (history?.pushState && history?.replaceState) {
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;
        state.runtime.originalHistoryMethods = {
          pushState: originalPushState,
          replaceState: originalReplaceState,
        };
        const wrap = (original) =>
          function (...args) {
            const result = original.apply(this, args);
            root.setTimeout(handleRouteChange, 0);
            return result;
          };
        history.pushState = wrap(originalPushState);
        history.replaceState = wrap(originalReplaceState);
        addEventListenerWithCleanup(root, "popstate", handleRouteChange);
      }
      state.runtime.routeWatcherFallbackId = root.setInterval(handleRouteChange, 2500);
      registerCleanup(() => {
        if (state.runtime.routeWatcherFallbackId) {
          root.clearInterval(state.runtime.routeWatcherFallbackId);
          state.runtime.routeWatcherFallbackId = null;
        }
        if (state.runtime.originalHistoryMethods && root.history) {
          root.history.pushState = state.runtime.originalHistoryMethods.pushState;
          root.history.replaceState = state.runtime.originalHistoryMethods.replaceState;
          state.runtime.originalHistoryMethods = null;
        }
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
      if (state.runtime.savePrefsDebounced?.cancel) {
        state.runtime.savePrefsDebounced.cancel();
      }
      if (state.runtime.observerRetryId) {
        root.clearTimeout(state.runtime.observerRetryId);
        state.runtime.observerRetryId = null;
      }
      if (state.runtime.observer) {
        state.runtime.observer.disconnect();
        state.runtime.observer = null;
      }
      if (state.runtime.previewRestoreObserver) {
        state.runtime.previewRestoreObserver.disconnect();
        state.runtime.previewRestoreObserver = null;
      }
      resetPreviewRestoreState();
      restoreHostInlineStyles();
    while (state.runtime.cleanupFns.length > 0) {
      const fn = state.runtime.cleanupFns.pop();
      try {
        fn();
      } catch (_) {}
    }
      clearBoundMarkers();
      state.runtime.initialized = false;
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
    addEventListenerWithCleanup(root, "pagehide", (event) => {
      if (!event.persisted) {
        cleanup();
      }
    });
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
