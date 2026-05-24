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
      const triggerContentLeft =
        state.runtime.hostStyleState?.element === container
          ? state.runtime.hostStyleState.contentLeft || currentContentLeft
          : currentContentLeft;
      const widthTrigger = Math.max(defaultWidth + 40, triggerContentLeft - leftOffset - 8);
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
    scheduleDomHydration({ preferBackend: true, silent: true });
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

  function resetBackendMessageCache() {
    state.runtime.backendConversationId = null;
    state.runtime.backendMessages = null;
    state.runtime.backendFetchInFlight = null;
  }

  function resetDomMessageCache() {
    state.runtime.domMessageCache = [];
  }

  function reindexMessages(messages) {
    return messages.map((message, index) => ({
      ...message,
      index,
    }));
  }

  function hasResponseActions(node) {
    return Boolean(
      node?.querySelector?.('[aria-label="Response actions"], [aria-label*="response actions" i]'),
    );
  }

  function hasThoughtControl(node) {
    return Array.from(
      node?.querySelectorAll?.("button, summary, [role='button']") || [],
    ).some((element) => /thought for|thinking/i.test(ns.dom.collapseText?.(element.textContent || "")));
  }

  function isThoughtControl(element) {
    return /thought for|thinking/i.test(ns.dom.collapseText?.(element?.textContent || ""));
  }

  function isNodeAfter(left, right) {
    if (!left || !right || left === right) return false;
    return Boolean(left.compareDocumentPosition?.(right) & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  function hasThoughtControlBetween(previousNode, currentNode) {
    if (!previousNode?.isConnected || !currentNode?.isConnected) return false;
    if (!isNodeAfter(previousNode, currentNode)) return false;
    const rootNode = previousNode.ownerDocument?.body || document.body;
    return Array.from(
      rootNode.querySelectorAll?.("button, summary, [role='button']") || [],
    ).some(
      (element) =>
        isThoughtControl(element) &&
        isNodeAfter(previousNode, element) &&
        isNodeAfter(element, currentNode),
    );
  }

  function isLikelyAssistantPreface(message) {
    const text = ns.dom.collapseText?.(message?.fullText || message?.preview || "") || "";
    if (text.length < 12 || text.length > 420) return false;
    return /(\bverific|controll|corregg|ti rispondo|rispondo sul|procedo|do un'occhiata|I['’]ll|I will|I['’]m going|let me|checking|I can take a look)/i.test(
      text,
    );
  }

  function shouldMergeAssistantThoughtFragment(previous, current) {
    return Boolean(
      previous?.role === "assistant" &&
        current?.role === "assistant" &&
        previous.domNode?.isConnected &&
        current.domNode?.isConnected &&
        !hasResponseActions(previous.domNode) &&
        (hasThoughtControl(current.domNode) ||
          hasThoughtControlBetween(previous.domNode, current.domNode)) &&
        isLikelyAssistantPreface(previous),
    );
  }

  function mergeAssistantThoughtFragments(messages) {
    return messages.reduce((merged, message) => {
      const previous = merged[merged.length - 1];
      if (shouldMergeAssistantThoughtFragment(previous, message)) {
        const fullText = [previous.fullText || previous.preview, message.fullText || message.preview]
          .filter(Boolean)
          .join("\n\n");
        merged[merged.length - 1] = {
          ...previous,
          preview: ns.dom.collapseText?.(fullText) || fullText,
          fullText,
          attachments: [...(previous.attachments || []), ...(message.attachments || [])],
        };
        return merged;
      }
      merged.push(message);
      return merged;
    }, []);
  }

  function getMessageCacheKey(message) {
    const text = ns.dom.collapseText?.(message?.fullText || message?.preview || "");
    return `${message?.role || "unknown"}\n${text}`;
  }

  function cloneCachedMessage(message) {
    if (!message) return message;
    return {
      ...message,
      domNode: message.domNode?.isConnected ? message.domNode : null,
    };
  }

  function findCachedMessageIndex(messages, key, usedIndices) {
    for (let index = 0; index < messages.length; index += 1) {
      if (usedIndices?.has(index)) continue;
      if (getMessageCacheKey(messages[index]) === key) {
        return index;
      }
    }
    return -1;
  }

  function shiftUsedIndicesAfterInsert(usedIndices, insertIndex) {
    const shifted = new Set();
    usedIndices.forEach((index) => {
      shifted.add(index >= insertIndex ? index + 1 : index);
    });
    return shifted;
  }

  function mergeDomMessages(domMessages) {
    const incoming = mergeAssistantThoughtFragments(
      Array.isArray(domMessages) ? domMessages : [],
    );
    const cached = Array.isArray(state.runtime.domMessageCache)
      ? mergeAssistantThoughtFragments(state.runtime.domMessageCache.map(cloneCachedMessage))
      : [];
    if (!incoming.length) {
      state.runtime.domMessageCache = reindexMessages(cached);
      return cached;
    }
    if (!cached.length) {
      state.runtime.domMessageCache = reindexMessages(
        mergeAssistantThoughtFragments(incoming.map(cloneCachedMessage)),
      );
      return state.runtime.domMessageCache;
    }

    const result = [];
    const seenInitialKeys = new Set();
    cached.forEach((message) => {
      const key = getMessageCacheKey(message);
      if (seenInitialKeys.has(key)) return;
      seenInitialKeys.add(key);
      result.push(message);
    });

    let anchorIndex = -1;
    let pending = [];
    let usedIndices = new Set();

    const insertPending = (nextAnchorIndex = -1) => {
      if (!pending.length) return nextAnchorIndex;
      let insertIndex =
        anchorIndex >= 0
          ? anchorIndex + 1
          : nextAnchorIndex >= 0
            ? nextAnchorIndex
            : result.length;
      const insertedCount = pending.length;
      const originalInsertIndex = insertIndex;
      pending.forEach((message) => {
        result.splice(insertIndex, 0, cloneCachedMessage(message));
        usedIndices = shiftUsedIndicesAfterInsert(usedIndices, insertIndex);
        if (anchorIndex >= insertIndex) anchorIndex += 1;
        insertIndex += 1;
      });
      pending = [];
      anchorIndex = insertIndex - 1;
      if (nextAnchorIndex >= 0 && originalInsertIndex <= nextAnchorIndex) {
        return nextAnchorIndex + insertedCount;
      }
      return nextAnchorIndex;
    };

    incoming.forEach((message) => {
      const key = getMessageCacheKey(message);
      const existingIndex = findCachedMessageIndex(result, key, usedIndices);
      if (existingIndex >= 0) {
        const adjustedExistingIndex = insertPending(existingIndex);
        result[adjustedExistingIndex] = {
          ...result[adjustedExistingIndex],
          ...cloneCachedMessage(message),
        };
        usedIndices.add(adjustedExistingIndex);
        anchorIndex = adjustedExistingIndex;
        return;
      }

      if (!pending.some((pendingMessage) => getMessageCacheKey(pendingMessage) === key)) {
        pending.push(message);
      }
    });

    insertPending();

    state.runtime.domMessageCache = reindexMessages(
      mergeAssistantThoughtFragments(result.map(cloneCachedMessage)),
    );
    return state.runtime.domMessageCache;
  }

  function chooseBestMessages(domMessages) {
    const backendMessages = state.runtime.backendMessages;
    if (Array.isArray(backendMessages) && backendMessages.length > domMessages.length) {
      return reindexMessages(backendMessages);
    }
    if (Array.isArray(backendMessages) && backendMessages.length) {
      const backendByKey = new Map(
        backendMessages.map((message) => [getMessageCacheKey(message), message]),
      );
      return reindexMessages(
        domMessages.map((message) => {
          const backendMessage = backendByKey.get(getMessageCacheKey(message));
          if (!backendMessage?.attachments?.length) return message;
          return {
            ...message,
            attachments: [
              ...(message.attachments || []),
              ...backendMessage.attachments,
            ],
          };
        }),
      );
    }
    return reindexMessages(domMessages);
  }

  function applyMessageSnapshot(domMessages) {
    state.conversation.messages = chooseBestMessages(domMessages);
    if (typeof ns.dom.collectConversationAttachments === "function") {
      state.conversation.attachments = ns.dom.collectConversationAttachments(
        state.conversation.messages,
        ns.dom.getChatContainer?.() || document,
      );
    }
    ns.features.renderFiltersAndMessages();
  }

  function refreshMessages() {
    const domMessages = ns.dom.collectMessages();
    const mergedDomMessages = mergeDomMessages(domMessages);
    applyMessageSnapshot(mergedDomMessages);
    scheduleBackendMessageRefresh(mergedDomMessages);
  }

  function getAuditTextKey(value) {
    return String(ns.dom.collapseText?.(value || "") || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function getAuditMessageKey(message) {
    return `${message?.role || "unknown"}\n${getAuditTextKey(message?.fullText || message?.preview || "")}`;
  }

  function countAuditKeys(keys) {
    return keys.reduce((counts, key) => {
      if (!key.trim()) return counts;
      counts.set(key, (counts.get(key) || 0) + 1);
      return counts;
    }, new Map());
  }

  function findAuditMissingKeys(sourceKeys, targetKeys) {
    const targetCounts = countAuditKeys(targetKeys);
    const missing = [];
    sourceKeys.forEach((key) => {
      const remaining = targetCounts.get(key) || 0;
      if (remaining > 0) {
        targetCounts.set(key, remaining - 1);
      } else {
        missing.push(key);
      }
    });
    return missing;
  }

  function findAuditDuplicateKeys(keys) {
    return Array.from(countAuditKeys(keys).entries())
      .filter(([, count]) => count > 1)
      .map(([key, count]) => ({ key, count }));
  }

  function getDomTurnMarkers() {
    return Array.from(
      document.querySelectorAll("h1, h2, h3, h4, h5, h6, [role='heading']"),
    )
      .map((element) => {
        const label = ns.dom.collapseText?.(element.textContent || "") || "";
        if (/^you said:?$/i.test(label)) return { role: "user", label };
        if (/^chatgpt said:?$/i.test(label)) return { role: "assistant", label };
        return null;
      })
      .filter(Boolean);
  }

  function debugMessageAudit() {
    const domMarkers = getDomTurnMarkers();
    const collectedMessages = ns.dom.collectMessages();
    const stateMessages = state.conversation.messages || [];
    const sidebarItems = Array.from(
      document.querySelectorAll("#message-list li[data-message-index]"),
    );
    const sidebarIndexes = new Set(
      sidebarItems
        .map((item) => Number(item.dataset.messageIndex))
        .filter((index) => Number.isFinite(index)),
    );
    const collectedKeys = collectedMessages.map(getAuditMessageKey);
    const stateKeys = stateMessages.map(getAuditMessageKey);

    return {
      conversationId: state.conversation.id,
      domMarkerCount: domMarkers.length,
      domMarkerRoles: domMarkers.map((marker) => marker.role),
      collectedCount: collectedMessages.length,
      stateCount: stateMessages.length,
      sidebarRenderedCount: sidebarItems.length,
      missingFromState: findAuditMissingKeys(collectedKeys, stateKeys),
      missingSidebarIndexes: stateMessages
        .map((message) => message.index)
        .filter((index) => !sidebarIndexes.has(index)),
      duplicateCollectedKeys: findAuditDuplicateKeys(collectedKeys),
      duplicateStateKeys: findAuditDuplicateKeys(stateKeys),
      messages: stateMessages.map((message) => ({
        index: message.index,
        role: message.role,
        preview: message.preview,
        source: message.source || "dom",
        hasDomNode: Boolean(message.domNode?.isConnected),
      })),
    };
  }

  function getScrollElement() {
    const candidates = [
      document.scrollingElement,
      document.documentElement,
      document.body,
      ns.dom.getChatContainer?.(),
      ...Array.from(
        document.querySelectorAll(
          [
            "main",
            "[role='main']",
            "[data-testid*='conversation']",
            "[class*='overflow-y-auto']",
            "[class*='overflow-auto']",
            "[class*='scroll']",
          ].join(", "),
        ),
      ),
    ].filter(Boolean);

    let best = candidates[0] || document.documentElement || document.body;
    let bestScrollable = Math.max(
      0,
      (best?.scrollHeight || 0) - (best?.clientHeight || root.innerHeight || 0),
    );

    candidates.forEach((element) => {
      if (!element?.isConnected && element !== document.documentElement && element !== document.body) {
        return;
      }
      const style = root.getComputedStyle?.(element);
      const canScrollByStyle = /auto|scroll|overlay/i.test(
        `${style?.overflowY || ""} ${style?.overflow || ""}`,
      );
      const scrollable = Math.max(
        0,
        (element.scrollHeight || 0) - (element.clientHeight || root.innerHeight || 0),
      );
      if (scrollable > bestScrollable && (canScrollByStyle || element === document.scrollingElement)) {
        best = element;
        bestScrollable = scrollable;
      }
    });

    return best;
  }

  function getScrollTop(scroller) {
    if (scroller === document.body || scroller === document.documentElement) {
      return root.scrollY || scroller.scrollTop || 0;
    }
    return scroller?.scrollTop || 0;
  }

  function setScrollTop(scroller, top) {
    if (!scroller) return;
    if (scroller === document.body || scroller === document.documentElement) {
      if (!root.__CHRONOCHAT_TEST__) {
        try {
          root.scrollTo?.({ top, behavior: "auto" });
        } catch (_) {}
      }
      scroller.scrollTop = top;
      return;
    }
    try {
      scroller.scrollTo?.({ top, behavior: "auto" });
    } catch (_) {
      scroller.scrollTop = top;
    }
    scroller.scrollTop = top;
  }

  function delay(ms) {
    return new Promise((resolve) => root.setTimeout(resolve, ms));
  }

  function collectAndRenderHydrationWindow() {
    const mergedDomMessages = mergeDomMessages(ns.dom.collectMessages());
    applyMessageSnapshot(mergedDomMessages);
    return mergedDomMessages.length;
  }

  function getBestScrollElementFromDocument(frameDocument, frameWindow) {
    const candidates = [
      frameDocument.querySelector?.("main"),
      frameDocument.querySelector?.("#thread"),
      frameDocument.scrollingElement,
      frameDocument.documentElement,
      frameDocument.body,
    ].filter(Boolean);

    return candidates.reduce((best, element) => {
      const bestScrollable = Math.max(
        0,
        (best?.scrollHeight || 0) - (best?.clientHeight || frameWindow.innerHeight || 0),
      );
      const scrollable = Math.max(
        0,
        (element.scrollHeight || 0) - (element.clientHeight || frameWindow.innerHeight || 0),
      );
      return scrollable > bestScrollable ? element : best;
    }, candidates[0] || frameDocument.scrollingElement || frameDocument.body);
  }

  async function waitForFrameLoad(frame) {
    await new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      frame.addEventListener("load", finish, { once: true });
      root.setTimeout(finish, 8000);
    });
    await delay(1200);
  }

  async function hydrateOffscreenConversationFrame() {
    if (root.__CHRONOCHAT_TEST__ || typeof ns.dom.collectMessagesFromDocument !== "function") {
      return [];
    }

    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.src = root.location?.href || "";
    frame.style.cssText = [
      "position:fixed",
      "left:-200vw",
      "top:0",
      "width:1280px",
      "height:900px",
      "border:0",
      "opacity:0",
      "pointer-events:none",
      "z-index:-1",
    ].join(";");

    document.body.appendChild(frame);
    try {
      await waitForFrameLoad(frame);
      const frameWindow = frame.contentWindow;
      const frameDocument = frame.contentDocument || frameWindow?.document;
      if (!frameWindow || !frameDocument) return [];

      let collected = mergeDomMessages(ns.dom.collectMessagesFromDocument(frameDocument));
      const scroller = getBestScrollElementFromDocument(frameDocument, frameWindow);
      const viewportHeight = scroller?.clientHeight || frameWindow.innerHeight || 800;
      const step = Math.max(360, Math.floor(viewportHeight * 0.75));
      let position = 0;
      let guard = 0;

      while (guard < 60) {
        const maxTop = Math.max(0, (scroller?.scrollHeight || 0) - viewportHeight);
        if (!scroller || position >= maxTop) break;
        position = Math.min(maxTop, position + step);
        try {
          scroller.scrollTo?.({ top: position, behavior: "auto" });
        } catch (_) {
          scroller.scrollTop = position;
        }
        scroller.scrollTop = position;
        await delay(160);
        collected = mergeDomMessages([
          ...collected,
          ...ns.dom.collectMessagesFromDocument(frameDocument),
        ]);
        guard += 1;
      }

      return collected;
    } catch (_) {
      return [];
    } finally {
      frame.remove();
    }
  }

  async function hydrateVirtualizedDomMessages(options = {}) {
    if (state.runtime.domHydrationInFlight || !state.ui.sidebarVisible) {
      return state.runtime.domHydrationPromise || Promise.resolve();
    }

    state.runtime.domHydrationInFlight = true;
    state.runtime.domHydrationPromise = (async () => {
      try {
        if (options.preferBackend) {
          const conversationId = ns.dom.getBackendConversationId?.();
          const backendMessages = await ensureBackendMessages(conversationId);
          if (!state.ui.sidebarVisible) return;
          if (
            backendMessages.length >= state.conversation.messages.length &&
            backendMessages.length > 0
          ) {
            applyMessageSnapshot(backendMessages);
            state.runtime.domHydratedConversationId = state.conversation.id;
            return;
          }
        }

        const scroller = getScrollElement();
        if (!scroller) return;

        const originalTop = getScrollTop(scroller);
        const viewportHeight = scroller.clientHeight || root.innerHeight || 800;
        const step = Math.max(360, Math.floor(viewportHeight * 0.75));

        if (Math.max(0, (scroller.scrollHeight || 0) - viewportHeight) <= 0) {
          collectAndRenderHydrationWindow();
          return;
        }

        try {
          setScrollTop(scroller, 0);
          await delay(140);
          collectAndRenderHydrationWindow();

          let position = 0;
          let guard = 0;
          while (guard < 60 && state.ui.sidebarVisible) {
            const maxTop = Math.max(0, (scroller.scrollHeight || 0) - viewportHeight);
            if (position >= maxTop) break;
            position = Math.min(maxTop, position + step);
            setScrollTop(scroller, position);
            await delay(140);
            collectAndRenderHydrationWindow();
            guard += 1;
          }

          setScrollTop(scroller, Math.max(0, (scroller.scrollHeight || 0) - viewportHeight));
          await delay(140);
          collectAndRenderHydrationWindow();
        } finally {
          setScrollTop(scroller, originalTop);
          await delay(80);
        }
      } finally {
        state.runtime.domHydratedConversationId = state.conversation.id;
        state.runtime.domHydrationInFlight = false;
        state.runtime.domHydrationPromise = null;
        refreshMessages();
        const pendingJumpIndex = state.runtime.pendingMessageJumpIndex;
        state.runtime.pendingMessageJumpIndex = null;
        if (
          state.ui.sidebarVisible &&
          Number.isInteger(pendingJumpIndex) &&
          pendingJumpIndex >= 0
        ) {
          root.setTimeout(() => {
            ns.features.scrollToMessage(pendingJumpIndex);
          }, 120);
        }
      }
    })();
    return state.runtime.domHydrationPromise;
  }

  function scheduleDomHydration(options = {}) {
    if (state.runtime.domHydratedConversationId === state.conversation.id) return;
    if (state.runtime.domHydrationTimeoutId) {
      root.clearTimeout(state.runtime.domHydrationTimeoutId);
    }
    state.runtime.domHydrationTimeoutId = root.setTimeout(() => {
      state.runtime.domHydrationTimeoutId = null;
      if (state.runtime.domHydratedConversationId === state.conversation.id) return;
      hydrateVirtualizedDomMessages(options);
    }, 250);
  }

  function scheduleBackendMessageRefresh(domMessages) {
    const conversationId = ns.dom.getBackendConversationId?.();
    if (!conversationId || typeof ns.dom.fetchBackendMessages !== "function") {
      resetBackendMessageCache();
      return;
    }

    if (state.runtime.backendConversationId !== conversationId) {
      resetBackendMessageCache();
      state.runtime.backendConversationId = conversationId;
    }

    if (
      Array.isArray(state.runtime.backendMessages) ||
      state.runtime.backendFetchInFlight
    ) {
      return;
    }

    const request = ns.dom
      .fetchBackendMessages(conversationId)
      .then((messages) => {
        if (state.runtime.backendConversationId !== conversationId) return;
        state.runtime.backendMessages = Array.isArray(messages) ? messages : [];
        state.runtime.backendFetchInFlight = null;
        if (state.runtime.backendMessages.length > domMessages.length) {
          state.conversation.messages = reindexMessages(state.runtime.backendMessages);
          ns.features.renderFiltersAndMessages();
        }
      })
      .catch(() => {
        if (state.runtime.backendConversationId === conversationId) {
          state.runtime.backendMessages = [];
          state.runtime.backendFetchInFlight = null;
        }
      });
    state.runtime.backendFetchInFlight = request;
  }

  async function ensureBackendMessages(conversationId) {
    if (!conversationId || typeof ns.dom.fetchBackendMessages !== "function") {
      return [];
    }

    if (state.runtime.backendConversationId !== conversationId) {
      resetBackendMessageCache();
      state.runtime.backendConversationId = conversationId;
    }

    if (state.runtime.backendFetchInFlight) {
      await state.runtime.backendFetchInFlight;
      return state.runtime.backendMessages || [];
    }

    if (Array.isArray(state.runtime.backendMessages)) {
      return state.runtime.backendMessages;
    }

    try {
      state.runtime.backendFetchInFlight = ns.dom.fetchBackendMessages(conversationId);
      const messages = await state.runtime.backendFetchInFlight;
      if (state.runtime.backendConversationId === conversationId) {
        state.runtime.backendMessages = Array.isArray(messages) ? messages : [];
      }
    } catch (_) {
      if (state.runtime.backendConversationId === conversationId) {
        state.runtime.backendMessages = [];
      }
    } finally {
      if (state.runtime.backendConversationId === conversationId) {
        state.runtime.backendFetchInFlight = null;
      }
    }

    return state.runtime.backendMessages || [];
  }

  async function ensureCompleteMessageSnapshot() {
    const domMessages = mergeDomMessages(ns.dom.collectMessages());
    applyMessageSnapshot(domMessages);

    const conversationId = ns.dom.getBackendConversationId?.();
    const backendMessages = await ensureBackendMessages(conversationId);
    if (backendMessages.length >= state.conversation.messages.length) {
      applyMessageSnapshot(mergeDomMessages(ns.dom.collectMessages()));
      return state.conversation.messages;
    }

    await hydrateVirtualizedDomMessages();
    refreshMessages();
    return state.conversation.messages;
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
    if (state.runtime.hostUiReady) {
      ns.ui.ensureHostToggleMounted();
      ns.ui.syncHostTogglePosition?.();
    }
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
          exportGroup.removeAttribute("open");
        });
        exportGroup.dataset.jtchBound = "true";
      }

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
    resetBackendMessageCache();
    resetDomMessageCache();
    state.runtime.domHydratedConversationId = null;
    state.runtime.pendingMessageJumpIndex = null;
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
      if (!state.runtime.hostUiReady) return;
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
      if (state.runtime.domHydrationTimeoutId) {
        root.clearTimeout(state.runtime.domHydrationTimeoutId);
        state.runtime.domHydrationTimeoutId = null;
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
      state.runtime.hostUiReady = false;
      state.runtime.pendingMessageJumpIndex = null;
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
    root.setTimeout(() => {
      state.runtime.hostUiReady = true;
      syncHostUi();
    }, root.__CHRONOCHAT_TEST__ ? 0 : 2500);
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
      ensureCompleteMessageSnapshot,
      handleRouteChange,
      scheduleRefresh,
      syncHostUi,
      debugMessageAudit,
    };
  }

  ns.debugMessageAudit = debugMessageAudit;

  ns.runtime = {
    ...(ns.runtime || {}),
    ensureCompleteMessageSnapshot,
    debugMessageAudit,
  };
})(globalThis);
