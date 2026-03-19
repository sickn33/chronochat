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
