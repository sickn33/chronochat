// Generated file. Source: src/content/*.js
(function (root) {
  const existing = root.__JTC__;
  if (existing && existing.bootstrapped) {
    return;
  }

  const ns = existing || {};
  root.__JTC__ = ns;
  ns.bootstrapped = true;

  const DEBUG = false;
  const logPrefix = "ChronoChat:";
  const noop = () => {};

  function logger(method) {
    if (!DEBUG && method === "debug") {
      return noop;
    }
    return (...args) => {
      const fn = console[method] || console.log;
      fn.call(console, logPrefix, ...args);
    };
  }

  ns.log = {
    debug: logger("debug"),
    info: logger("info"),
    warn: logger("warn"),
    error: logger("error"),
  };

  ns.config = {
    sidebarWidth: 336,
    debounceDelay: 220,
    observerRetryDelay: 1500,
    highlightDuration: 900,
    badgeFadeDuration: 1800,
    virtualListThreshold: 80,
    virtualListPageSize: 60,
    maxPreviewLength: 160,
    hostUiSyncDelay: 80,
    hostUiOpenDelay: root.__CHRONOCHAT_TEST__ ? 0 : 160,
  };

  ns.constants = {
    storage: {},
    filters: ["all", "user", "assistant"],
    primaryMessageSelectors: [
      "div[data-message-author-role]",
      "[data-testid*='conversation-turn']",
      ".group\\/conversation-turn",
      "article[data-testid*='conversation-turn']",
    ],
    fallbackMessageSelectors: [
      "[class*='message']",
      "div[class*='group'][class*='w-full']",
    ],
    chatContainerSelectors: [
      "main",
      "[role='main']",
      ".conversation-content",
      "div[class*='--thread-content-margin'][class*='px-(--thread-content-margin)']",
      "div.flex-1[class*='max-w-(--thread-content-max-width)']",
    ],
    hostActionBarSelectors: [
      '[data-testid="conversation-actions"]',
      "[data-testid*='conversation'][data-testid*='actions']",
      "header [class*='actions']",
      "header [class*='toolbar']",
      "header [class*='controls']",
    ],
    hostSidePanelSelectors: [
      '[data-testid="activity-panel"]',
      "[data-testid*='activity'][data-testid*='panel']",
      "[data-panel='activity']",
    ],
    supportedHosts: ["chat.openai.com", "chatgpt.com"],
  };

  ns.utils = {
    clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    },
    escapeRegExp(value) {
      return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    },
    createDebouncer(fn, delay) {
      let timeoutId = null;
      const debounced = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
          timeoutId = null;
          fn();
        }, delay);
      };
      debounced.cancel = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };
      return debounced;
    },
    isTypingTarget(target) {
      if (!target) return false;
      return (
        target.matches?.("input, textarea, select") || target.isContentEditable
      );
    },
    isSupportedChatUrl(url) {
      try {
        const parsed = new URL(url, root.location?.origin || "https://chatgpt.com");
        return ns.constants.supportedHosts.includes(parsed.hostname);
      } catch (_) {
        return false;
      }
    },
    getConversationId(url) {
      try {
        const parsed = new URL(url, root.location?.origin || "https://chatgpt.com");
        const path = parsed.pathname || "/";
        const match = path.match(/\/c\/([^/]+)/);
        if (match) return `chat:${match[1]}`;
        if (path === "/" || path === "/?model=text-davinci-002-render-sha") {
          return "chat:root";
        }
        return `path:${path}${parsed.search || ""}`;
      } catch (_) {
        return "chat:unknown";
      }
    },
    createFilenameTimestamp() {
      return new Date()
        .toISOString()
        .replace(/:/g, "-")
        .replace(/\..+/, "")
        .replace("T", "_");
    },
  };

  ns.state = {
    ui: {
      sidebarVisible: false,
      currentFilter: "all",
      selectedMessageIndex: -1,
      search: {
        term: "",
        matchCount: 0,
      },
      virtualization: {
        start: 0,
      },
    },
    conversation: {
      id: ns.utils.getConversationId(root.location?.href || "https://chatgpt.com/"),
      messages: [],
      visibleIndices: [],
    },
    runtime: {
      initialized: false,
      observer: null,
      routeWatcherId: null,
      cachedChatContainer: null,
      lastUrl: root.location?.href || "",
      cleanupFns: [],
      refreshDebounced: null,
      hostThemeObserver: null,
      hostUiObserver: null,
      hostUiSync: null,
      hostPanelOpen: false,
    },
  };
})(globalThis);

