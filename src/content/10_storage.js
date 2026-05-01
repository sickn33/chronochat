  (function (root) {
    const ns = root.__JTC__;
    const state = ns.state;

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

    function normalizePrefs(value) {
      const prefs = value && typeof value === "object" ? value : {};
      const normalized = {};

      if (typeof prefs.sidebarWidth === "number") {
        normalized.sidebarWidth = ns.utils.clamp(
          prefs.sidebarWidth,
          ns.config.minSidebarWidth,
          ns.config.maxSidebarWidth,
        );
      }

      if (typeof prefs.previewFontSize === "number") {
        normalized.previewFontSize = ns.utils.clamp(
          prefs.previewFontSize,
          ns.config.minPreviewFontSize,
          ns.config.maxPreviewFontSize,
        );
      }

      return normalized;
    }

    function readStorage(area, key) {
      return new Promise((resolve) => {
        try {
          area.get([key], (result) => resolve(result || {}));
        } catch (_) {
          resolve({});
        }
      });
    }

    function writeStorage(area, values) {
      return new Promise((resolve) => {
        try {
          area.set(values, () => resolve());
        } catch (_) {
          resolve();
        }
      });
    }

    function buildPrefsPayload() {
      return {
        sidebarWidth: state.ui.sidebarWidth,
        previewFontSize: state.ui.previewFontSize,
      };
    }

    function getIndexedDb() {
      return root.indexedDB || null;
    }

    function openAttachmentDb() {
      const indexedDb = getIndexedDb();
      if (!indexedDb) return Promise.resolve(null);

      return new Promise((resolve) => {
        const request = indexedDb.open(ns.constants.storage.attachmentDbName, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(ns.constants.storage.attachmentStoreName)) {
            db.createObjectStore(ns.constants.storage.attachmentStoreName, {
              keyPath: "key",
            });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      });
    }

    async function readCachedAttachment(key) {
      const db = await openAttachmentDb();
      if (!db) return null;

      return new Promise((resolve) => {
        const transaction = db.transaction(
          ns.constants.storage.attachmentStoreName,
          "readonly",
        );
        const store = transaction.objectStore(ns.constants.storage.attachmentStoreName);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
        transaction.oncomplete = () => db.close();
        transaction.onerror = () => db.close();
      });
    }

    async function writeCachedAttachment(attachment, blob) {
      const db = await openAttachmentDb();
      if (!db || !blob) return false;

      return new Promise((resolve) => {
        const transaction = db.transaction(
          ns.constants.storage.attachmentStoreName,
          "readwrite",
        );
        const store = transaction.objectStore(ns.constants.storage.attachmentStoreName);
        const record = {
          key: attachment.cacheKey,
          attachmentId: attachment.id,
          conversationId: state.conversation.id,
          name: attachment.name,
          typeLabel: attachment.typeLabel,
          kind: attachment.kind,
          blob,
          size: blob.size || 0,
          cachedAt: new Date().toISOString(),
        };
        store.put(record);
        transaction.oncomplete = () => {
          db.close();
          resolve(true);
        };
        transaction.onerror = () => {
          db.close();
          resolve(false);
        };
      });
    }

    ns.storage = {
      async load() {
        const area = getChromeStorageArea();
        if (!area) return undefined;

        const key = ns.constants.storage.prefsKey;
        const result = await readStorage(area, key);
        const prefs = normalizePrefs(result[key]);

        if (prefs.sidebarWidth) {
          state.ui.sidebarWidth = prefs.sidebarWidth;
        }
        if (prefs.previewFontSize) {
          state.ui.previewFontSize = prefs.previewFontSize;
        }
        return prefs;
      },
      async save() {
        const area = getChromeStorageArea();
        if (!area) return;
        await writeStorage(area, {
          [ns.constants.storage.prefsKey]: buildPrefsPayload(),
        });
      },
      scheduleSave() {
        if (!state.runtime.savePrefsDebounced) {
          state.runtime.savePrefsDebounced = ns.utils.createDebouncer(
            () => ns.storage.save(),
            ns.config.storageSaveDelay,
          );
        }
        state.runtime.savePrefsDebounced();
      },
      buildPrefsPayload,
      getCachedAttachment: readCachedAttachment,
      cacheAttachment: writeCachedAttachment,
      getChromeStorageArea,
    };
  })(globalThis);
