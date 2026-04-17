(function (root) {
  const SUPPORTED_HOSTS = new Set(["chat.openai.com", "chatgpt.com"]);

  function getHostname(url) {
    try {
      return new URL(url).hostname;
    } catch (error) {
      return null;
    }
  }

  function isChatTab(tab) {
    const hostname = tab?.url ? getHostname(tab.url) : null;
    return Boolean(tab?.id && hostname && SUPPORTED_HOSTS.has(hostname));
  }

  function sendToggle(tabId) {
    try {
      const reportError = (error) => {
        console.error("ChronoChat: Failed to send toggle message", tabId, error);
      };

      const maybePromise = chrome.tabs.sendMessage(
        tabId,
        {
          action: "toggle-sidebar",
        },
        () => {
          const lastError = chrome.runtime?.lastError;
          if (lastError) {
            reportError(lastError);
          }
        },
      );

      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.catch(reportError);
        return;
      }
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
      handleCommand,
      handleActionClick,
      getActiveChatTab,
      sendToggle,
    };
  }
})(globalThis);
