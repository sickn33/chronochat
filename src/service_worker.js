  (function (root) {
    const supportedHosts = new Set(["chat.openai.com", "chatgpt.com"]);

    function isSupportedChatUrl(url) {
      try {
        const parsed = new URL(url);
        return parsed.protocol === "https:" && supportedHosts.has(parsed.hostname);
      } catch (_) {
        return false;
      }
    }

    function isChatTab(tab) {
      return Boolean(
        tab &&
          tab.id != null &&
          tab.url &&
          isSupportedChatUrl(tab.url),
      );
    }

  function sendToggle(tabId) {
    try {
      chrome.tabs.sendMessage(tabId, { action: "toggle-sidebar" });
    } catch (error) {
      console.error("ChronoChat: Failed to send toggle message", tabId, error);
    }
  }

  function getActiveChatTab(callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (isChatTab(tab)) {
        callback(tab);
      }
    });
  }

  function handleCommand(command) {
    if (command !== "toggle-sidebar") return;
    getActiveChatTab((tab) => sendToggle(tab.id));
  }

  function handleActionClick(tab) {
    if (isChatTab(tab)) {
      sendToggle(tab.id);
    }
  }

  if (chrome?.commands?.onCommand?.addListener) {
    chrome.commands.onCommand.addListener(handleCommand);
  }

  if (chrome?.action?.onClicked?.addListener) {
    chrome.action.onClicked.addListener(handleActionClick);
  }

  if (root.__CHRONOCHAT_TEST__) {
    root.__ChronoChatServiceWorkerTestApi = {
        isChatTab,
        isSupportedChatUrl,
      handleCommand,
      handleActionClick,
      getActiveChatTab,
      sendToggle,
    };
  }
})(globalThis);
