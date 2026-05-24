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

  function isLikelySourceOrActionChrome(element) {
    return Boolean(
      element?.closest?.(
        [
          '[aria-label="Your message actions"]',
          '[aria-label="Response actions"]',
          '[aria-label*="source" i]',
          '[data-testid*="source" i]',
          '[class*="source" i]',
          '[aria-label*="citation" i]',
          '[data-testid*="citation" i]',
          '[class*="citation" i]',
          '[aria-label*="copy" i]',
          '[aria-label*="share" i]',
          '[aria-label*="feedback" i]',
          '[aria-label*="thumb" i]',
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

  function isLikelyImageAttachment(image) {
    if (!isVisibleElement(image) || isChronoChatNode(image)) return false;
    if (image.closest?.('[role="group"][aria-label]')) return false;
    if (isLikelySourceOrActionChrome(image)) return false;
    if (getMediaRoleHint(image) !== "unknown") return true;

    const label = collapseText(
      image.getAttribute?.("alt") ||
        image.getAttribute?.("aria-label") ||
        image.getAttribute?.("title") ||
        "",
    );
    const source = image.getAttribute?.("src") || image.currentSrc || "";
    const hasImageName = /\.(png|jpe?g|gif|webp|svg|heic|avif)(?:$|[\s?#])/i.test(
      `${label} ${source}`,
    );
    if (!hasImageName) return false;

    const rect = image.getBoundingClientRect?.();
    if (!rect || (!rect.width && !rect.height)) {
      return !image.closest?.("button, [role='button'], a, summary");
    }
    return rect.width >= 80 || rect.height >= 80;
  }

  function hasAttachmentOnlyMessageSignal(element) {
    if (!element) return false;
    if (
      element.querySelector?.(
        [
          '[data-testid*="file" i]',
          '[class*="file-tile" i]',
          'canvas[data-testid="data-grid-canvas"]',
          'table[role="grid"]',
          '[role="grid"]',
          "a[href][download]",
        ].join(", "),
      )
    ) {
      return true;
    }
    return safeQuerySelectorAll("img[src]", element).some(isLikelyImageAttachment);
  }

  function hasMeaningfulText(element) {
    if (hasAttachmentOnlyMessageSignal(element)) {
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
    fileId,
    pointer,
    backendConversationId,
    backendMessageId,
    backendGizmoId,
    backendSource,
    metadata,
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
      fileId,
      pointer,
      backendConversationId,
      backendMessageId,
      backendGizmoId,
      backendSource,
      metadata,
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
      .filter(isLikelyImageAttachment)
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
    const source =
      attachment.kind === "image"
        ? attachment.url || attachment.fileId || attachment.pointer || ""
        : "";
    return `${attachment.name}|${attachment.kind}|${source}`;
  }

  function hasReadableAttachmentSource(attachment) {
    return Boolean(
      attachment?.url ||
        attachment?.fileId ||
        attachment?.pointer?.startsWith?.("sandbox:"),
    );
  }

  function collectConversationAttachments(messages, rootNode) {
    const attachments = [];
    const seen = new Map();
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
      if (seen.has(identity)) {
        const existingIndex = seen.get(identity);
        const existing = attachments[existingIndex];
        if (!hasReadableAttachmentSource(existing) && hasReadableAttachmentSource(attachment)) {
          attachments[existingIndex] = attachment;
        }
        return;
      }
      seen.set(identity, attachments.length);
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
        !isLikelyUiArtifact(node) &&
        !isChronoChatNode(node),
    );

    return candidates.filter((node) => {
      return !candidates.some(
        (other) => other !== node && other.contains(node),
      );
    });
  }

  function getRoleHeadingInfo(element) {
    const label = collapseText(element?.textContent || "");
    if (/^you said:?$/i.test(label)) return { role: "user" };
    if (/^chatgpt said:?$/i.test(label)) return { role: "assistant" };
    return null;
  }

  function getRoleHeadingNodes(context) {
    return safeQuerySelectorAll("h1, h2, h3, h4, h5, h6, [role='heading']", context)
      .filter((element) => getRoleHeadingInfo(element));
  }

  function countRoleHeadings(element) {
    return getRoleHeadingNodes(element).length;
  }

  function resolveRoleHeadingMessageNode(heading, boundary) {
    let current = heading?.parentElement || null;
    let best = null;
    let depth = 0;

    while (
      current &&
      current !== document.body &&
      current !== boundary?.parentElement &&
      depth < 8
    ) {
      if (isChronoChatNode(current) || isLikelyUiArtifact(current)) {
        break;
      }

      const headingCount = countRoleHeadings(current);
      if (headingCount > 1) {
        break;
      }

      if (headingCount === 1 && hasMeaningfulText(current)) {
        best = current;
      }

      current = current.parentElement;
      depth += 1;
    }

    return best;
  }

  function getRoleHeadingMessageNodes(context) {
    const boundary = context || document;
    const seen = new Set();
    return getRoleHeadingNodes(boundary)
      .map((heading) => resolveRoleHeadingMessageNode(heading, boundary))
      .filter((node) => {
        if (!node || seen.has(node)) return false;
        seen.add(node);
        return true;
      });
  }

  function getMessageActionInfo(element) {
    const label = getElementLabel(element);
    if (/^your message actions$/i.test(label)) return { role: "user" };
    if (/^response actions$/i.test(label)) return { role: "assistant" };
    return null;
  }

  function getMessageActionNodes(context) {
    return safeQuerySelectorAll("[aria-label], [role='group'], div", context).filter((element) =>
      getMessageActionInfo(element),
    );
  }

  function countMessageActions(element) {
    return getMessageActionNodes(element).length;
  }

  function countRoleMarkers(element) {
    const selfMarker = element?.matches?.("[data-message-author-role]") ? 1 : 0;
    return selfMarker + safeQuerySelectorAll("[data-message-author-role]", element).length;
  }

  function isSingleTurnCandidate(element) {
    if (!element) return false;
    return (
      countRoleHeadings(element) <= 1 &&
      countMessageActions(element) <= 1 &&
      countRoleMarkers(element) <= 1
    );
  }

  function resolveActionDelimitedMessageNode(actionNode, boundary) {
    let current = actionNode?.parentElement || null;
    let best = null;
    let depth = 0;

    while (
      current &&
      current !== document.body &&
      current !== boundary?.parentElement &&
      depth < 8
    ) {
      if (isChronoChatNode(current) || isLikelyUiArtifact(current)) {
        break;
      }

      const actionCount = countMessageActions(current);
      if (actionCount > 1) {
        break;
      }

      if (actionCount === 1 && hasMeaningfulText(current)) {
        best = current;
      }

      current = current.parentElement;
      depth += 1;
    }

    return best;
  }

  function getActionDelimitedMessageNodes(context) {
    const boundary = context || document;
    const seen = new Set();
    return getMessageActionNodes(boundary)
      .map((actionNode) => resolveActionDelimitedMessageNode(actionNode, boundary))
      .filter((node) => {
        if (!node || seen.has(node)) return false;
        seen.add(node);
        return true;
      });
  }

  function parseRgbColor(value) {
    const match = String(value || "").match(
      /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+%?))?/i,
    );
    if (!match) return null;
    const alphaValue = match[4];
    const alpha = alphaValue?.endsWith?.("%")
      ? Number.parseFloat(alphaValue) / 100
      : alphaValue === undefined
        ? 1
        : Number.parseFloat(alphaValue);
    return {
      r: Number(match[1]),
      g: Number(match[2]),
      b: Number(match[3]),
      a: Number.isFinite(alpha) ? alpha : 1,
    };
  }

  function getColorLuminance(color) {
    return color ? (color.r * 299 + color.g * 587 + color.b * 114) / 1000 : 255;
  }

  function getVisualBubbleFrame(element) {
    if (!element || isChronoChatNode(element) || !isVisibleElement(element)) return null;
    if (
      element.matches?.(
        "[data-message-author-role], [data-testid*='conversation-turn'], [aria-label='Your message actions'], [aria-label='Response actions']",
      )
    ) {
      return null;
    }

    const text = collapseText(element.textContent || "");
    if (text.length < 4 || text.length > 1200) return null;

    const viewportWidth = root.innerWidth || document.documentElement.clientWidth || 1280;
    let current = element;
    let depth = 0;

    while (current && current !== document.body && depth < 5) {
      if (isChronoChatNode(current) || !isVisibleElement(current)) {
        return null;
      }
      if (
        current.matches?.(
          "[data-message-author-role], [data-testid*='conversation-turn'], [aria-label='Your message actions'], [aria-label='Response actions']",
        )
      ) {
        return null;
      }

      const currentText = collapseText(current.textContent || "");
      if (currentText !== text) {
        break;
      }

      const rect = current.getBoundingClientRect?.();
      if (rect && rect.width >= 32 && rect.height >= 16 && rect.width <= viewportWidth * 0.72) {
        const rightAligned =
          rect.left >= viewportWidth * 0.32 && rect.right >= viewportWidth * 0.58;
        const style = root.getComputedStyle?.(current);
        const background = parseRgbColor(style?.backgroundColor);
        const backgroundLuminance = getColorLuminance(background);
        const radii = [
          style?.borderTopLeftRadius,
          style?.borderTopRightRadius,
          style?.borderBottomLeftRadius,
          style?.borderBottomRightRadius,
          style?.borderRadius,
        ].map((value) => Number.parseFloat(value || "0"));
        const borderRadius = Math.max(...radii.filter(Number.isFinite), 0);

        if (
          rightAligned &&
          background &&
          background.a >= 0.1 &&
          backgroundLuminance < 112 &&
          borderRadius >= 8
        ) {
          if (
            current.querySelector?.(
              [
                "button",
                "[role='button']",
                "a",
                "form",
                "textarea",
                "table",
                "pre",
                "img",
                "canvas",
                "[role='grid']",
                "h1",
                "h2",
                "h3",
                "h4",
                "h5",
                "h6",
                "[role='heading']",
                "[aria-label='Your message actions']",
                "[aria-label='Response actions']",
              ].join(", "),
            )
          ) {
            return null;
          }
          return current;
        }
      }

      current = current.parentElement;
      depth += 1;
    }

    return null;
  }

  function isLikelyVisualUserBubble(element) {
    return Boolean(getVisualBubbleFrame(element));
  }

  function getVisualUserBubbleNodes(context, existingNodes = []) {
    const seen = new Set();
    const nodes = [];
    safeQuerySelectorAll("div, p, span", context || document).forEach((node) => {
      const frame = getVisualBubbleFrame(node);
      if (!frame || seen.has(frame)) return;
      if (existingNodes.some((existing) => hasPrimaryTurnRelationship(frame, [existing]))) {
        return;
      }
      seen.add(frame);
      nodes.push(frame);
    });
    return nodes;
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

    const roleHeading = getRoleHeadingNodes(node)[0];
    const roleHeadingInfo = getRoleHeadingInfo(roleHeading);
    if (roleHeadingInfo?.role) return roleHeadingInfo.role;

    const messageAction = getMessageActionNodes(node)[0];
    const messageActionInfo = getMessageActionInfo(messageAction);
    if (messageActionInfo?.role) return messageActionInfo.role;

    if (isLikelyVisualUserBubble(node)) return "user";

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
    const label = getElementLabel(node);
    if (
      /open profile menu|profile image/i.test(label) ||
      node.closest?.('[aria-label*="profile menu" i], [aria-label*="account" i]') ||
      node.querySelector?.('img[alt*="Profile" i], [aria-label*="profile menu" i]')
    ) {
      return true;
    }
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

    const explicitTurnNode = Boolean(
      node.matches?.("[data-message-author-role], [data-testid*='conversation-turn'], article[data-testid*='conversation-turn']") ||
        getRoleHeadingNodes(node).length,
    );
    let contentNode = safeQuerySelector(textSelectors, node);
    if (!contentNode) {
      const divs = Array.from(node.querySelectorAll("div"));
      contentNode =
        explicitTurnNode
          ? node
          : divs.find((element) => collapseText(element.textContent).length > 12) || node;
    }

    const clone = contentNode.cloneNode(true);
    clone
      .querySelectorAll(
        'button, [class*="icon"], form, textarea, .flex.absolute, .sr-only, nav, header, footer, [aria-label="Your message actions"], [aria-label="Response actions"]',
      )
      .forEach((element) => element.remove());
    getRoleHeadingNodes(clone).forEach((element) => element.remove());

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

    if (hasAttachmentOnlyMessageSignal(node)) {
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

  function getBackendConversationId(url = root.location?.href || "") {
    try {
      const parsed = new URL(url, root.location?.origin || "https://chatgpt.com");
      const match = (parsed.pathname || "").match(/\/c\/([^/]+)/);
      return match?.[1] || "";
    } catch (_) {
      return "";
    }
  }

  function extractBackendTextPart(part, depth = 0) {
    if (part == null || depth > 5) return "";
    if (typeof part === "string" || typeof part === "number" || typeof part === "boolean") {
      return String(part);
    }
    if (Array.isArray(part)) {
      return part
        .map((item) => extractBackendTextPart(item, depth + 1))
        .filter(Boolean)
        .join("\n");
    }
    if (typeof part !== "object") return "";

    const directValue =
      part.text ||
      part.content ||
      part.value ||
      part.transcript ||
      part.result ||
      "";
    if (typeof directValue === "string" && directValue.trim()) {
      return directValue;
    }

    const nestedCandidates = [
      part.parts,
      part.children,
      part.items,
      part.content_parts,
      part.text_parts,
    ];
    return nestedCandidates
      .map((candidate) => extractBackendTextPart(candidate, depth + 1))
      .filter(Boolean)
      .join("\n");
  }

  function extractBackendMessageText(message) {
    const content = message?.content;
    if (!content) return "";
    const text = content.parts
      ? extractBackendTextPart(content.parts)
      : extractBackendTextPart(content);
    return normalizeMarkdown(text);
  }

  function getBackendChainNodes(payload) {
    const mapping = payload?.mapping;
    if (!mapping || typeof mapping !== "object") return [];
    const chain = [];
    const seen = new Set();
    let currentId = payload.current_node;

    while (currentId && mapping[currentId] && !seen.has(currentId)) {
      seen.add(currentId);
      chain.push(mapping[currentId]);
      currentId = mapping[currentId]?.parent;
    }

    if (chain.length) {
      return chain.reverse();
    }

    return Object.values(mapping).sort((left, right) => {
      const leftTime = Number(left?.message?.create_time || 0);
      const rightTime = Number(right?.message?.create_time || 0);
      if (leftTime !== rightTime) return leftTime - rightTime;
      return String(left?.id || "").localeCompare(String(right?.id || ""));
    });
  }

  function collectBackendMessagesFromPayload(payload) {
    const messages = [];
    getBackendChainNodes(payload).forEach((node) => {
      const message = node?.message;
      const role = normalizeRoleValue(message?.author?.role || "");
      if (role !== "user" && role !== "assistant") return;
      if (message?.metadata?.is_visually_hidden_from_conversation) return;

      const fullText = extractBackendMessageText(message);
      if (!fullText) return;
      const preview = collapseText(fullText);
      if (!preview) return;

      messages.push({
        index: messages.length,
        role,
        preview,
        fullText,
        attachments: collectBackendMessageAttachments(
          message,
          messages.length,
          role,
          payload,
        ),
        domNode: null,
        source: "backend",
      });
    });
    return messages;
  }

  function collectMessagesFromDocument(sourceDocument) {
    const doc = sourceDocument || document;
    const turnNodes = safeQuerySelectorAll(
      "section[data-testid^='conversation-turn-'], [data-testid^='conversation-turn-']",
      doc,
    );
    const messages = [];
    const seen = new Set();

    turnNodes.forEach((turnNode) => {
      const turnRole = normalizeRoleValue(turnNode.getAttribute?.("data-turn"));
      const headingRole = getRoleHeadingInfo(getRoleHeadingNodes(turnNode)[0])?.role || "unknown";
      const attrRole = normalizeRoleValue(
        turnNode
          .querySelector?.("[data-message-author-role]")
          ?.getAttribute?.("data-message-author-role"),
      );
      const role =
        turnRole !== "unknown"
          ? turnRole
          : headingRole !== "unknown"
            ? headingRole
            : attrRole;
      if (role !== "user" && role !== "assistant") return;

      const roleNode =
        turnNode.querySelector?.(`[data-message-author-role="${role}"]`) ||
        turnNode.querySelector?.("[data-message-author-role]") ||
        turnNode;
      const contentNode =
        roleNode.querySelector?.(".markdown, .whitespace-pre-wrap") ||
        roleNode.querySelector?.("[data-start], p, pre, table, ol, ul") ||
        roleNode;
      const clone = contentNode.cloneNode(true);
      clone
        .querySelectorAll?.(
          [
            "button",
            "[role='button']",
            "[aria-label='Your message actions']",
            "[aria-label='Response actions']",
            "[data-testid*='turn-action']",
            "[data-testid*='copy']",
          ].join(", "),
        )
        .forEach((node) => node.remove());

      const fullText = normalizeMarkdown(clone.innerText || clone.textContent || "");
      const preview = collapseText(fullText);
      if (!preview) return;

      const key = `${role}|${preview.toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      messages.push({
        index: messages.length,
        role,
        preview,
        fullText,
        attachments: [],
        domNode: null,
        source: "offscreen-dom",
      });
    });

    return messages;
  }

  async function getBackendAuthHeaders() {
    const headers = {};
    try {
      const sessionEndpoint = new URL(
        "/api/auth/session",
        root.location?.origin || "https://chatgpt.com",
      ).toString();
      const sessionResponse = await root.fetch(sessionEndpoint, {
        credentials: "include",
      });
      if (!sessionResponse?.ok) return headers;
      const session = await sessionResponse.json();
      const accessToken = session?.accessToken;
      if (!accessToken) return headers;

      headers.Authorization = `Bearer ${accessToken}`;
      headers["X-Authorization"] = `Bearer ${accessToken}`;

      const accountId = await getBackendAccountId(headers);
      if (accountId) headers["Chatgpt-Account-Id"] = accountId;
    } catch (_) {}
    return headers;
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

  async function getBackendAccountId(authHeaders) {
    try {
      const endpoint = new URL(
        "/backend-api/accounts/check/v4-2023-04-27",
        root.location?.origin || "https://chatgpt.com",
      ).toString();
      const response = await root.fetch(endpoint, {
        credentials: "include",
        headers: authHeaders,
      });
      if (!response?.ok) return "";
      const payload = await response.json();
      const accounts = payload?.accounts || {};
      const workspaceId = getWorkspaceCookieId();
      const workspaceAccount = workspaceId ? accounts[workspaceId] : null;
      const account =
        workspaceAccount ||
        Object.values(accounts).find((candidate) => candidate?.account?.account_id);
      return account?.account?.account_id || "";
    } catch (_) {
      return "";
    }
  }

  function fetchBackendPayloadViaPageBridge(conversationId) {
    if (!conversationId || typeof root.postMessage !== "function") {
      return Promise.resolve(null);
    }

    return injectPageBridge().then(() => new Promise((resolve) => {
      const requestId = `jtch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let settled = false;
      const cleanup = () => {
        root.removeEventListener?.("message", handleMessage);
        root.clearTimeout?.(timeoutId);
      };
      const finish = (payload) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(payload);
      };
      const handleMessage = (event) => {
        if (event.source && event.source !== root) return;
        const message = event.data;
        if (
          !message ||
          message.source !== "chronochat-page-bridge" ||
          message.type !== "fetchConversationResult" ||
          message.requestId !== requestId
        ) {
          return;
        }
        finish(message.ok && message.payload ? message.payload : null);
      };
      const timeoutId = root.setTimeout?.(() => finish(null), 1800);

      root.addEventListener?.("message", handleMessage);
      root.postMessage(
        {
          source: "chronochat-content",
          type: "fetchConversation",
          requestId,
          conversationId,
        },
        root.location?.origin || "*",
      );
    }));
  }

  function injectPageBridge() {
    if (document.documentElement.dataset.jtchPageBridgeInjected === "true") {
      return Promise.resolve();
    }
    if (typeof chrome === "undefined" || !chrome.runtime?.getURL) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("page_bridge.js");
      script.async = false;
      script.dataset.jtchPageBridge = "true";
      script.onload = () => {
        document.documentElement.dataset.jtchPageBridgeInjected = "true";
        script.remove();
        resolve();
      };
      script.onerror = () => {
        script.remove();
        resolve();
      };
      (document.head || document.documentElement).appendChild(script);
    });
  }

  function pointerToBackendFileId(pointer) {
    const match = String(pointer || "").match(/\bfile[-_][a-z0-9_-]+/i);
    return match?.[0] || "";
  }

  function getBackendFileName(ref) {
    const metadata = ref?.metadata || {};
    const pointerName = String(ref?.pointer || "").split("/").filter(Boolean).pop() || "";
    return collapseText(
      ref?.name ||
        metadata.name ||
        metadata.file_name ||
        metadata.filename ||
        metadata.title ||
        (ref?.url ? getFilenameFromUrl(ref.url) : "") ||
        pointerName ||
        ref?.fileId ||
        "ChatGPT file",
    );
  }

  function getBackendFileTypeLabel(ref) {
    const metadata = ref?.metadata || {};
    return (
      getFileExtension(ref?.name) ||
      getFileExtension(ref?.pointer) ||
      getFileExtension(ref?.url) ||
      getFileExtension(metadata.name || metadata.file_name || metadata.filename || "") ||
      getAttachmentTypeLabel("", "", metadata.mime_type || metadata.file_type || metadata.mime || "")
    );
  }

  function createBackendAttachment(ref, messageIndex, role, payload) {
    const pointer = String(ref?.pointer || "");
    const fileId = ref?.fileId || pointerToBackendFileId(pointer);
    const isImage =
      /image/i.test(`${ref?.metadata?.mime_type || ""} ${ref?.metadata?.file_type || ""}`) ||
      /\.(png|jpe?g|gif|webp|svg|heic|avif)(?:$|\?|#)/i.test(
        `${ref?.name || ""} ${pointer} ${ref?.url || ""}`,
      );
    return createAttachment({
      name: getBackendFileName({ ...ref, fileId }),
      url: ref?.url || (isInlineAssetPointer(pointer) ? pointer : ""),
      typeLabel: isImage ? "Image" : getBackendFileTypeLabel(ref),
      kind: isImage ? "image" : undefined,
      messageIndex,
      role,
      fileId,
      pointer,
      backendConversationId:
        ref?.conversationId ||
        payload?.conversation_id ||
        payload?.conversationId ||
        getBackendConversationId(),
      backendMessageId: ref?.messageId,
      backendGizmoId: ref?.gizmoId || payload?.gizmo_id || payload?.gizmoId || null,
      backendSource: ref?.source || "backend",
      metadata: ref?.metadata || null,
    });
  }

  function isInlineAssetPointer(value) {
    return /^https:\/\/(?:cdn\.oaistatic\.com|oaidalleapiprodscus\.blob\.core\.windows\.net)\//i.test(
      String(value || ""),
    );
  }

  function collectBackendRefsFromText(text, add) {
    String(text || "")
      .match(/\{\{file:([^}]+)\}\}/g)
      ?.forEach((token) => add({ fileId: token.slice(7, -2), source: "inline-placeholder" }));
    String(text || "")
      .match(/sandbox:[^\s)\]]+/g)
      ?.forEach((pointer) => add({ pointer, source: "sandbox-link" }));
  }

  function collectBackendRefsFromParts(parts, add) {
    if (!Array.isArray(parts)) return;
    parts.forEach((part) => {
      if (typeof part === "string") {
        collectBackendRefsFromText(part, add);
        return;
      }
      if (!part || typeof part !== "object") return;
      if (part.asset_pointer) {
        add({
          fileId: pointerToBackendFileId(part.asset_pointer),
          pointer: part.asset_pointer,
          source: part.content_type || "asset_pointer",
          metadata: part,
        });
      }
      if (part.audio_asset_pointer?.asset_pointer) {
        add({
          fileId: pointerToBackendFileId(part.audio_asset_pointer.asset_pointer),
          pointer: part.audio_asset_pointer.asset_pointer,
          source: "voice-audio",
          metadata: part.audio_asset_pointer,
        });
      }
      collectBackendRefsFromParts(part.parts, add);
      collectBackendRefsFromParts(part.children, add);
      collectBackendRefsFromParts(part.items, add);
    });
  }

  function collectBackendRefsFromMetadata(metadata, add) {
    if (!metadata || typeof metadata !== "object") return;
    (metadata.attachments || []).forEach((attachment) => {
      const fileId = attachment?.id || attachment?.file_id;
      if (!fileId) return;
      add({
        fileId,
        source: "attachment",
        metadata: attachment,
        name: attachment.name || attachment.file_name || attachment.filename,
      });
    });

    Object.values(metadata.content_references_by_file || {})
      .flat()
      .forEach((ref) => {
        if (ref?.file_id) add({ fileId: ref.file_id, source: "cref", metadata: ref });
        if (ref?.asset_pointer) {
          add({
            fileId: pointerToBackendFileId(ref.asset_pointer),
            pointer: ref.asset_pointer,
            source: "cref-pointer",
            metadata: ref,
          });
        }
      });

    const n7 = metadata.n7jupd_crefs_by_file || metadata.n7jupd_crefs || {};
    const n7Refs = Array.isArray(n7) ? n7 : Object.values(n7).flat();
    n7Refs.forEach((ref) => {
      if (ref?.file_id) add({ fileId: ref.file_id, source: "n7jupd-cref", metadata: ref });
      if (ref?.asset_pointer) {
        add({
          fileId: pointerToBackendFileId(ref.asset_pointer),
          pointer: ref.asset_pointer,
          source: "n7jupd-cref-pointer",
          metadata: ref,
        });
      }
    });
  }

  function collectBackendMessageAttachments(message, messageIndex, role, payload) {
    const refs = new Map();
    const add = (ref) => {
      const pointer = String(ref?.pointer || "");
      const fileId = ref?.fileId || pointerToBackendFileId(pointer);
      if (!fileId && !pointer) return;
      const key = fileId || pointer;
      if (refs.has(key)) return;
      refs.set(key, {
        ...ref,
        fileId,
        pointer,
        messageId: message?.id,
      });
    };

    collectBackendRefsFromMetadata(message?.metadata, add);
    collectBackendRefsFromParts(message?.content?.parts, add);
    return Array.from(refs.values()).map((ref) =>
      createBackendAttachment(ref, messageIndex, role, payload),
    );
  }

  async function fetchBackendMessages(conversationId = getBackendConversationId()) {
    if (!conversationId || typeof root.fetch !== "function") return [];
    const endpoint = new URL(
      `/backend-api/conversation/${encodeURIComponent(conversationId)}`,
      root.location?.origin || "https://chatgpt.com",
    ).toString();
    let response = null;
    try {
      response = await root.fetch(endpoint, { credentials: "include" });
      if (!response?.ok && response?.status !== 404) {
        const headers = await getBackendAuthHeaders();
        if (Object.keys(headers).length) {
          response = await root.fetch(endpoint, {
            credentials: "include",
            headers,
          });
        }
      }
    } catch (_) {}

    if (!response?.ok) {
      const bridgedPayload = await fetchBackendPayloadViaPageBridge(conversationId);
      if (bridgedPayload) return collectBackendMessagesFromPayload(bridgedPayload);
    }

    if (!response?.ok) return [];
    const payload = await response.json();
    return collectBackendMessagesFromPayload(payload);
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

    const primarySet = Array.from(new Set(resolvedPrimaryNodes)).filter(
      (node) =>
        isVisibleElement(node) &&
        hasMeaningfulText(node) &&
        isSingleTurnCandidate(node) &&
        !isChronoChatNode(node),
    );
    const roleHeadingSet = Array.from(
      new Set(getRoleHeadingMessageNodes(container || document)),
    ).filter((node) => !hasPrimaryTurnRelationship(node, primarySet));
    const actionDelimitedSet = Array.from(
      new Set(getActionDelimitedMessageNodes(container || document)),
    ).filter(
      (node) =>
        !hasPrimaryTurnRelationship(node, primarySet) &&
        !hasPrimaryTurnRelationship(node, roleHeadingSet),
    );
    const visualUserBubbleSet = Array.from(
      new Set(
        getVisualUserBubbleNodes(container || document, [
          ...primarySet,
          ...roleHeadingSet,
          ...actionDelimitedSet,
        ]),
      ),
    );
    const fallbackSet = Array.from(new Set(resolvedFallbackNodes)).filter(
      (node) =>
        (primarySet.length === 0 || !hasPrimaryTurnRelationship(node, primarySet)) &&
        (roleHeadingSet.length === 0 || !hasPrimaryTurnRelationship(node, roleHeadingSet)) &&
        (actionDelimitedSet.length === 0 ||
          !hasPrimaryTurnRelationship(node, actionDelimitedSet)) &&
        (visualUserBubbleSet.length === 0 ||
          !hasPrimaryTurnRelationship(node, visualUserBubbleSet)),
    );

    let nodes = [
      ...primarySet,
      ...roleHeadingSet,
      ...actionDelimitedSet,
      ...visualUserBubbleSet,
      ...fallbackSet,
    ];
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
    collectMessagesFromDocument,
    getBackendConversationId,
    collectBackendMessagesFromPayload,
    fetchBackendMessages,
    collectConversationAttachments,
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
