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
