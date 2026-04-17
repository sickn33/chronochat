import { flushAsync, loadServiceWorker } from "./helpers/runtime.js";

describe("ChronoChat service worker", () => {
  let consoleErrorSpy;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test("toggle command targets only the active supported tab", async () => {
    const chromeMock = {
      commands: {
        onCommand: {
          addListener: jest.fn(),
        },
      },
      action: {
        onClicked: {
          addListener: jest.fn(),
        },
      },
      tabs: {
        query: jest.fn((query, callback) => {
          callback([
            { id: 42, url: "https://chatgpt.com/c/active", active: true },
            { id: 77, url: "https://chatgpt.com/c/other", active: false },
          ]);
        }),
        sendMessage: jest.fn(),
      },
    };

    const api = await loadServiceWorker(chromeMock);
    api.handleCommand("toggle-sidebar");

    expect(chromeMock.tabs.query).toHaveBeenCalledWith(
      { active: true, currentWindow: true },
      expect.any(Function),
    );
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledTimes(1);
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(42, {
      action: "toggle-sidebar",
    }, expect.any(Function));
  });

  test("action click ignores lookalike hosts", async () => {
    const chromeMock = {
      commands: {
        onCommand: {
          addListener: jest.fn(),
        },
      },
      action: {
        onClicked: {
          addListener: jest.fn(),
        },
      },
      tabs: {
        query: jest.fn(),
        sendMessage: jest.fn(),
      },
    };

    const api = await loadServiceWorker(chromeMock);
    api.handleActionClick({
      id: 10,
      url: "https://chatgpt.com.evil.example/c/active",
    });

    expect(chromeMock.tabs.sendMessage).not.toHaveBeenCalled();
  });

  test("sendToggle handles rejected promise responses", async () => {
    const rejection = new Error("message channel closed");
    const chromeMock = {
      commands: {
        onCommand: {
          addListener: jest.fn(),
        },
      },
      action: {
        onClicked: {
          addListener: jest.fn(),
        },
      },
      tabs: {
        query: jest.fn(),
        sendMessage: jest.fn(() => Promise.reject(rejection)),
      },
    };

    const api = await loadServiceWorker(chromeMock);
    api.sendToggle(42);

    await flushAsync();

    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(
      42,
      { action: "toggle-sidebar" },
      expect.any(Function),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "ChronoChat: Failed to send toggle message",
      42,
      rejection,
    );
  });

  test("sendToggle handles callback lastError without crashing", async () => {
    const lastError = new Error("Could not establish connection");
    const chromeMock = {
      runtime: {
        lastError: null,
      },
      commands: {
        onCommand: {
          addListener: jest.fn(),
        },
      },
      action: {
        onClicked: {
          addListener: jest.fn(),
        },
      },
      tabs: {
        query: jest.fn(),
        sendMessage: jest.fn((tabId, message, callback) => {
          chromeMock.runtime.lastError = lastError;
          if (callback) callback();
          chromeMock.runtime.lastError = null;
        }),
      },
    };

    const api = await loadServiceWorker(chromeMock);
    api.sendToggle(99);

    await flushAsync();

    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(
      99,
      { action: "toggle-sidebar" },
      expect.any(Function),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "ChronoChat: Failed to send toggle message",
      99,
      lastError,
    );
  });
});