(function (root) {
  const ns = root.__JTC__;

  function getChromeStorageArea() {
    if (
      typeof chrome !== "undefined" &&
      chrome.storage &&
      chrome.storage.local &&
      typeof chrome.storage.local.get === "function"
    ) {
      return chrome.storage.local;
    }
    return null;
  }

  ns.storage = {
    async load() {
      return undefined;
    },
    getChromeStorageArea,
  };
})(globalThis);

(function (root) {
  const ns = root.__JTC__;
  const state = ns.state;
  const {
    primaryMessageSelectors,
    fallbackMessageSelectors,
    chatContainerSelectors,
    hostActionBarSelectors,
    hostSidePanelSelectors,
  } = ns.constants;

  function safeQuerySelector(selectors, context = document) {
    const selectorArray = Array.isArray(selectors) ? selectors : [selectors];
    for (const selector of selectorArray) {
      try {
        const element = context.querySelector(selector);
        if (element) return element;
      } catch (_) {}
    }
    return null;
  }

  function safeQuerySelectorAll(selectors, context = document) {
    if (!Array.isArray(selectors)) {
      try {
        return Array.from(context.querySelectorAll(selectors));
      } catch (_) {
        return [];
      }
    }

    const seen = new Set();
    const collected = [];
    for (const selector of selectors) {
      try {
        const elements = Array.from(context.querySelectorAll(selector));
        elements.forEach((element) => {
          if (seen.has(element)) return;
          seen.add(element);
          collected.push(element);
        });
      } catch (_) {}
    }
    return collected;
  }

  function hasPrimaryTurnRelationship(element, primaryNodes) {
    return primaryNodes.some((primaryNode) => {
      return (
        primaryNode === element ||
        primaryNode.contains(element) ||
        element.contains(primaryNode)
      );
    });
  }

  function isVisibleElement(element) {
    if (!element || !element.isConnected) return false;
    if (element.getAttribute?.("aria-hidden") === "true") return false;
    const style = root.getComputedStyle?.(element);
    if (!style) return true;
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function collapseText(value) {
    return String(value || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function hasMeaningfulText(element) {
    return collapseText(element?.textContent || "").length >= 8;
  }

  function isChronoChatNode(element) {
    if (!element) return false;
    if (
      element.id === "chatgpt-nav-sidebar" ||
      element.id === "chatgpt-nav-toggle" ||
      element.id === "chatgpt-nav-toggle-slot"
    ) {
      return true;
    }
    return Boolean(
      element.closest?.(
        "#chatgpt-nav-sidebar, #chatgpt-nav-toggle, #chatgpt-nav-toggle-slot",
      ),
    );
  }

  function isInteractiveElement(element) {
    return Boolean(
      element?.matches?.("button, [role='button'], a, summary"),
    );
  }

  function getElementLabel(element) {
    if (!element) return "";
    return collapseText(
      element.getAttribute?.("aria-label") ||
        element.getAttribute?.("title") ||
        element.textContent ||
        "",
    );
  }

  function getInteractiveElements(context) {
    return safeQuerySelectorAll("button, [role='button'], a, summary", context).filter(
      (element) => isVisibleElement(element) && !isChronoChatNode(element),
    );
  }

  function filterRootMessageCandidates(nodes) {
    const candidates = nodes.filter(
      (node) =>
        isVisibleElement(node) &&
        hasMeaningfulText(node) &&
        !isChronoChatNode(node),
    );

    return candidates.filter((node) => {
      return !candidates.some(
        (other) => other !== node && other.contains(node),
      );
    });
  }

  function getChatContainer() {
    if (state.runtime.cachedChatContainer?.isConnected) {
      return state.runtime.cachedChatContainer;
    }
    const container = safeQuerySelector(chatContainerSelectors, document);
    state.runtime.cachedChatContainer = container;
    return container;
  }

  function detectHostTheme() {
    try {
      if (
        document.documentElement.classList.contains("dark") ||
        document.body.classList.contains("dark")
      ) {
        return "dark";
      }

      const background = root.getComputedStyle(document.body).backgroundColor;
      if (!background) return "dark";
      const match = background.match(/\d+/g);
      if (!match || match.length < 3) return "dark";
      const [r, g, b] = match.map(Number);
      const luminance = (r * 299 + g * 587 + b * 114) / 1000;
      return luminance < 140 ? "dark" : "light";
    } catch (_) {
      return "dark";
    }
  }

  function normalizeRoleValue(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (["assistant", "ai", "bot", "model"].includes(normalized)) {
      return "assistant";
    }
    if (["user", "you", "utente", "human"].includes(normalized)) {
      return "user";
    }
    return "unknown";
  }

  function detectRoleHint(value) {
    const normalized = String(value || "").toLowerCase();
    if (!normalized) return "unknown";
    if (
      /\b(assistant|chatgpt|ai|bot|model)\b/.test(normalized) ||
      normalized.includes("assistant-message")
    ) {
      return "assistant";
    }
    if (
      /\b(user|you|utente|human)\b/.test(normalized) ||
      normalized.includes("user-message")
    ) {
      return "user";
    }
    return "unknown";
  }

  function inferRole(node, index) {
    if (!node) return index % 2 === 0 ? "user" : "assistant";

    const directRole = normalizeRoleValue(
      node.dataset?.messageAuthorRole ||
        node.getAttribute?.("data-message-author-role"),
    );
    if (directRole !== "unknown") return directRole;

    const nestedRoleNode = node.querySelector?.("[data-message-author-role]");
    if (nestedRoleNode) {
      const nestedRole = normalizeRoleValue(
        nestedRoleNode.dataset?.messageAuthorRole ||
          nestedRoleNode.getAttribute?.("data-message-author-role"),
      );
      if (nestedRole !== "unknown") return nestedRole;
    }

    const hints = [
      node.getAttribute?.("data-testid"),
      node.getAttribute?.("aria-label"),
      node.className,
    ]
      .filter(Boolean)
      .join(" ");
    const directHint = detectRoleHint(hints);
    if (directHint !== "unknown") return directHint;

    const nestedHintNode = node.querySelector?.(
      '[data-testid*="user"],[data-testid*="assistant"],[class*="user"],[class*="assistant"],[aria-label*="user" i],[aria-label*="assistant" i]',
    );
    if (nestedHintNode) {
      const nestedHint = detectRoleHint(
        [
          nestedHintNode.getAttribute?.("data-testid"),
          nestedHintNode.getAttribute?.("aria-label"),
          nestedHintNode.className,
        ]
          .filter(Boolean)
          .join(" "),
      );
      if (nestedHint !== "unknown") return nestedHint;
    }

    return index % 2 === 0 ? "user" : "assistant";
  }

  function isLikelyUiArtifact(node) {
    if (!node) return false;
    return Boolean(
      node.querySelector?.(
        'form, textarea, [contenteditable="true"], [contenteditable="plaintext-only"], [data-testid*="composer"], [class*="composer"], [placeholder]',
      ),
    );
  }

  function extractMessageContent(node) {
    if (isLikelyUiArtifact(node)) {
      return null;
    }

    const textSelectors = [
      "div.whitespace-pre-wrap",
      "div.prose",
      ".markdown",
      "[data-message-content]",
    ];

    let contentNode = safeQuerySelector(textSelectors, node);
    if (!contentNode) {
      const divs = Array.from(node.querySelectorAll("div"));
      contentNode =
        divs.find((element) => collapseText(element.textContent).length > 12) || node;
    }

    const clone = contentNode.cloneNode(true);
    clone
      .querySelectorAll(
        'button, [class*="icon"], form, textarea, .flex.absolute, .sr-only, nav, header, footer',
      )
      .forEach((element) => element.remove());

    const codeNode = clone.querySelector("pre code, code, pre");
    const codeText = collapseText(codeNode?.textContent || "");
    const text = collapseText(clone.textContent || clone.innerText || "");

    if (text) {
      if (codeText && text === codeText) {
        return {
          fullText: `Code: ${codeText}`,
          previewText: `Code: ${codeText}`,
        };
      }

      return {
        fullText: text,
        previewText: text,
      };
    }

    if (node.querySelector('img, [class*="image"]')) {
      return {
        fullText: "Assistant generated an image",
        previewText: "Assistant generated an image",
      };
    }

    return null;
  }

  function getConversationActionBar() {
    const explicit = safeQuerySelector(hostActionBarSelectors, document);
    if (explicit && isVisibleElement(explicit)) {
      return explicit;
    }

    const markers = getInteractiveElements(document).filter((element) => {
      const label = getElementLabel(element);
      return /share|activity/i.test(label);
    });

    const candidates = [];
    const seen = new Set();

    markers.forEach((marker) => {
      let current = marker.parentElement;
      let depth = 0;
      while (current && current !== document.body && depth < 6) {
        if (!seen.has(current) && isVisibleElement(current)) {
          const interactiveCount = getInteractiveElements(current).length;
          if (interactiveCount >= 2 && interactiveCount <= 8) {
            seen.add(current);
            candidates.push({ node: current, interactiveCount, depth });
          }
        }
        current = current.parentElement;
        depth += 1;
      }
    });

    candidates.sort((left, right) => {
      if (left.depth !== right.depth) {
        return left.depth - right.depth;
      }
      return left.interactiveCount - right.interactiveCount;
    });

    return candidates[0]?.node || null;
  }

  function getConversationActionReference(actionBar) {
    const elements = getInteractiveElements(actionBar);
    return (
      elements.find((element) => /share/i.test(getElementLabel(element))) ||
      elements.find((element) => /activity/i.test(getElementLabel(element))) ||
      elements[elements.length - 1] ||
      null
    );
  }

  function getHostLeftRail() {
    const viewportHeight =
      root.innerHeight || document.documentElement.clientHeight || 720;

    const candidates = safeQuerySelectorAll(["aside", "nav", "div"], document).filter(
      (element) => {
        if (!isVisibleElement(element) || isChronoChatNode(element)) {
          return false;
        }
        const rect = element.getBoundingClientRect?.();
        if (!rect || rect.width < 56 || rect.width > 220) {
          return false;
        }
        if (rect.height < viewportHeight * 0.5) {
          return false;
        }
        return rect.left <= 12 && rect.right > rect.left;
      },
    );

    candidates.sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return rightRect.width * rightRect.height - leftRect.width * leftRect.height;
    });

    return candidates[0] || null;
  }

  function getHostActivityToggle(actionBar = getConversationActionBar()) {
    if (!actionBar) return null;
    return (
      getInteractiveElements(actionBar).find((element) =>
        /activity/i.test(getElementLabel(element)),
      ) || null
    );
  }

  function isLikelyHostSidePanelFrame(element, viewportWidth) {
    if (!isVisibleElement(element) || isChronoChatNode(element)) {
      return false;
    }
    const rect = element.getBoundingClientRect?.();
    if (!rect || rect.width < 180 || rect.height < 160) {
      return false;
    }
    const occupiesRightRail =
      rect.right >= viewportWidth - 12 &&
      (rect.left >= viewportWidth * 0.45 || rect.width >= viewportWidth * 0.55);
    if (!occupiesRightRail) {
      return false;
    }
    const text = collapseText(element.textContent || "");
    return /activity|sources|thinking/i.test(text);
  }

  function resolveHostSidePanelFrame(panel, viewportWidth) {
    let resolved = panel;
    let current = panel?.parentElement || null;

    while (current && current !== document.body) {
      if (isLikelyHostSidePanelFrame(current, viewportWidth)) {
        const currentRect = current.getBoundingClientRect();
        const resolvedRect = resolved.getBoundingClientRect?.();
        const currentArea = currentRect.width * currentRect.height;
        const resolvedArea = resolvedRect
          ? resolvedRect.width * resolvedRect.height
          : 0;
        const currentHasCloseControl = Boolean(
          getInteractiveElements(current).find(isCloseControl),
        );
        const resolvedHasCloseControl = Boolean(
          getInteractiveElements(resolved).find(isCloseControl),
        );
        if (
          (currentHasCloseControl && !resolvedHasCloseControl) ||
          currentArea >= resolvedArea
        ) {
          resolved = current;
        }
      }
      current = current.parentElement;
    }

    return resolved;
  }

  function isCloseControl(element) {
    const label = getElementLabel(element);
    return /(^[x×]$|close|dismiss|chiudi)/i.test(label);
  }

  function getHostSidePanel() {
    const viewportWidth =
      root.innerWidth || document.documentElement.clientWidth || 1280;
    const explicit = safeQuerySelector(hostSidePanelSelectors, document);
    if (explicit && isVisibleElement(explicit) && !isChronoChatNode(explicit)) {
      return resolveHostSidePanelFrame(explicit, viewportWidth);
    }

    const candidates = safeQuerySelectorAll(
      ["aside", "[role='dialog']", "section", "div"],
      document,
    ).filter((element) => {
      return isLikelyHostSidePanelFrame(element, viewportWidth);
    });

    candidates.sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return rightRect.width * rightRect.height - leftRect.width * leftRect.height;
    });

    return resolveHostSidePanelFrame(candidates[0] || null, viewportWidth);
  }

  function getHostSidePanelCloseButton(panel) {
    return getInteractiveElements(panel).find(isCloseControl) || null;
  }

  function getHostLeftRailWidth() {
    const viewportHeight =
      root.innerHeight || document.documentElement.clientHeight || 720;

    const candidates = safeQuerySelectorAll(
      ["aside", "nav", "[role='navigation']", "div"],
      document,
    ).filter((element) => {
      if (!isVisibleElement(element) || isChronoChatNode(element)) {
        return false;
      }

      const rect = element.getBoundingClientRect?.();
      if (!rect || rect.width < 48 || rect.width > 240 || rect.height < viewportHeight * 0.45) {
        return false;
      }

      if (rect.left > 16 || rect.right > 260) {
        return false;
      }

      return true;
    });

    return candidates.reduce((maxRight, element) => {
      const rect = element.getBoundingClientRect?.();
      return rect ? Math.max(maxRight, Math.round(rect.right)) : maxRight;
    }, 0);
  }

  function collectMessages() {
    const container = getChatContainer();
    const primaryNodes = safeQuerySelectorAll(
      primaryMessageSelectors,
      container || document,
    );
    const resolvedPrimaryNodes =
      primaryNodes.length <= 1
        ? safeQuerySelectorAll(primaryMessageSelectors, document)
        : primaryNodes;

    const fallbackNodes = safeQuerySelectorAll(
      fallbackMessageSelectors,
      container || document,
    );
    const resolvedFallbackNodes =
      primaryNodes.length === 0 && fallbackNodes.length <= 1
        ? safeQuerySelectorAll(fallbackMessageSelectors, document)
        : fallbackNodes;

    const primarySet = Array.from(new Set(resolvedPrimaryNodes));
    const fallbackSet = Array.from(new Set(resolvedFallbackNodes)).filter(
      (node) =>
        primarySet.length === 0 || !hasPrimaryTurnRelationship(node, primarySet),
    );

    let nodes = [...primarySet, ...fallbackSet];
    nodes = filterRootMessageCandidates(nodes);

    return nodes.reduce((messages, node, index) => {
      const content = extractMessageContent(node);
      if (!content) {
        return messages;
      }

      messages.push({
        index: messages.length,
        role: inferRole(node, index),
        preview: content.previewText,
        fullText: content.fullText,
        domNode: node,
      });
      return messages;
    }, []);
  }

  ns.dom = {
    safeQuerySelector,
    safeQuerySelectorAll,
    getChatContainer,
    detectHostTheme,
    normalizeRoleValue,
    detectRoleHint,
    inferRole,
    collectMessages,
    collapseText,
    filterRootMessageCandidates,
    isLikelyUiArtifact,
    getConversationActionBar,
    getConversationActionReference,
    getHostLeftRail,
    getHostActivityToggle,
    getHostSidePanel,
    getHostSidePanelCloseButton,
    getHostLeftRailWidth,
    getElementLabel,
    getInteractiveElements,
    isChronoChatNode,
  };
})(globalThis);

