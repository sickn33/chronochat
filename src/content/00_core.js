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
