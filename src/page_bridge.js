(function () {
  if (window.__CHRONOCHAT_PAGE_BRIDGE__) return;
  window.__CHRONOCHAT_PAGE_BRIDGE__ = true;

  const REQUEST_SOURCE = "chronochat-content";
  const RESPONSE_SOURCE = "chronochat-page-bridge";
  function isTrustedMessageOrigin(origin) {
    return origin === "https://chatgpt.com" || origin === "https://chat.openai.com";
  }

  function getWorkspaceCookieId() {
    try {
      return (
        document.cookie
          .split(";")
          .map((part) => part.trim())
          .find((part) => /^oai-did-workspace=/.test(part))
          ?.split("=")
          .slice(1)
          .join("=") || ""
      );
    } catch (_) {
      return "";
    }
  }

  async function getAuthHeaders() {
    const headers = {};
    try {
      const sessionResponse = await fetch("/api/auth/session", {
        credentials: "include",
      });
      if (!sessionResponse.ok) return headers;
      const session = await sessionResponse.json();
      const accessToken = session?.accessToken;
      if (!accessToken) return headers;

      headers.Authorization = `Bearer ${accessToken}`;
      headers["X-Authorization"] = `Bearer ${accessToken}`;

      const accountResponse = await fetch("/backend-api/accounts/check/v4-2023-04-27", {
        credentials: "include",
        headers,
      });
      if (!accountResponse.ok) return headers;
      const accountPayload = await accountResponse.json();
      const accounts = accountPayload?.accounts || {};
      const workspaceId = getWorkspaceCookieId();
      const workspaceAccount = workspaceId ? accounts[workspaceId] : null;
      const account =
        workspaceAccount ||
        Object.values(accounts).find((candidate) => candidate?.account?.account_id);
      if (account?.account?.account_id) {
        headers["Chatgpt-Account-Id"] = account.account.account_id;
      }
    } catch (_) {}
    return headers;
  }

  async function fetchConversation(conversationId) {
    const endpoint = `/backend-api/conversation/${encodeURIComponent(conversationId)}`;
    let response = await fetch(endpoint, { credentials: "include" });
    if (!response.ok) {
      const headers = await getAuthHeaders();
      if (Object.keys(headers).length) {
        response = await fetch(endpoint, {
          credentials: "include",
          headers,
        });
      }
    }
    if (!response.ok) {
      return { ok: false, status: response.status || 0, payload: null };
    }
    return { ok: true, status: response.status, payload: await response.json() };
  }

  window.addEventListener("message", async (event) => {
    if (!isTrustedMessageOrigin(event.origin)) return;
    if (event.source !== window) return;
    const message = event.data;
    if (
      !message ||
      message.source !== REQUEST_SOURCE ||
      message.type !== "fetchConversation" ||
      !message.requestId ||
      !message.conversationId
    ) {
      return;
    }

    try {
      const result = await fetchConversation(message.conversationId);
      window.postMessage(
        {
          source: RESPONSE_SOURCE,
          type: "fetchConversationResult",
          requestId: message.requestId,
          ...result,
        },
        window.location.origin,
      );
    } catch (error) {
      window.postMessage(
        {
          source: RESPONSE_SOURCE,
          type: "fetchConversationResult",
          requestId: message.requestId,
          ok: false,
          status: 0,
          error: error?.message || "Bridge fetch failed",
        },
        window.location.origin,
      );
    }
  });
})();
