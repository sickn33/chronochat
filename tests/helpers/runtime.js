import path from "path";

const contentFiles = [
  "00_core.js",
  "10_storage.js",
  "20_dom.js",
  "30_ui.js",
  "40_features.js",
  "50_runtime.js",
];

export async function flushAsync() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

export function createChromeMock(storageSeed = {}) {
  const storageState = { ...storageSeed };
  return {
    runtime: {
      onMessage: {
        addListener: jest.fn(),
      },
    },
    storage: {
      local: {
        get: jest.fn((keys, callback) => {
          const result = {};
          keys.forEach((key) => {
            result[key] = storageState[key];
          });
          callback(result);
        }),
        set: jest.fn((values, callback) => {
          Object.assign(storageState, values);
          if (callback) callback();
        }),
      },
    },
    __storageState: storageState,
  };
}

export async function loadChronoChat({
  html = "",
  pathname = "/c/test-chat",
  storageSeed = {},
  chromeMock = createChromeMock(storageSeed),
} = {}) {
  if (global.__ChronoChatTestApi?.cleanup) {
    try {
      global.__ChronoChatTestApi.cleanup();
    } catch (_) {}
  }
  jest.resetModules();
  if (html) {
    document.body.innerHTML = html;
  }
  window.history.replaceState({}, "", pathname);
  window.__CHRONOCHAT_TEST__ = true;
  global.__CHRONOCHAT_TEST__ = true;
  delete window.__JTC__;
  delete global.__JTC__;
  delete window.__ChronoChatTestApi;
  delete global.__ChronoChatTestApi;
  global.chrome = chromeMock;
  global.MutationObserver = window.MutationObserver;
  Element.prototype.scrollIntoView = jest.fn();
  global.URL.createObjectURL = jest.fn(() => "blob:jump");
  global.URL.revokeObjectURL = jest.fn();

  jest.isolateModules(() => {
    contentFiles.forEach((fileName) => {
      require(path.resolve(process.cwd(), "src", "content", fileName));
    });
  });

  await window.__JTC__.initPromise;
  await flushAsync();

  return {
    ns: window.__JTC__,
    api: window.__ChronoChatTestApi,
    chrome: chromeMock,
  };
}

export function createConversationDom(messages) {
  document.body.innerHTML = "";
  const main = document.createElement("main");
  messages.forEach((message) => {
    const wrapper = document.createElement("div");
    if (message.role) {
      wrapper.dataset.messageAuthorRole = message.role;
    }
    if (message.className) {
      wrapper.className = message.className;
    }
    const content = document.createElement("div");
    content.className = "markdown";
    content.textContent = message.text;
    wrapper.appendChild(content);
    main.appendChild(wrapper);
  });
  document.body.appendChild(main);
  return main;
}

export async function loadServiceWorker(chromeMock) {
  jest.resetModules();
  global.chrome = chromeMock;
  global.__CHRONOCHAT_TEST__ = true;
  delete global.__ChronoChatServiceWorkerTestApi;

  jest.isolateModules(() => {
    require(path.resolve(process.cwd(), "src", "service_worker.js"));
  });

  return global.__ChronoChatServiceWorkerTestApi;
}
