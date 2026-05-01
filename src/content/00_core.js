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
      minSidebarWidth: 280,
      maxSidebarWidth: 520,
      previewFontSize: 12,
      minPreviewFontSize: 11,
      maxPreviewFontSize: 15,
      debounceDelay: 220,
      storageSaveDelay: 250,
      observerRetryDelay: 1500,
      highlightDuration: 900,
      badgeFadeDuration: 1800,
    virtualListThreshold: 80,
    virtualListPageSize: 60,
    maxPreviewLength: 360,
    hostUiSyncDelay: 80,
    hostUiOpenDelay: root.__CHRONOCHAT_TEST__ ? 0 : 160,
  };

    ns.constants = {
      storage: {
        prefsKey: "jtch_v3_prefs",
        attachmentDbName: "chronochat_attachments",
        attachmentStoreName: "files",
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
    hostActionBarSelectors: [
      '[data-testid="thread-header-right-actions"]',
      '[data-testid="thread-header-right-actions-container"]',
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
    fileExtensionPattern:
      "\\.(pdf|csv|docx?|xlsx?|pptx?|txt|md|json|zip|png|jpe?g|gif|webp|svg|heic|avif)(\\?|#|$)",
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
          if (path === "/") {
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
          regex: false,
          caseSensitive: false,
          error: "",
        },
        status: "",
        sidebarWidth: 336,
        previewFontSize: 12,
        virtualization: {
          visibleStart: null,
        },
      },
    conversation: {
      id: ns.utils.getConversationId(root.location?.href || "https://chatgpt.com/"),
      messages: [],
      visibleIndices: [],
      attachments: [],
    },
    runtime: {
      initialized: false,
        observer: null,
        observerRetryId: null,
        routeWatcherId: null,
        routeWatcherFallbackId: null,
        originalHistoryMethods: null,
        cachedChatContainer: null,
        lastUrl: root.location?.href || "",
        cleanupFns: [],
        refreshDebounced: null,
        savePrefsDebounced: null,
        cachedAttachmentKeys: new Set(),
        resizingSidebar: false,
        hostThemeObserver: null,
        hostUiObserver: null,
        hostUiSync: null,
        hostPanelOpen: false,
        hostStyleState: null,
        previewRestorePending: false,
        previewRestoreSeen: false,
        previewRestoreObserver: null,
        previewRestoreTimeoutId: null,
      },
    };
})(globalThis);
