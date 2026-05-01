(function (root) {
  const ns = root.__JTC__;
  const state = ns.state;
  const {
    primaryMessageSelectors,
    fallbackMessageSelectors,
    chatContainerSelectors,
    hostActionBarSelectors,
    hostSidePanelSelectors,
    fileExtensionPattern,
  } = ns.constants;
  const fileExtensionRegex = new RegExp(fileExtensionPattern, "i");

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

  function normalizeInlineText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeInlineMarkdown(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.replace(/[ \t]+/g, " ").trim())
      .join("\n")
      .replace(/\n{2,}/g, "\n")
      .trim();
  }

  function cleanInlineMarkdown(value) {
    return value
      .replace(/[ \t]+([,.;:!?%)\]])/g, "$1")
      .replace(/([([€$])[ \t]+/g, "$1")
      .replace(/[ \t]+’/g, "’")
      .trim();
  }

  function normalizeMarkdown(value) {
    const lines = String(value || "")
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.replace(/[ \t]+$/g, ""));

    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();

    return lines
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function isChronoChatNode(element) {
    if (!element) return false;
    if (
      element.id === "chatgpt-nav-sidebar" ||
      element.id === "chatgpt-nav-toggle" ||
      element.id === "chatgpt-nav-toggle-slot" ||
      element.id === "chatgpt-nav-edge-toggle"
    ) {
      return true;
    }
    return Boolean(
      element.closest?.(
        "#chatgpt-nav-sidebar, #chatgpt-nav-toggle, #chatgpt-nav-toggle-slot, #chatgpt-nav-edge-toggle",
      ),
    );
  }

  function isInteractiveElement(element) {
    return Boolean(
      element?.matches?.("button, [role='button'], a, summary"),
    );
  }

  function hasAttachmentSignal(element) {
    return Boolean(
      element?.querySelector?.(
        [
          "img[src]",
          '[data-testid*="file" i]',
          '[class*="file-tile" i]',
          '[role="group"][aria-label]',
          'canvas[data-testid="data-grid-canvas"]',
          'table[role="grid"]',
          '[role="grid"]',
          "a[href][download]",
        ].join(", "),
      ),
    );
  }

  function getMediaRoleHint(element) {
    const image = element?.matches?.("img")
      ? element
      : element?.querySelector?.("img[alt], img[aria-label], img[title]");
    const label = collapseText(
      image?.getAttribute?.("alt") ||
        image?.getAttribute?.("aria-label") ||
        image?.getAttribute?.("title") ||
        "",
    );

    if (/generated image/i.test(label)) return "assistant";
    if (/uploaded image/i.test(label)) return "user";
    return "unknown";
  }

  function hasMeaningfulText(element) {
    if (hasAttachmentSignal(element)) {
      return true;
    }
    return collapseText(element?.textContent || "").length >= 8;
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

  function getUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
      return new URL(raw, root.location?.href || "https://chatgpt.com/").href;
    } catch (_) {
      return raw;
    }
  }

  function getFilenameFromUrl(url) {
    try {
      const parsed = new URL(url, root.location?.href || "https://chatgpt.com/");
      const last = parsed.pathname.split("/").filter(Boolean).pop() || "";
      return decodeURIComponent(last);
    } catch (_) {
      return "";
    }
  }

  function getFilenameFromLabel(label) {
    const match = String(label || "").match(
      /([^"'<>|\n\r]*?\.(?:pdf|csv|docx?|xlsx?|pptx?|txt|md|json|zip|png|jpe?g|gif|webp|svg|heic|avif))(?:$|[\s"'<>|])/i,
    );
    return collapseText(match?.[1] || "").replace(
      /^(open|download|save|scarica|salva)\s+/i,
      "",
    );
  }

  function getFileExtension(nameOrUrl) {
    const match = String(nameOrUrl || "").match(/\.([a-z0-9]{2,5})(?:$|\?|#)/i);
    return match ? match[1].toUpperCase() : "";
  }

  function getAttachmentKind(name, url, typeLabel) {
    const value = `${name} ${url} ${typeLabel}`.toLowerCase();
    if (/\.(png|jpe?g|gif|webp|svg|heic|avif)(?:$|\?|#)/i.test(value)) return "image";
    if (/image/.test(value)) return "image";
    return "file";
  }

  function getAttachmentTypeLabel(name, url, fallback = "") {
    const extension = getFileExtension(name) || getFileExtension(url);
    return extension || collapseText(fallback).slice(0, 24) || "File";
  }

  function hashValue(value) {
    let hash = 0;
    const text = String(value || "");
    for (let index = 0; index < text.length; index += 1) {
      hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
    }
    return hash.toString(36);
  }

  function createAttachment({
    name,
    url = "",
    typeLabel = "",
    kind,
    messageIndex,
    role,
    domNode,
    actionNode,
    downloadNode,
  }) {
    const normalizedUrl = getUrl(url);
    const fallbackName = getFilenameFromUrl(normalizedUrl);
    const displayName = collapseText(name || fallbackName || "Untitled file");
    const resolvedType = getAttachmentTypeLabel(displayName, normalizedUrl, typeLabel);
    const resolvedKind = kind || getAttachmentKind(displayName, normalizedUrl, resolvedType);
    const cacheSeed = `${state.conversation.id}|${messageIndex}|${role}|${displayName}|${normalizedUrl}`;
    const cacheKey = hashValue(cacheSeed);
    return {
      id: `att-${messageIndex}-${cacheKey.slice(0, 10)}`,
      cacheKey,
      messageIndex,
      role,
      kind: resolvedKind,
      name: displayName,
      typeLabel: resolvedKind === "image" && resolvedType === "File" ? "Image" : resolvedType,
      url: normalizedUrl,
      thumbnailUrl: resolvedKind === "image" ? normalizedUrl : "",
      domNode,
      actionNode,
      downloadNode,
    };
  }

  function getDirectText(element) {
    return collapseText(
      Array.from(element?.childNodes || [])
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.nodeValue || "")
        .join(" "),
    );
  }

  function isLikelyFileTile(element) {
    if (!element || isChronoChatNode(element)) return false;
    const label = getElementLabel(element);
    const className = String(element.className || "");
    const hasFileClass = /file|attachment|upload/i.test(className);
    const hasFileData =
      /file|attachment|upload/i.test(element.getAttribute?.("data-testid") || "") ||
      Boolean(element.querySelector?.('[data-testid*="file" i],[class*="file" i]'));
    return Boolean(
      label &&
        (hasFileClass ||
          hasFileData ||
          fileExtensionRegex.test(label)),
    );
  }

  function extractFileTileAttachment(tile, messageIndex, role) {
    const label = getElementLabel(tile);
    const link = tile.matches?.("a[href]") ? tile : tile.querySelector?.("a[href]");
    const controls = [
      ...(isInteractiveElement(tile) ? [tile] : []),
      ...Array.from(tile.querySelectorAll("a[href], button, [role='button']")),
    ];
    const downloadNode = controls.find((button) =>
      /download|save|scarica|salva/i.test(getElementLabel(button)),
    );
    const actionNode =
      link ||
      controls.find(
        (control) =>
          !control.matches?.("[role='combobox']") &&
          !/download|save|scarica|salva/i.test(getElementLabel(control)),
      );
    const typeLabel =
      collapseText(
        Array.from(tile.querySelectorAll("div, span"))
          .map((element) => element.textContent || "")
          .find((text) => /\b(pdf|csv|docx?|xlsx?|pptx?|image|png|jpe?g|zip)\b/i.test(text)) ||
          "",
      ) || getFileExtension(label);
    return createAttachment({
      name: getFilenameFromLabel(label) || label,
      url: link?.getAttribute?.("href") || "",
      typeLabel,
      messageIndex,
      role,
      domNode: tile,
      actionNode,
      downloadNode,
    });
  }

  function extractImageAttachment(image, messageIndex, role) {
    const src = image.getAttribute("src") || image.currentSrc || "";
    if (!src) return null;
    const name =
      image.getAttribute("alt") ||
      image.getAttribute("aria-label") ||
      image.getAttribute("title") ||
      getFilenameFromUrl(src) ||
      `image-${messageIndex + 1}.png`;
    return createAttachment({
      name,
      url: src,
      typeLabel: "Image",
      kind: "image",
      messageIndex,
      role,
      domNode: image,
    });
  }

  function extractLinkAttachment(link, messageIndex, role) {
    const href = link.getAttribute("href") || "";
    const label = getElementLabel(link) || getFilenameFromUrl(href);
    if (!href || (!link.hasAttribute("download") && !fileExtensionRegex.test(`${href} ${label}`))) {
      return null;
    }
    return createAttachment({
      name: label || getFilenameFromUrl(href),
      url: href,
      messageIndex,
      role,
      domNode: link,
    });
  }

  function isLikelySpreadsheetArtifact(element) {
    if (!element || isChronoChatNode(element)) return false;
    return Boolean(
      element.querySelector?.(
        'canvas[data-testid="data-grid-canvas"], table[role="grid"], [role="grid"]',
      ),
    );
  }

  function getSpreadsheetArtifactName(element) {
    const candidates = Array.from(
      element.querySelectorAll("span.font-semibold, [class*='font-semibold']"),
    )
      .map((candidate) => getDirectText(candidate) || getElementLabel(candidate))
      .map((value) =>
        value
          .replace(/\bSheet\d+\b.*$/i, "")
          .replace(/\bgrid\b.*$/i, "")
          .trim(),
      )
      .filter(Boolean);
    return candidates[0] || "Spreadsheet artifact";
  }

  function getSpreadsheetActionNode(element) {
    const titleRow =
      element.querySelector?.(".justify-between") ||
      element.querySelector?.("[class*='justify-between']") ||
      element;
    return (
      Array.from(titleRow.querySelectorAll("button"))
        .filter((button) => button.getAttribute("role") !== "combobox")
        .find((button) => isVisibleElement(button)) || null
    );
  }

  function getSpreadsheetDownloadNode(element) {
    const titleRow =
      element.querySelector?.(".justify-between") ||
      element.querySelector?.("[class*='justify-between']") ||
      element;
    const buttons = Array.from(titleRow.querySelectorAll("button")).filter(
      (button) => button.getAttribute("role") !== "combobox" && isVisibleElement(button),
    );
    return (
      buttons.find((button) => /download|save|scarica|salva/i.test(getElementLabel(button))) ||
      buttons[1] ||
      null
    );
  }

  function extractSpreadsheetAttachment(element, messageIndex, role) {
    return createAttachment({
      name: getSpreadsheetArtifactName(element),
      typeLabel: "Sheet",
      kind: "spreadsheet",
      messageIndex,
      role,
      domNode: element,
      actionNode: getSpreadsheetActionNode(element),
      downloadNode: getSpreadsheetDownloadNode(element),
    });
  }

  function extractAttachments(node, messageIndex, role) {
    const attachments = [];
    const seen = new Set();
    const seenSpreadsheetNodes = new Set();
    const push = (attachment) => {
      if (!attachment) return;
      if (attachment.kind === "spreadsheet" && attachment.domNode) {
        if (seenSpreadsheetNodes.has(attachment.domNode)) return;
        seenSpreadsheetNodes.add(attachment.domNode);
        attachments.push(attachment);
        return;
      }
      const key = `${attachment.name}|${attachment.url}|${attachment.kind}`;
      if (seen.has(key)) return;
      seen.add(key);
      attachments.push(attachment);
    };

    safeQuerySelectorAll(
      [
        '[role="group"][aria-label]',
        '[data-testid*="file" i]',
        '[class*="file-tile" i]',
        'a[aria-label*=".pdf" i], button[aria-label*=".pdf" i], [role="button"][aria-label*=".pdf" i]',
        'a[aria-label*=".doc" i], button[aria-label*=".doc" i], [role="button"][aria-label*=".doc" i]',
        'a[aria-label*=".csv" i], button[aria-label*=".csv" i], [role="button"][aria-label*=".csv" i]',
        'a[aria-label*=".xls" i], button[aria-label*=".xls" i], [role="button"][aria-label*=".xls" i]',
        'a[aria-label*=".ppt" i], button[aria-label*=".ppt" i], [role="button"][aria-label*=".ppt" i]',
        'a[aria-label*=".json" i], button[aria-label*=".json" i], [role="button"][aria-label*=".json" i]',
        'a[aria-label*=".md" i], button[aria-label*=".md" i], [role="button"][aria-label*=".md" i]',
        'a[aria-label*=".txt" i], button[aria-label*=".txt" i], [role="button"][aria-label*=".txt" i]',
        'a[title*=".pdf" i], button[title*=".pdf" i], [role="button"][title*=".pdf" i]',
        'a[title*=".doc" i], button[title*=".doc" i], [role="button"][title*=".doc" i]',
        'a[title*=".csv" i], button[title*=".csv" i], [role="button"][title*=".csv" i]',
        'a[title*=".xls" i], button[title*=".xls" i], [role="button"][title*=".xls" i]',
      ].join(", "),
      node,
    )
      .filter(isLikelyFileTile)
      .forEach((tile) => push(extractFileTileAttachment(tile, messageIndex, role)));

    safeQuerySelectorAll(
      'canvas[data-testid="data-grid-canvas"], table[role="grid"], [role="grid"]',
      node,
    ).forEach((grid) => {
      const artifact =
        grid.closest?.(".rounded-2xl") ||
        grid.closest?.("[class*='rounded-2xl']") ||
        grid.closest?.("[class*='overflow-hidden']") ||
        grid.parentElement;
      if (isLikelySpreadsheetArtifact(artifact)) {
        push(extractSpreadsheetAttachment(artifact, messageIndex, role));
      }
    });

    safeQuerySelectorAll("img[src]", node)
      .filter(
        (image) =>
          isVisibleElement(image) &&
          !isChronoChatNode(image) &&
          !image.closest?.('[role="group"][aria-label]'),
      )
      .forEach((image) => push(extractImageAttachment(image, messageIndex, role)));

    safeQuerySelectorAll("a[href]", node)
      .filter(
        (link) =>
          !isChronoChatNode(link) && !link.closest?.('[role="group"][aria-label]'),
      )
      .forEach((link) => push(extractLinkAttachment(link, messageIndex, role)));

    return attachments;
  }

  function getAttachmentIdentity(attachment) {
    return `${attachment.name}|${attachment.url}|${attachment.kind}`;
  }

  function collectConversationAttachments(messages, rootNode) {
    const attachments = [];
    const seen = new Set();
    const seenSpreadsheetNodes = new Set();
    const push = (attachment) => {
      if (!attachment) return;
      if (attachment.kind === "spreadsheet" && attachment.domNode) {
        if (seenSpreadsheetNodes.has(attachment.domNode)) return;
        seenSpreadsheetNodes.add(attachment.domNode);
        attachments.push(attachment);
        return;
      }
      const identity = getAttachmentIdentity(attachment);
      if (seen.has(identity)) return;
      seen.add(identity);
      attachments.push(attachment);
    };

    messages.forEach((message) => {
      (message.attachments || []).forEach(push);
    });

    extractAttachments(rootNode || document, -1, "unknown").forEach(push);
    return attachments;
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

  function compareDocumentOrder(left, right) {
    if (left === right) return 0;
    const position = left.compareDocumentPosition?.(right) || 0;
    if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    return 0;
  }

  function getOrphanMediaMessageNodes(container, existingNodes) {
    const existing = Array.from(existingNodes || []);
    const seen = new Set();

    return safeQuerySelectorAll("img[src]", container || document)
      .filter((image) => {
        if (!isVisibleElement(image) || isChronoChatNode(image)) return false;
        if (getMediaRoleHint(image) === "unknown") return false;
        return !existing.some((node) => node === image || node.contains(image));
      })
      .map((image) => {
        return (
          image.closest?.("button, [role='button'], figure") ||
          image.parentElement ||
          image
        );
      })
      .filter((node) => {
        if (!node || seen.has(node)) return false;
        if (
          existing.some(
            (existingNode) =>
              existingNode === node || existingNode.contains(node),
          )
        ) {
          return false;
        }
        seen.add(node);
        return true;
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

    const mediaRoleHint = getMediaRoleHint(node);
    if (mediaRoleHint !== "unknown") return mediaRoleHint;

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
    if (node.querySelector?.('[data-testid="writing-block-container"]')) return false;
    if (
      node.querySelector?.(
        'form, textarea, [data-testid*="composer"], [class*="composer"], [placeholder]',
      )
    ) {
      return true;
    }
    if (node.matches?.("[data-message-author-role]")) return false;
    return Boolean(
      node.querySelector?.(
        '[contenteditable="true"], [contenteditable="plaintext-only"]',
      ),
    );
  }

  function getInlineMarkdown(node) {
    if (!node) return "";
    if (node.nodeType === Node.TEXT_NODE) {
      return normalizeInlineMarkdown(node.nodeValue);
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const tagName = node.tagName.toLowerCase();
    if (tagName === "br") return "\n";
    if (tagName === "code" && node.closest("pre") !== node.parentElement) {
      const code = normalizeInlineText(node.textContent || "");
      return code ? `\`${code.replace(/`/g, "\\`")}\`` : "";
    }

    const text = Array.from(node.childNodes)
      .map(getInlineMarkdown)
      .filter(Boolean)
      .join(" ");

    const normalized = cleanInlineMarkdown(
      normalizeInlineMarkdown(text.replace(/[ \t]*\n[ \t]*/g, "\n")),
    );
    if (!normalized) return "";
    if (tagName === "strong" || tagName === "b") return `**${normalized}**`;
    if (tagName === "em" || tagName === "i") return `*${normalized}*`;
    return normalized;
  }

  function getTableCellText(cell) {
    return normalizeInlineText(cell.textContent || "").replace(/\|/g, "\\|");
  }

  function tableToMarkdown(table) {
    const rows = Array.from(table.querySelectorAll("tr"))
      .map((row) => Array.from(row.children).map(getTableCellText))
      .filter((cells) => cells.length);
    if (!rows.length) return "";

    const columnCount = rows.reduce(
      (max, row) => Math.max(max, row.length),
      rows[0].length,
    );
    const normalizeRow = (row) =>
      Array.from({ length: columnCount }, (_, index) => row[index] || "");
    const [firstRow, ...restRows] = rows.map(normalizeRow);
    const separator = Array.from({ length: columnCount }, () => "---");
    return [firstRow, separator, ...restRows]
      .map((row) => `| ${row.join(" | ")} |`)
      .join("\n");
  }

  function codeFenceFromPre(pre) {
    const codeNode = pre.querySelector?.("code") || pre;
    const code = String(codeNode.textContent || "").replace(/\n+$/g, "");
    if (!code.trim()) return "";
    return `\`\`\`\n${code}\n\`\`\``;
  }

  function preWrapToMarkdown(element) {
    const text = Array.from(element.childNodes)
      .map((child) => {
        if (child.nodeType === Node.TEXT_NODE) return child.nodeValue || "";
        if (child.nodeType !== Node.ELEMENT_NODE) return "";
        if (child.tagName.toLowerCase() === "br") return "\n";
        return preWrapToMarkdown(child);
      })
      .join("");
    return normalizeInlineMarkdown(text);
  }

  function listToMarkdown(list) {
    const ordered = list.tagName.toLowerCase() === "ol";
    return Array.from(list.children)
      .filter((child) => child.tagName?.toLowerCase() === "li")
      .map((item, index) => {
        const marker = ordered ? `${index + 1}.` : "-";
        const nestedLists = Array.from(item.querySelectorAll(":scope > ul, :scope > ol"));
        const itemClone = item.cloneNode(true);
        itemClone.querySelectorAll(":scope > ul, :scope > ol").forEach((nested) => {
          nested.remove();
        });
        const label = getInlineMarkdown(itemClone);
        const nested = nestedLists
          .map(listToMarkdown)
          .filter(Boolean)
          .map((value) =>
            value
              .split("\n")
              .map((line) => `  ${line}`)
              .join("\n"),
          )
          .join("\n");
        return `${marker} ${label}${nested ? `\n${nested}` : ""}`;
      })
      .join("\n");
  }

  function isBlockElement(element) {
    return Boolean(
      element?.matches?.(
        "article, blockquote, div, h1, h2, h3, h4, h5, h6, li, main, ol, p, pre, section, table, ul",
      ),
    );
  }

  function writingBlockToMarkdown(element) {
    const title =
      getElementLabel(
        element.querySelector?.(
          '[data-testid="writing-block-header-surface"] [class*="truncate"]',
        ),
      ) ||
      getElementLabel(element.querySelector?.('[data-testid="writing-block-header-surface"]')) ||
      "Message";
    const editor =
      element.querySelector?.(".writing-block-editor .ProseMirror") ||
      element.querySelector?.(".writing-block-editor");
    const content = editor ? childrenToMarkdown(editor) : "";

    return normalizeMarkdown(
      [`**${title || "Message"}**`, content].filter(Boolean).join("\n\n"),
    );
  }

  function elementToMarkdown(element) {
    if (!element) return "";
    if (element.nodeType === Node.TEXT_NODE) {
      return normalizeInlineMarkdown(element.nodeValue);
    }
    if (element.nodeType !== Node.ELEMENT_NODE) return "";

    const tagName = element.tagName.toLowerCase();
    if (element.getAttribute?.("data-testid") === "writing-block-container") {
      return writingBlockToMarkdown(element);
    }
    if (element.matches?.(".whitespace-pre-wrap")) return preWrapToMarkdown(element);
    if (tagName === "pre") return codeFenceFromPre(element);
    if (tagName === "table") return tableToMarkdown(element);
    if (tagName === "ul" || tagName === "ol") return listToMarkdown(element);
    if (/^h[1-6]$/.test(tagName)) {
      const level = Number(tagName.slice(1));
      const text = getInlineMarkdown(element);
      return text ? `${"#".repeat(level)} ${text}` : "";
    }
    if (tagName === "blockquote") {
      const content = childrenToMarkdown(element);
      return content
        .split("\n")
        .map((line) => (line.trim() ? `> ${line}` : ">"))
        .join("\n");
    }
    if (tagName === "p") return getInlineMarkdown(element);
    if (tagName === "br") return "\n";

    const directBlockChildren = Array.from(element.childNodes).filter(
      (child) => child.nodeType === Node.ELEMENT_NODE && isBlockElement(child),
    );
    if (directBlockChildren.length) {
      return childrenToMarkdown(element);
    }

    const inline = getInlineMarkdown(element);
    if (inline.includes("\n")) return normalizeInlineMarkdown(inline);
    return inline;
  }

  function childrenToMarkdown(element) {
    return Array.from(element.childNodes)
      .map(elementToMarkdown)
      .filter((part) => part && part.trim())
      .join("\n\n");
  }

  function extractStructuredMarkdown(contentNode) {
    const markdown = normalizeMarkdown(elementToMarkdown(contentNode));
    if (markdown) return markdown;
    return normalizeMarkdown(contentNode.textContent || contentNode.innerText || "");
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

    const codeNodes = Array.from(clone.querySelectorAll("pre code, pre"));
    const codeText = collapseText(
      codeNodes.map((element) => element.textContent || "").join(" "),
    );
    const markdown = extractStructuredMarkdown(clone);
    const text = collapseText(markdown || clone.textContent || clone.innerText || "");

    if (text) {
      if (codeText && text === codeText) {
        return {
          fullText: codeFenceFromPre(codeNodes[0]?.closest?.("pre") || codeNodes[0]),
          previewText: `Code: ${codeText}`,
        };
      }

      return {
        fullText: markdown || text,
        previewText: text,
      };
    }

    if (hasAttachmentSignal(node)) {
      return {
        fullText: "Message contains an image or attachment",
        previewText: "Message contains an image or attachment",
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
      elements.find((element) => {
        const testId = element.getAttribute?.("data-testid") || "";
        return /share-chat-button|share/i.test(testId) || /share/i.test(getElementLabel(element));
      }) ||
      elements.find((element) => {
        const testId = element.getAttribute?.("data-testid") || "";
        return /activity/i.test(testId) || /activity/i.test(getElementLabel(element));
      }) ||
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
    nodes = [...nodes, ...getOrphanMediaMessageNodes(container || document, nodes)].sort(
      compareDocumentOrder,
    );
    nodes = filterRootMessageCandidates(nodes);

    const messages = nodes.reduce((collectedMessages, node) => {
      const content = extractMessageContent(node);
      if (!content) {
        return collectedMessages;
      }

      const messageIndex = collectedMessages.length;
      const role = inferRole(node, messageIndex);
      const attachments = extractAttachments(node, messageIndex, role);
      collectedMessages.push({
        index: messageIndex,
        role,
        preview: content.previewText,
        fullText: content.fullText,
        attachments,
        domNode: node,
      });
      return collectedMessages;
    }, []);

    state.conversation.attachments = collectConversationAttachments(
      messages,
      container || document,
    );
    return messages;
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
    normalizeMarkdown,
    filterRootMessageCandidates,
    isLikelyUiArtifact,
    getConversationActionBar,
    getConversationActionReference,
    getHostLeftRail,
    extractAttachments,
    getHostActivityToggle,
    getHostSidePanel,
    getHostSidePanelCloseButton,
    getHostLeftRailWidth,
    getElementLabel,
    getInteractiveElements,
    isChronoChatNode,
  };
})(globalThis);
