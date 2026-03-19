(function (root) {
  function isChatTab(tab) {
    return Boolean(
      tab &&
        tab.id &&
        tab.url &&
        (tab.url.includes("chat.openai.com") || tab.url.includes("chatgpt.com")),
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
      handleCommand,
      handleActionClick,
      getActiveChatTab,
      sendToggle,
    };
  }
})(globalThis);
