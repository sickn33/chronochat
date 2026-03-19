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
    sidebarMinWidth: 280,
    sidebarMaxWidth: 520,
    debounceDelay: 220,
    observerRetryDelay: 1500,
    highlightDuration: 900,
    badgeFadeDuration: 1800,
    virtualListThreshold: 80,
    virtualListPageSize: 60,
    maxPreviewLength: 160,
  };

  ns.constants = {
    storage: {
      prefs: "jtch_v2_prefs",
      theme: "jtch_v2_theme",
      sidebarWidth: "jtch_v2_sidebar_width",
    },
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
      sidebarWidth: ns.config.sidebarWidth,
      compact: false,
      previewLen: 120,
      themePreference: "system-like",
      effectiveTheme: "dark",
      exportMenuVisible: false,
      search: {
        term: "",
        isRegex: false,
        caseSensitive: false,
        lastError: null,
        matcher: null,
        lastValidMatcher: null,
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
      resizeFrame: null,
      isResizing: false,
      resizeStartX: 0,
      resizeStartWidth: ns.config.sidebarWidth,
      hostThemeObserver: null,
    },
  };

})(globalThis);

(function (root) {
  const ns = root.__JTC__;
  const { clamp } = ns.utils;
  const { storage: storageKeys } = ns.constants;
  const fallbackStorage = root.localStorage;

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

  function getFromFallback(key) {
    try {
      const raw = fallbackStorage.getItem(key);
      return raw == null ? undefined : JSON.parse(raw);
    } catch (_) {
      return undefined;
    }
  }

  function setToFallback(key, value) {
    try {
      fallbackStorage.setItem(key, JSON.stringify(value));
    } catch (_) {}
  }

  function removeFromFallback(key) {
    try {
      fallbackStorage.removeItem(key);
    } catch (_) {}
  }

  async function storageGet(keys) {
    const area = getChromeStorageArea();
    if (area) {
      return new Promise((resolve) => {
        area.get(keys, (result) => resolve(result || {}));
      });
    }

    const result = {};
    keys.forEach((key) => {
      result[key] = getFromFallback(key);
    });
    return result;
  }

  async function storageSet(values) {
    const area = getChromeStorageArea();
    if (area) {
      return new Promise((resolve) => {
        area.set(values, () => resolve());
      });
    }

    Object.entries(values).forEach(([key, value]) => {
      if (value === undefined) {
        removeFromFallback(key);
      } else {
        setToFallback(key, value);
      }
    });
  }

  function normalizeTheme(value) {
    return ["dark", "light", "system-like"].includes(value)
      ? value
      : "system-like";
  }

  function normalizePrefs(value) {
    const prefs = value && typeof value === "object" ? value : {};
    return {
      compact: Boolean(prefs.compact),
      previewLen: clamp(
        Number.isFinite(Number(prefs.previewLen))
          ? Number(prefs.previewLen)
          : 120,
        80,
        220,
      ),
    };
  }

  function normalizeWidth(value) {
    return clamp(
      Number.isFinite(Number(value)) ? Number(value) : ns.config.sidebarWidth,
      ns.config.sidebarMinWidth,
      ns.config.sidebarMaxWidth,
    );
  }

  ns.storage = {
    async load() {
      const data = await storageGet(Object.values(storageKeys));
      const prefs = normalizePrefs(data[storageKeys.prefs]);
      ns.state.ui.compact = prefs.compact;
      ns.state.ui.previewLen = prefs.previewLen;
      ns.state.ui.themePreference = normalizeTheme(data[storageKeys.theme]);
      ns.state.ui.sidebarWidth = normalizeWidth(data[storageKeys.sidebarWidth]);
    },
    async persistPrefs() {
      return storageSet({
        [storageKeys.prefs]: {
          compact: ns.state.ui.compact,
          previewLen: ns.state.ui.previewLen,
        },
      });
    },
    async persistTheme() {
      return storageSet({
        [storageKeys.theme]: ns.state.ui.themePreference,
      });
    },
    async persistSidebarWidth() {
      return storageSet({
        [storageKeys.sidebarWidth]: ns.state.ui.sidebarWidth,
      });
    },
    normalizeTheme,
    normalizePrefs,
    normalizeWidth,
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

  function hasMeaningfulText(element) {
    return collapseText(element?.textContent || "").length >= 8;
  }

  function filterRootMessageCandidates(nodes) {
    const candidates = nodes.filter(
      (node) =>
        isVisibleElement(node) &&
        hasMeaningfulText(node) &&
        !node.closest?.("#chatgpt-nav-sidebar"),
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

  function collapseText(value) {
    return String(value || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
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

  function collectMessages() {
    let container = getChatContainer();
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
  };
})(globalThis);

(function (root) {
  const ns = root.__JTC__;

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

    const count = document.createElement("span");
    count.id = "message-count";
    count.className = "jtch-count";
    count.setAttribute("aria-live", "polite");
    count.textContent = "0";

    const actions = document.createElement("div");
    actions.className = "jtch-header-actions";

    const themeButton = createButton({
      id: "theme-toggle",
      className: "jtch-icon-button",
      text: "Auto",
      label: "Cycle theme preference",
      title: "Cycle theme preference",
    });

    const exportButton = createButton({
      id: "export-toggle",
      className: "jtch-icon-button",
      text: "Export",
      label: "Open export menu",
      title: "Open export menu",
    });

    const closeButton = createButton({
      id: "sidebar-close",
      className: "jtch-icon-button",
      text: "Close",
      label: "Close sidebar",
      title: "Close sidebar",
    });

    const exportMenu = document.createElement("div");
    exportMenu.id = "export-menu";
    exportMenu.className = "jtch-export-menu hidden";
    ["json", "csv", "md"].forEach((format) => {
      exportMenu.appendChild(
        createButton({
          className: "jtch-export-option",
          text: format.toUpperCase(),
          label: `Export ${format.toUpperCase()}`,
          dataset: { format },
        }),
      );
    });

    actions.appendChild(themeButton);
    actions.appendChild(exportButton);
    actions.appendChild(closeButton);

    titleRow.appendChild(title);
    titleRow.appendChild(count);
    titleRow.appendChild(actions);

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

    const regexButton = createButton({
      id: "regex-toggle",
      className: "jtch-search-toggle",
      text: ".*",
      label: "Toggle regex search",
      title: "Toggle regex search",
    });

    const caseButton = createButton({
      id: "case-toggle",
      className: "jtch-search-toggle",
      text: "Aa",
      label: "Toggle case sensitivity",
      title: "Toggle case sensitivity",
    });

    const clearSearch = createButton({
      id: "search-clear",
      className: "jtch-search-clear",
      text: "Clear",
      label: "Clear search",
      title: "Clear search",
    });

    searchRow.appendChild(searchInput);
    searchRow.appendChild(regexButton);
    searchRow.appendChild(caseButton);
    searchRow.appendChild(clearSearch);

    const searchMeta = document.createElement("div");
    searchMeta.id = "search-meta";
    searchMeta.className = "jtch-search-meta";

    const prefsRow = document.createElement("div");
    prefsRow.className = "jtch-prefs";

    const compactLabel = document.createElement("label");
    compactLabel.className = "jtch-pref";
    const compactCheckbox = document.createElement("input");
    compactCheckbox.type = "checkbox";
    compactCheckbox.id = "pref-compact";
    compactLabel.appendChild(compactCheckbox);
    compactLabel.appendChild(document.createTextNode(" Compact"));

    const previewLabel = document.createElement("label");
    previewLabel.className = "jtch-pref jtch-pref-select";
    previewLabel.appendChild(document.createTextNode("Preview"));
    const previewSelect = document.createElement("select");
    previewSelect.id = "pref-preview-len";
    [100, 140, 180, 220].forEach((value) => {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = `${value}`;
      previewSelect.appendChild(option);
    });
    previewLabel.appendChild(previewSelect);

    prefsRow.appendChild(compactLabel);
    prefsRow.appendChild(previewLabel);

    const status = document.createElement("div");
    status.id = "jtch-status";
    status.className = "jtch-status hidden";

    header.appendChild(titleRow);
    header.appendChild(exportMenu);
    header.appendChild(filterGroup);
    header.appendChild(searchRow);
    header.appendChild(searchMeta);
    header.appendChild(prefsRow);
    header.appendChild(status);

    const messageSection = document.createElement("div");
    messageSection.className = "jtch-section jtch-message-section";

    const messageList = document.createElement("ul");
    messageList.id = "message-list";
    messageList.className = "jtch-list";
    messageList.setAttribute("aria-label", "Conversation messages");

    messageSection.appendChild(messageList);

    const resizeHandle = document.createElement("div");
    resizeHandle.id = "sidebar-resize-handle";
    resizeHandle.className = "jtch-resize-handle";
    resizeHandle.setAttribute("aria-hidden", "true");

    sidebar.appendChild(header);
    sidebar.appendChild(messageSection);
    sidebar.appendChild(resizeHandle);
    return sidebar;
  }

  function createToggleButton() {
    return createButton({
      id: "chatgpt-nav-toggle",
      className: "jtch-toggle-button",
      text: "Chrono",
      label: "Toggle ChronoChat sidebar",
      title: "Open ChronoChat",
    });
  }

  function ensureUiRoot() {
    let sidebar = document.getElementById("chatgpt-nav-sidebar");
    let toggle = document.getElementById("chatgpt-nav-toggle");

    if (!toggle) {
      toggle = createToggleButton();
      document.body.appendChild(toggle);
    }

    if (!sidebar) {
      sidebar = createSidebar();
      document.body.appendChild(sidebar);
    }

    return { sidebar, toggle };
  }

  ns.ui = {
    ensureUiRoot,
  };
})(globalThis);

(function (root) {
  const ns = root.__JTC__;
  const state = ns.state;
  const { clamp, escapeRegExp, createFilenameTimestamp } = ns.utils;

  function getElement(id) {
    return document.getElementById(id);
  }

  function getMessageList() {
    return getElement("message-list");
  }

  function setStatus(message, tone = "info") {
    const element = getElement("jtch-status");
    if (!element) return;
    if (!message) {
      element.textContent = "";
      element.className = "jtch-status hidden";
      return;
    }
    element.textContent = message;
    element.className = `jtch-status jtch-status-${tone}`;
  }

  function updateThemeUi() {
    const toggle = getElement("theme-toggle");
    if (!toggle) return;
    const preference = state.ui.themePreference;
    const effectiveTheme =
      preference === "system-like" ? ns.dom.detectHostTheme() : preference;
    state.ui.effectiveTheme = effectiveTheme;

    const sidebar = getElement("chatgpt-nav-sidebar");
    const floatingToggle = getElement("chatgpt-nav-toggle");
    [sidebar, floatingToggle].forEach((element) => {
      if (!element) return;
      element.classList.remove("theme-dark", "theme-light");
      element.classList.add(
        effectiveTheme === "dark" ? "theme-dark" : "theme-light",
      );
    });

    const labelMap = {
      "system-like": "Auto",
      dark: "Dark",
      light: "Light",
    };
    toggle.textContent = labelMap[preference];
    toggle.title =
      preference === "system-like"
        ? "Using ChatGPT theme"
        : `Theme override: ${preference}`;
  }

  function cycleThemePreference() {
    const order = ["system-like", "dark", "light"];
    const currentIndex = order.indexOf(state.ui.themePreference);
    state.ui.themePreference = order[(currentIndex + 1) % order.length];
    updateThemeUi();
    ns.storage.persistTheme();
  }

  function compileSearchPattern(term, isRegex, caseSensitive) {
    if (!term) {
      return { matcher: null, error: null };
    }

    try {
      const source = isRegex ? term : escapeRegExp(term);
      const flags = caseSensitive ? "u" : "iu";
      const regex = new RegExp(source, flags);
      return {
        matcher: (message) => regex.test(message),
        error: null,
      };
    } catch (error) {
      if (
        error.message.includes("Unmatched") ||
        error.message.includes("Unterminated")
      ) {
        return { matcher: null, error: "Unmatched parenthesis or bracket" };
      }
      if (error.message.includes("range")) {
        return { matcher: null, error: "Invalid character range" };
      }
      return { matcher: null, error: "Invalid regex syntax" };
    }
  }

  function applySearchState(partialState) {
    const searchState = {
      ...state.ui.search,
      ...partialState,
    };
    searchState.term = String(searchState.term || "");

    const { matcher, error } = compileSearchPattern(
      searchState.term,
      searchState.isRegex,
      searchState.caseSensitive,
    );

    if (!searchState.term) {
      searchState.matcher = null;
      searchState.lastValidMatcher = null;
      searchState.lastError = null;
    } else if (error) {
      searchState.matcher = searchState.lastValidMatcher;
      searchState.lastError = error;
    } else {
      searchState.matcher = matcher;
      searchState.lastValidMatcher = matcher;
      searchState.lastError = null;
    }

    state.ui.search = searchState;
    state.ui.virtualization.start = 0;
    renderFiltersAndMessages();
  }

  function doesMessageMatch(message) {
    const { term, matcher, caseSensitive } = state.ui.search;
    if (!term) return true;

    if (matcher) {
      return matcher(message.fullText) || matcher(message.preview);
    }

    const haystack = caseSensitive
      ? `${message.fullText} ${message.preview}`
      : `${message.fullText} ${message.preview}`.toLowerCase();
    const needle = caseSensitive ? term : term.toLowerCase();
    return haystack.includes(needle);
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
    const maxLength = clamp(
      state.ui.previewLen,
      80,
      ns.config.maxPreviewLength + 60,
    );
    const preview =
      message.preview.length > maxLength
        ? `${message.preview.slice(0, maxLength)}...`
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
    if (state.ui.search.lastError) {
      meta.textContent = `${state.ui.search.lastError}. Keeping previous valid search.`;
      meta.className = "jtch-search-meta error";
      return;
    }

    const { term, matchCount, isRegex, caseSensitive } = state.ui.search;
    if (!term) {
      meta.textContent = "Use / to focus search, j/k to navigate, Enter to jump.";
      meta.className = "jtch-search-meta";
      return;
    }

    const parts = [`${matchCount} match${matchCount === 1 ? "" : "es"}`];
    if (isRegex) parts.push("regex");
    if (caseSensitive) parts.push("case-sensitive");
    meta.textContent = parts.join(" • ");
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

  function updatePreferenceUi() {
    const compact = getElement("pref-compact");
    const previewSelect = getElement("pref-preview-len");
    if (compact) compact.checked = state.ui.compact;
    if (previewSelect) previewSelect.value = String(state.ui.previewLen);
  }

  function updateSearchUi() {
    const searchInput = getElement("message-search");
    const regexButton = getElement("regex-toggle");
    const caseButton = getElement("case-toggle");
    if (searchInput) searchInput.value = state.ui.search.term;
    if (regexButton) {
      regexButton.classList.toggle("active", state.ui.search.isRegex);
    }
    if (caseButton) {
      caseButton.classList.toggle("active", state.ui.search.caseSensitive);
      caseButton.textContent = state.ui.search.caseSensitive ? "Aa" : "aa";
    }
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
    updatePreferenceUi();
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

  function setCompact(value) {
    state.ui.compact = Boolean(value);
    getMessageList()?.classList.toggle("compact", state.ui.compact);
    ns.storage.persistPrefs();
  }

  function setPreviewLength(value) {
    state.ui.previewLen = clamp(Number(value) || 120, 80, 220);
    ns.storage.persistPrefs();
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

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    root.setTimeout(() => URL.revokeObjectURL(url), 50);
  }

  function exportConversation(format) {
    const messages = buildExportPayload();
    if (messages.length === 0) {
      setStatus("No messages available to export.", "warning");
      return;
    }

    switch (format) {
      case "json":
        downloadFile(
          generateJSON(messages),
          `chat-${createFilenameTimestamp()}.json`,
          "application/json",
        );
        break;
      case "csv":
        downloadFile(
          generateCSV(messages),
          `chat-${createFilenameTimestamp()}.csv`,
          "text/csv",
        );
        break;
      case "md":
        downloadFile(
          generateMarkdown(messages),
          `chat-${createFilenameTimestamp()}.md`,
          "text/markdown",
        );
        break;
      default:
        setStatus("Unsupported export format.", "warning");
        return;
    }

    setStatus("Conversation exported.", "success");
  }

  ns.features = {
    applySearchState,
    compileSearchPattern,
    renderFiltersAndMessages,
    updateThemeUi,
    cycleThemePreference,
    selectMessage,
    selectRelativeMessage,
    clearSelection,
    scrollToMessage,
    focusSearch,
    setFilter,
    setCompact,
    setPreviewLength,
    exportConversation,
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
