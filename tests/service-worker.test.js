import { loadServiceWorker } from "./helpers/runtime.js";

describe("ChronoChat service worker", () => {
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
    });
  });

  test("action click ignores unsupported tabs", async () => {
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
    api.handleActionClick({ id: 10, url: "https://example.com" });

    expect(chromeMock.tabs.sendMessage).not.toHaveBeenCalled();
  });
});
