(function (root) {
  const ns = root.__JTC__;
  const state = ns.state;
  const {
    primaryMessageSelectors,
    fallbackMessageSelectors,
    chatContainerSelectors,
  } = ns.constants;

  function safeQuerySelector(selectors, context = document) {
    const selectorArray = Array.isArray(selectors) ? selectors : [selectors];
    for (const selector of selectorArray) {
      try {
        const element = context.querySelector(selector);
        if (element) return element;
      } catch (_) {}
    }
    return null;
  }

  function safeQuerySelectorAll(selectors, context = document) {
    if (!Array.isArray(selectors)) {
      try {
        return Array.from(context.querySelectorAll(selectors));
      } catch (_) {
        return [];
      }
    }

    const seen = new Set();
    const collected = [];
    for (const selector of selectors) {
      try {
        const elements = Array.from(context.querySelectorAll(selector));
        elements.forEach((element) => {
          if (seen.has(element)) return;
          seen.add(element);
          collected.push(element);
        });
      } catch (_) {}
    }
    return collected;
  }

  function hasPrimaryTurnRelationship(element, primaryNodes) {
    return primaryNodes.some((primaryNode) => {
      return (
        primaryNode === element ||
        primaryNode.contains(element) ||
        element.contains(primaryNode)
      );
    });
  }

  function isVisibleElement(element) {
    if (!element || !element.isConnected) return false;
    if (element.getAttribute?.("aria-hidden") === "true") return false;
    const style = root.getComputedStyle?.(element);
    if (!style) return true;
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function hasMeaningfulText(element) {
    return collapseText(element?.textContent || "").length >= 8;
  }

  function filterRootMessageCandidates(nodes) {
    const candidates = nodes.filter(
      (node) =>
        isVisibleElement(node) &&
        hasMeaningfulText(node) &&
        !node.closest?.("#chatgpt-nav-sidebar"),
    );

    return candidates.filter((node) => {
      return !candidates.some(
        (other) => other !== node && other.contains(node),
      );
    });
  }

  function getChatContainer() {
    if (state.runtime.cachedChatContainer?.isConnected) {
      return state.runtime.cachedChatContainer;
    }
    const container = safeQuerySelector(chatContainerSelectors, document);
    state.runtime.cachedChatContainer = container;
    return container;
  }

  function detectHostTheme() {
    try {
      if (
        document.documentElement.classList.contains("dark") ||
        document.body.classList.contains("dark")
      ) {
        return "dark";
      }

      const background = root.getComputedStyle(document.body).backgroundColor;
      if (!background) return "dark";
      const match = background.match(/\d+/g);
      if (!match || match.length < 3) return "dark";
      const [r, g, b] = match.map(Number);
      const luminance = (r * 299 + g * 587 + b * 114) / 1000;
      return luminance < 140 ? "dark" : "light";
    } catch (_) {
      return "dark";
    }
  }

  function normalizeRoleValue(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (["assistant", "ai", "bot", "model"].includes(normalized)) {
      return "assistant";
    }
    if (["user", "you", "utente", "human"].includes(normalized)) {
      return "user";
    }
    return "unknown";
  }

  function detectRoleHint(value) {
    const normalized = String(value || "").toLowerCase();
    if (!normalized) return "unknown";
    if (
      /\b(assistant|chatgpt|ai|bot|model)\b/.test(normalized) ||
      normalized.includes("assistant-message")
    ) {
      return "assistant";
    }
    if (
      /\b(user|you|utente|human)\b/.test(normalized) ||
      normalized.includes("user-message")
    ) {
      return "user";
    }
    return "unknown";
  }

  function inferRole(node, index) {
    if (!node) return index % 2 === 0 ? "user" : "assistant";

    const directRole = normalizeRoleValue(
      node.dataset?.messageAuthorRole ||
        node.getAttribute?.("data-message-author-role"),
    );
    if (directRole !== "unknown") return directRole;

    const nestedRoleNode = node.querySelector?.("[data-message-author-role]");
    if (nestedRoleNode) {
      const nestedRole = normalizeRoleValue(
        nestedRoleNode.dataset?.messageAuthorRole ||
          nestedRoleNode.getAttribute?.("data-message-author-role"),
      );
      if (nestedRole !== "unknown") return nestedRole;
    }

    const hints = [
      node.getAttribute?.("data-testid"),
      node.getAttribute?.("aria-label"),
      node.className,
    ]
      .filter(Boolean)
      .join(" ");
    const directHint = detectRoleHint(hints);
    if (directHint !== "unknown") return directHint;

    const nestedHintNode = node.querySelector?.(
      '[data-testid*="user"],[data-testid*="assistant"],[class*="user"],[class*="assistant"],[aria-label*="user" i],[aria-label*="assistant" i]',
    );
    if (nestedHintNode) {
      const nestedHint = detectRoleHint(
        [
          nestedHintNode.getAttribute?.("data-testid"),
          nestedHintNode.getAttribute?.("aria-label"),
          nestedHintNode.className,
        ]
          .filter(Boolean)
          .join(" "),
      );
      if (nestedHint !== "unknown") return nestedHint;
    }

    return index % 2 === 0 ? "user" : "assistant";
  }

  function collapseText(value) {
    return String(value || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function isLikelyUiArtifact(node) {
    if (!node) return false;
    return Boolean(
      node.querySelector?.(
        'form, textarea, [contenteditable="true"], [contenteditable="plaintext-only"], [data-testid*="composer"], [class*="composer"], [placeholder]',
      ),
    );
  }

  function extractMessageContent(node) {
    if (isLikelyUiArtifact(node)) {
      return null;
    }

    const textSelectors = [
      "div.whitespace-pre-wrap",
      "div.prose",
      ".markdown",
      "[data-message-content]",
    ];

    let contentNode = safeQuerySelector(textSelectors, node);
    if (!contentNode) {
      const divs = Array.from(node.querySelectorAll("div"));
      contentNode =
        divs.find((element) => collapseText(element.textContent).length > 12) || node;
    }

    const clone = contentNode.cloneNode(true);
    clone
      .querySelectorAll(
        'button, [class*="icon"], form, textarea, .flex.absolute, .sr-only, nav, header, footer',
      )
      .forEach((element) => element.remove());

    const codeNode = clone.querySelector("pre code, code, pre");
    const codeText = collapseText(codeNode?.textContent || "");
    const text = collapseText(clone.textContent || clone.innerText || "");

    if (text) {
      if (codeText && text === codeText) {
        return {
          fullText: `Code: ${codeText}`,
          previewText: `Code: ${codeText}`,
        };
      }

      return {
        fullText: text,
        previewText: text,
      };
    }

    if (node.querySelector('img, [class*="image"]')) {
      return {
        fullText: "Assistant generated an image",
        previewText: "Assistant generated an image",
      };
    }

    return null;
  }

  function collectMessages() {
    let container = getChatContainer();
    const primaryNodes = safeQuerySelectorAll(
      primaryMessageSelectors,
      container || document,
    );
    const resolvedPrimaryNodes =
      primaryNodes.length <= 1
        ? safeQuerySelectorAll(primaryMessageSelectors, document)
        : primaryNodes;

    const fallbackNodes = safeQuerySelectorAll(
      fallbackMessageSelectors,
      container || document,
    );
    const resolvedFallbackNodes =
      primaryNodes.length === 0 && fallbackNodes.length <= 1
        ? safeQuerySelectorAll(fallbackMessageSelectors, document)
        : fallbackNodes;

    const primarySet = Array.from(new Set(resolvedPrimaryNodes));
    const fallbackSet = Array.from(new Set(resolvedFallbackNodes)).filter(
      (node) =>
        primarySet.length === 0 || !hasPrimaryTurnRelationship(node, primarySet),
    );

    let nodes = [...primarySet, ...fallbackSet];
    nodes = filterRootMessageCandidates(nodes);

    return nodes.reduce((messages, node, index) => {
      const content = extractMessageContent(node);
      if (!content) {
        return messages;
      }

      messages.push({
        index: messages.length,
        role: inferRole(node, index),
        preview: content.previewText,
        fullText: content.fullText,
        domNode: node,
      });
      return messages;
    }, []);
  }

  ns.dom = {
    safeQuerySelector,
    safeQuerySelectorAll,
    getChatContainer,
    detectHostTheme,
    normalizeRoleValue,
    detectRoleHint,
    inferRole,
    collectMessages,
    collapseText,
    filterRootMessageCandidates,
    isLikelyUiArtifact,
  };
})(globalThis);
