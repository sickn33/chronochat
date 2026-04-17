(function (root) {
  const ns = root.__JTC__;
  const state = ns.state;
  const {
    primaryMessageSelectors,
    fallbackMessageSelectors,
    chatContainerSelectors,
    hostActionBarSelectors,
    hostSidePanelSelectors,
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

  function collapseText(value) {
    return String(value || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function hasMeaningfulText(element) {
    return collapseText(element?.textContent || "").length >= 8;
  }

  function isChronoChatNode(element) {
    if (!element) return false;
    if (
      element.id === "chatgpt-nav-sidebar" ||
      element.id === "chatgpt-nav-toggle" ||
      element.id === "chatgpt-nav-toggle-slot"
    ) {
      return true;
    }
    return Boolean(
      element.closest?.(
        "#chatgpt-nav-sidebar, #chatgpt-nav-toggle, #chatgpt-nav-toggle-slot",
      ),
    );
  }

  function isInteractiveElement(element) {
    return Boolean(
      element?.matches?.("button, [role='button'], a, summary"),
    );
  }

  function getElementLabel(element) {
    if (!element) return "";
    return collapseText(
      element.getAttribute?.("aria-label") ||
        element.getAttribute?.("title") ||
        element.textContent ||
        "",
    );
  }

  function getInteractiveElements(context) {
    return safeQuerySelectorAll("button, [role='button'], a, summary", context).filter(
      (element) => isVisibleElement(element) && !isChronoChatNode(element),
    );
  }

  function filterRootMessageCandidates(nodes) {
    const candidates = nodes.filter(
      (node) =>
        isVisibleElement(node) &&
        hasMeaningfulText(node) &&
        !isChronoChatNode(node),
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
          contentNode,
        };
      }

      return {
        fullText: text,
        previewText: text,
        contentNode,
      };
    }

    if (node.querySelector('img, [class*="image"]')) {
      return {
        fullText: "Assistant generated an image",
        previewText: "Assistant generated an image",
        contentNode,
      };
    }

    return null;
  }

  function getConversationActionBar() {
    const explicit = safeQuerySelector(hostActionBarSelectors, document);
    if (explicit && isVisibleElement(explicit)) {
      return explicit;
    }

    const markers = getInteractiveElements(document).filter((element) => {
      const label = getElementLabel(element);
      return /share|activity/i.test(label);
    });

    const candidates = [];
    const seen = new Set();

    markers.forEach((marker) => {
      let current = marker.parentElement;
      let depth = 0;
      while (current && current !== document.body && depth < 6) {
        if (!seen.has(current) && isVisibleElement(current)) {
          const interactiveCount = getInteractiveElements(current).length;
          if (interactiveCount >= 2 && interactiveCount <= 8) {
            seen.add(current);
            candidates.push({ node: current, interactiveCount, depth });
          }
        }
        current = current.parentElement;
        depth += 1;
      }
    });

    candidates.sort((left, right) => {
      if (left.depth !== right.depth) {
        return left.depth - right.depth;
      }
      return left.interactiveCount - right.interactiveCount;
    });

    return candidates[0]?.node || null;
  }

  function getConversationActionReference(actionBar) {
    const elements = getInteractiveElements(actionBar);
    return (
      elements.find((element) => /share/i.test(getElementLabel(element))) ||
      elements.find((element) => /activity/i.test(getElementLabel(element))) ||
      elements[elements.length - 1] ||
      null
    );
  }

  function getHostLeftRail() {
    const viewportHeight =
      root.innerHeight || document.documentElement.clientHeight || 720;

    const candidates = safeQuerySelectorAll(["aside", "nav", "div"], document).filter(
      (element) => {
        if (!isVisibleElement(element) || isChronoChatNode(element)) {
          return false;
        }
        const rect = element.getBoundingClientRect?.();
        if (!rect || rect.width < 56 || rect.width > 220) {
          return false;
        }
        if (rect.height < viewportHeight * 0.5) {
          return false;
        }
        return rect.left <= 12 && rect.right > rect.left;
      },
    );

    candidates.sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return rightRect.width * rightRect.height - leftRect.width * leftRect.height;
    });

    return candidates[0] || null;
  }

  function getHostActivityToggle(actionBar = getConversationActionBar()) {
    if (!actionBar) return null;
    return (
      getInteractiveElements(actionBar).find((element) =>
        /activity/i.test(getElementLabel(element)),
      ) || null
    );
  }

  function isLikelyHostSidePanelFrame(element, viewportWidth) {
    if (!isVisibleElement(element) || isChronoChatNode(element)) {
      return false;
    }
    const rect = element.getBoundingClientRect?.();
    if (!rect || rect.width < 180 || rect.height < 160) {
      return false;
    }
    const occupiesRightRail =
      rect.right >= viewportWidth - 12 &&
      (rect.left >= viewportWidth * 0.45 || rect.width >= viewportWidth * 0.55);
    if (!occupiesRightRail) {
      return false;
    }
    const text = collapseText(element.textContent || "");
    return /activity|sources|thinking/i.test(text);
  }

  function resolveHostSidePanelFrame(panel, viewportWidth) {
    let resolved = panel;
    let current = panel?.parentElement || null;

    while (current && current !== document.body) {
      if (isLikelyHostSidePanelFrame(current, viewportWidth)) {
        const currentRect = current.getBoundingClientRect();
        const resolvedRect = resolved.getBoundingClientRect?.();
        const currentArea = currentRect.width * currentRect.height;
        const resolvedArea = resolvedRect
          ? resolvedRect.width * resolvedRect.height
          : 0;
        const currentHasCloseControl = Boolean(
          getInteractiveElements(current).find(isCloseControl),
        );
        const resolvedHasCloseControl = Boolean(
          getInteractiveElements(resolved).find(isCloseControl),
        );
        if (
          (currentHasCloseControl && !resolvedHasCloseControl) ||
          currentArea >= resolvedArea
        ) {
          resolved = current;
        }
      }
      current = current.parentElement;
    }

    return resolved;
  }

  function isCloseControl(element) {
    const label = getElementLabel(element);
    return /(^[x×]$|close|dismiss|chiudi)/i.test(label);
  }

  function getHostSidePanel() {
    const viewportWidth =
      root.innerWidth || document.documentElement.clientWidth || 1280;
    const explicit = safeQuerySelector(hostSidePanelSelectors, document);
    if (explicit && isVisibleElement(explicit) && !isChronoChatNode(explicit)) {
      return resolveHostSidePanelFrame(explicit, viewportWidth);
    }

    const candidates = safeQuerySelectorAll(
      ["aside", "[role='dialog']", "section", "div"],
      document,
    ).filter((element) => {
      return isLikelyHostSidePanelFrame(element, viewportWidth);
    });

    candidates.sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return rightRect.width * rightRect.height - leftRect.width * leftRect.height;
    });

    return resolveHostSidePanelFrame(candidates[0] || null, viewportWidth);
  }

  function getHostSidePanelCloseButton(panel) {
    return getInteractiveElements(panel).find(isCloseControl) || null;
  }

  function getHostLeftRailWidth() {
    const viewportHeight =
      root.innerHeight || document.documentElement.clientHeight || 720;

    const candidates = safeQuerySelectorAll(
      ["aside", "nav", "[role='navigation']", "div"],
      document,
    ).filter((element) => {
      if (!isVisibleElement(element) || isChronoChatNode(element)) {
        return false;
      }

      const rect = element.getBoundingClientRect?.();
      if (!rect || rect.width < 48 || rect.width > 240 || rect.height < viewportHeight * 0.45) {
        return false;
      }

      if (rect.left > 16 || rect.right > 260) {
        return false;
      }

      return true;
    });

    return candidates.reduce((maxRight, element) => {
      const rect = element.getBoundingClientRect?.();
      return rect ? Math.max(maxRight, Math.round(rect.right)) : maxRight;
    }, 0);
  }

  function collectMessages() {
    const container = getChatContainer();
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
        domNode: content.contentNode || node,
      });
      return messages;
    }, []);
  }

  function resolveMessageScrollTarget(node) {
    if (!node || !node.isConnected) return null;

    const roleAnchor = node.closest?.("[data-message-author-role]");
    if (roleAnchor) return roleAnchor;

    const conversationTurnAnchor = node.closest?.(
      "[data-testid*='conversation-turn'], .group\\/conversation-turn, article[data-testid*='conversation-turn']",
    );
    if (conversationTurnAnchor) return conversationTurnAnchor;

    let current = node;
    while (current && current !== document.body) {
      const className = String(current.className || "");
      if (
        className.includes("conversation-turn") ||
        className.includes("assistant-message") ||
        className.includes("user-message")
      ) {
        return current;
      }
      current = current.parentElement;
    }

    return node;
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
    getConversationActionBar,
    getConversationActionReference,
    getHostLeftRail,
    getHostActivityToggle,
    getHostSidePanel,
    getHostSidePanelCloseButton,
    getHostLeftRailWidth,
    getElementLabel,
    getInteractiveElements,
    isChronoChatNode,
    resolveMessageScrollTarget,
  };
})(globalThis);