(function (root) {
  const ns = root.__JTC__;
  let hostToggleButton = null;
  let hostToggleSlot = null;

  function createButton({
    id,
    className,
    text,
    label,
    title,
    dataset,
    type = "button",
  }) {
    const button = document.createElement("button");
    if (id) button.id = id;
    if (className) button.className = className;
    button.type = type;
    button.textContent = text;
    if (label) button.setAttribute("aria-label", label);
    if (title) button.title = title;
    if (dataset) {
      Object.entries(dataset).forEach(([key, value]) => {
        button.dataset[key] = value;
      });
    }
    return button;
  }

  function createSidebar() {
    const sidebar = document.createElement("aside");
    sidebar.id = "chatgpt-nav-sidebar";
    sidebar.className = "jtch-sidebar";
    sidebar.setAttribute("aria-label", "ChronoChat navigation");

    const header = document.createElement("div");
    header.className = "jtch-header";

    const titleRow = document.createElement("div");
    titleRow.className = "jtch-title-row";

    const title = document.createElement("div");
    title.className = "jtch-title";
    title.textContent = "Conversation map";

    const titleMeta = document.createElement("div");
    titleMeta.className = "jtch-title-meta";

    const count = document.createElement("span");
    count.id = "message-count";
    count.className = "jtch-count";
    count.setAttribute("aria-live", "polite");
    count.textContent = "0";

    const closeButton = createButton({
      id: "sidebar-close",
      className: "jtch-icon-button jtch-sidebar-close",
      text: "×",
      label: "Close sidebar",
      title: "Close sidebar",
    });

    titleMeta.appendChild(count);
    titleMeta.appendChild(closeButton);
    titleRow.appendChild(title);
    titleRow.appendChild(titleMeta);

    const filterGroup = document.createElement("div");
    filterGroup.className = "jtch-filter-group";
    filterGroup.id = "filter-group";
    [
      { label: "All", value: "all" },
      { label: "You", value: "user" },
      { label: "AI", value: "assistant" },
    ].forEach((filter, index) => {
      filterGroup.appendChild(
        createButton({
          className: index === 0 ? "jtch-filter active" : "jtch-filter",
          text: filter.label,
          label: `Filter ${filter.label}`,
          dataset: { filter: filter.value },
        }),
      );
    });

    const searchRow = document.createElement("div");
    searchRow.className = "jtch-search-row";

    const searchInput = document.createElement("input");
    searchInput.id = "message-search";
    searchInput.className = "jtch-search-input";
    searchInput.type = "text";
    searchInput.placeholder = "Search messages";
    searchInput.setAttribute("aria-label", "Search messages");

    searchRow.appendChild(searchInput);

    const searchMeta = document.createElement("div");
    searchMeta.id = "search-meta";
    searchMeta.className = "jtch-search-meta";

    header.appendChild(titleRow);
    header.appendChild(filterGroup);
    header.appendChild(searchRow);
    header.appendChild(searchMeta);

    const messageSection = document.createElement("div");
    messageSection.className = "jtch-section jtch-message-section";

    const messageList = document.createElement("ul");
    messageList.id = "message-list";
    messageList.className = "jtch-list";
    messageList.setAttribute("aria-label", "Conversation messages");

    messageSection.appendChild(messageList);

    sidebar.appendChild(header);
    sidebar.appendChild(messageSection);
    return sidebar;
  }

  function getOrCreateHostToggleButton() {
    const existing = document.getElementById("chatgpt-nav-toggle");
    if (existing) {
      hostToggleButton = existing;
      return hostToggleButton;
    }

    if (!hostToggleButton) {
      hostToggleButton = createButton({
        id: "chatgpt-nav-toggle",
        className: "jtch-host-toggle",
        text: "Jump",
        label: "Open ChronoChat",
        title: "Open ChronoChat",
      });
    }

    return hostToggleButton;
  }

  function getOrCreateHostToggleSlot() {
    const existing = document.getElementById("chatgpt-nav-toggle-slot");
    if (existing) {
      hostToggleSlot = existing;
      return hostToggleSlot;
    }

    if (!hostToggleSlot) {
      hostToggleSlot = document.createElement("div");
      hostToggleSlot.id = "chatgpt-nav-toggle-slot";
      hostToggleSlot.className = "jtch-host-toggle-slot";
    }

    return hostToggleSlot;
  }

  function syncHostTogglePosition() {
    const slot = getOrCreateHostToggleSlot();
    const actionBar = ns.dom.getConversationActionBar();
    const reference = actionBar
      ? ns.dom.getConversationActionReference(actionBar)
      : null;

    if (!actionBar || !reference) {
      slot.hidden = true;
      slot.remove();
      return { mounted: false, slot };
    }

    if (!slot.contains(getOrCreateHostToggleButton())) {
      slot.appendChild(getOrCreateHostToggleButton());
    }

    if (slot.parentElement !== actionBar || slot.nextElementSibling !== reference) {
      actionBar.insertBefore(slot, reference);
    }

    slot.hidden = Boolean(ns.state?.ui?.sidebarVisible);
    return { mounted: true, slot };
  }

  function ensureHostToggleMounted() {
    const toggle = getOrCreateHostToggleButton();
    const slot = getOrCreateHostToggleSlot();
    if (!slot.contains(toggle)) {
      slot.appendChild(toggle);
    }

    const { mounted } = syncHostTogglePosition();

    return { toggle, slot, mounted };
  }

  function ensureUiRoot() {
    let sidebar = document.getElementById("chatgpt-nav-sidebar");

    if (!sidebar) {
      sidebar = createSidebar();
      document.body.appendChild(sidebar);
    }

    const { toggle, slot, mounted } = ensureHostToggleMounted();
    return { sidebar, toggle, toggleSlot: slot, toggleMounted: mounted };
  }

  ns.ui = {
    ensureUiRoot,
    ensureHostToggleMounted,
    syncHostTogglePosition,
  };
})(globalThis);

