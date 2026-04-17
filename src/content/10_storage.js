(function (root) {
  const ns = root.__JTC__;

  ns.storage = {
    enabled: false,
    async load() {
      // Persistence intentionally disabled in this release train.
      return null;
    },
  };
})(globalThis);