(function (root) {
  const ns = root.__JTC__;
  const state = ns.state;
  const { clamp, createFilenameTimestamp } = ns.utils;

  function getElement(id) {
    return document.getElementById(id);
  }

  function getMessageList() {
    return getElement("message-list");
  }

  function setStatus() {}

  function updateThemeUi() {
    const effectiveTheme = ns.dom.detectHostTheme();
    const sidebar = getElement("chatgpt-nav-sidebar");
    const floatingToggle = getElement("chatgpt-nav-toggle");

    [sidebar, floatingToggle].forEach((element) => {
      if (!element) return;
      element.classList.remove("theme-dark", "theme-light");
      element.classList.add(
        effectiveTheme === "dark" ? "theme-dark" : "theme-light",
      );
    });
  }

  function applySearchState(partialState) {
    const searchState = {
      ...state.ui.search,
      ...partialState,
    };
    searchState.term = String(searchState.term || "");
    state.ui.search = searchState;
    state.ui.virtualization.start = 0;
    renderFiltersAndMessages();
  }

  function doesMessageMatch(message) {
    const term = state.ui.search.term;
    if (!term) return true;

    const haystack = `${message.fullText} ${message.preview}`.toLowerCase();
    return haystack.includes(term.toLowerCase());
  }

  function computeVisibleIndices() {
    const indices = [];
    state.conversation.messages.forEach((message) => {
      const filterMatches =
        state.ui.currentFilter === "all" ||
        state.ui.currentFilter === message.role;
      if (filterMatches && doesMessageMatch(message)) {
        indices.push(message.index);
      }
    });
    state.conversation.visibleIndices = indices;
    state.ui.search.matchCount = indices.length;
    return indices;
  }

  function getVirtualWindow(indices) {
    if (indices.length <= ns.config.virtualListThreshold) {
      return {
        windowIndices: indices,
        canLoadOlder: false,
      };
    }

    const pageSize = ns.config.virtualListPageSize;
    const maxStart = Math.max(0, indices.length - pageSize);
    const start = clamp(state.ui.virtualization.start, 0, maxStart);
    state.ui.virtualization.start = start;
    return {
      windowIndices: indices.slice(start),
      canLoadOlder: start > 0,
    };
  }

  function getVisibleRenderedItems() {
    return Array.from(
      getMessageList()?.querySelectorAll("li[data-message-index]") || [],
    );
  }

  function syncSelection() {
    const items = getVisibleRenderedItems();
    const availableIndices = items.map((item) =>
      Number(item.dataset.messageIndex),
    );
    if (
      state.ui.selectedMessageIndex !== -1 &&
      !availableIndices.includes(state.ui.selectedMessageIndex)
    ) {
      state.ui.selectedMessageIndex = -1;
    }
    items.forEach((item) => {
      const actualIndex = Number(item.dataset.messageIndex);
      item.classList.toggle(
        "selected",
        actualIndex === state.ui.selectedMessageIndex,
      );
    });
  }

  function createMessageItem(message) {
    const item = document.createElement("li");
    item.className = `jtch-item role-${message.role}`;
    item.dataset.messageIndex = String(message.index);
    item.dataset.role = message.role;
    item.dataset.preview = message.preview;
    item.tabIndex = 0;
    item.setAttribute("aria-label", `${message.role}: ${message.preview}`);

    const badge = document.createElement("span");
    badge.className = "jtch-role-badge";
    badge.textContent =
      message.role === "assistant" ? "AI" : message.role === "user" ? "You" : "—";

    const text = document.createElement("span");
    text.className = "jtch-item-text";
    const preview =
      message.preview.length > ns.config.maxPreviewLength
        ? `${message.preview.slice(0, ns.config.maxPreviewLength)}...`
        : message.preview;
    text.textContent = preview;

    item.appendChild(badge);
    item.appendChild(text);
    return item;
  }

  function renderMessageList(windowIndices, canLoadOlder) {
    const list = getMessageList();
    if (!list) return;
    list.innerHTML = "";

    if (canLoadOlder) {
      const older = document.createElement("li");
      older.className = "jtch-load-older";
      older.textContent = "Load earlier matches";
      older.dataset.action = "load-older";
      older.tabIndex = 0;
      list.appendChild(older);
    }

    if (windowIndices.length === 0) {
      const empty = document.createElement("li");
      empty.className = "jtch-empty";
      empty.textContent = state.ui.search.term
        ? "No messages match the current filters."
        : "No messages found in this conversation yet.";
      list.appendChild(empty);
      return;
    }

    windowIndices.forEach((messageIndex) => {
      const message = state.conversation.messages[messageIndex];
      if (message) {
        list.appendChild(createMessageItem(message));
      }
    });
    syncSelection();
  }

  function updateSearchMeta() {
    const meta = getElement("search-meta");
    if (!meta) return;

    if (!state.ui.search.term) {
      meta.textContent = "";
      meta.className = "jtch-search-meta";
      return;
    }

    const count = state.ui.search.matchCount;
    meta.textContent = `${count} match${count === 1 ? "" : "es"}`;
    meta.className = "jtch-search-meta";
  }

  function updateFilterUi() {
    const buttons = document.querySelectorAll("#filter-group .jtch-filter");
    buttons.forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.filter === state.ui.currentFilter,
      );
    });
  }

  function updateSearchUi() {
    const searchInput = getElement("message-search");
    if (searchInput) searchInput.value = state.ui.search.term;
  }

  function updateCountUi() {
    const count = getElement("message-count");
    if (count) count.textContent = String(state.conversation.messages.length);
  }

  function renderFiltersAndMessages() {
    const visibleIndices = computeVisibleIndices();
    const { windowIndices, canLoadOlder } = getVirtualWindow(visibleIndices);
    renderMessageList(windowIndices, canLoadOlder);
    updateSearchMeta();
    updateFilterUi();
    updateSearchUi();
    updateCountUi();
  }

  function selectMessage(index) {
    state.ui.selectedMessageIndex = index;
    syncSelection();
  }

  function selectRelativeMessage(step) {
    const items = getVisibleRenderedItems();
    if (items.length === 0) {
      state.ui.selectedMessageIndex = -1;
      return;
    }

    const currentPosition = items.findIndex(
      (item) => Number(item.dataset.messageIndex) === state.ui.selectedMessageIndex,
    );
    const nextPosition =
      currentPosition === -1
        ? step >= 0
          ? 0
          : items.length - 1
        : (currentPosition + step + items.length) % items.length;
    const nextIndex = Number(items[nextPosition].dataset.messageIndex);
    selectMessage(nextIndex);
    items[nextPosition].scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function clearSelection() {
    state.ui.selectedMessageIndex = -1;
    syncSelection();
  }

  function scrollToMessage(index) {
    const message = state.conversation.messages[index];
    if (!message?.domNode) return;
    message.domNode.scrollIntoView({ behavior: "smooth", block: "center" });
    message.domNode.classList.add("jtch-target-highlight");
    root.setTimeout(() => {
      message.domNode?.classList.remove("jtch-target-highlight");
    }, ns.config.highlightDuration);
  }

  function focusSearch() {
    const input = getElement("message-search");
    if (input) {
      input.focus();
      input.select();
    }
  }

  function setFilter(filter) {
    if (!ns.constants.filters.includes(filter)) return;
    state.ui.currentFilter = filter;
    state.ui.virtualization.start = 0;
    renderFiltersAndMessages();
  }

  function buildExportPayload() {
    return state.conversation.messages.map((message) => ({
      index: message.index,
      role: message.role,
      content: message.fullText,
    }));
  }

  function sanitizeCsvCell(value) {
    const stringValue = value == null ? "" : String(value);
    if (/^[=+\-@]/.test(stringValue)) {
      return `'${stringValue}`;
    }
    return stringValue;
  }

  function generateJSON(messages) {
    return JSON.stringify(
      {
        conversation: {
          id: state.conversation.id,
          exported: new Date().toISOString(),
          messageCount: messages.length,
          messages,
        },
      },
      null,
      2,
    );
  }

  function generateCSV(messages) {
    const header = "Index,Role,Content\n";
    const rows = messages
      .map((message) => {
        const content = sanitizeCsvCell(message.content).replace(/"/g, '""');
        return `${message.index},${message.role},"${content}"`;
      })
      .join("\n");
    return header + rows;
  }

  function generateMarkdown(messages) {
    let markdown = "# ChatGPT Conversation Export\n";
    markdown += `Exported: ${new Date().toLocaleString()}\n\n`;
    markdown += `## Messages (${messages.length})\n\n`;
    messages.forEach((message) => {
      markdown += `### Message ${message.index} - ${message.role}\n`;
      markdown += `${message.content}\n\n`;
    });
    return markdown;
  }

  ns.features = {
    applySearchState,
    renderFiltersAndMessages,
    updateThemeUi,
    selectMessage,
    selectRelativeMessage,
    clearSelection,
    scrollToMessage,
    focusSearch,
    setFilter,
    sanitizeCsvCell,
    generateJSON,
    generateCSV,
    generateMarkdown,
    buildExportPayload,
    updateCountUi,
    setStatus,
  };
})(globalThis);

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
  }

  function handleListInteraction(event) {
    const actionTarget = event.target.closest("[data-action='load-older']");
    if (actionTarget) {
      event.preventDefault();
      state.ui.virtualization.start = Math.max(
        0,
        state.ui.virtualization.start - ns.config.virtualListPageSize,
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
      matchCount: 0,
    };
    state.ui.selectedMessageIndex = -1;
    state.ui.virtualization.start = 0;
    startObserver();
    syncHostUi();
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
