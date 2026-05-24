(function (root) {
  const ns = root.__JTC__;
  const state = ns.state;
  const { clamp, createFilenameTimestamp } = ns.utils;

  function getElement(id) {
    return document.getElementById(id);
  }

  function encodeZipText(value) {
    return new TextEncoder().encode(String(value ?? ""));
  }

  let crcTable = null;

  function getCrcTable() {
    if (crcTable) return crcTable;
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      crcTable[index] = value >>> 0;
    }
    return crcTable;
  }

  function crc32(bytes) {
    const table = getCrcTable();
    let crc = 0xffffffff;
    for (let index = 0; index < bytes.length; index += 1) {
      crc = table[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function writeUint16(bytes, offset, value) {
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >>> 8) & 0xff;
  }

  function writeUint32(bytes, offset, value) {
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >>> 8) & 0xff;
    bytes[offset + 2] = (value >>> 16) & 0xff;
    bytes[offset + 3] = (value >>> 24) & 0xff;
  }

  function getDosDateTime(date = new Date()) {
    const year = Math.max(1980, date.getFullYear());
    return {
      time:
        (date.getHours() << 11) |
        (date.getMinutes() << 5) |
        Math.floor(date.getSeconds() / 2),
      date:
        ((year - 1980) << 9) |
        ((date.getMonth() + 1) << 5) |
        date.getDate(),
    };
  }

  function concatBytes(parts, totalLength) {
    const output = new Uint8Array(totalLength);
    let offset = 0;
    parts.forEach((part) => {
      output.set(part, offset);
      offset += part.length;
    });
    return output;
  }

  function createStoredZip(fileMap) {
    const now = getDosDateTime();
    const localParts = [];
    const centralParts = [];
    let localOffset = 0;

    Object.entries(fileMap).forEach(([pathName, data]) => {
      const nameBytes = encodeZipText(pathName);
      const fileBytes = data instanceof Uint8Array ? data : new Uint8Array(data);
      const crc = crc32(fileBytes);
      const localHeader = new Uint8Array(30 + nameBytes.length);
      writeUint32(localHeader, 0, 0x04034b50);
      writeUint16(localHeader, 4, 20);
      writeUint16(localHeader, 6, 0x0800);
      writeUint16(localHeader, 8, 0);
      writeUint16(localHeader, 10, now.time);
      writeUint16(localHeader, 12, now.date);
      writeUint32(localHeader, 14, crc);
      writeUint32(localHeader, 18, fileBytes.length);
      writeUint32(localHeader, 22, fileBytes.length);
      writeUint16(localHeader, 26, nameBytes.length);
      writeUint16(localHeader, 28, 0);
      localHeader.set(nameBytes, 30);
      localParts.push(localHeader, fileBytes);

      const centralHeader = new Uint8Array(46 + nameBytes.length);
      writeUint32(centralHeader, 0, 0x02014b50);
      writeUint16(centralHeader, 4, 20);
      writeUint16(centralHeader, 6, 20);
      writeUint16(centralHeader, 8, 0x0800);
      writeUint16(centralHeader, 10, 0);
      writeUint16(centralHeader, 12, now.time);
      writeUint16(centralHeader, 14, now.date);
      writeUint32(centralHeader, 16, crc);
      writeUint32(centralHeader, 20, fileBytes.length);
      writeUint32(centralHeader, 24, fileBytes.length);
      writeUint16(centralHeader, 28, nameBytes.length);
      writeUint16(centralHeader, 30, 0);
      writeUint16(centralHeader, 32, 0);
      writeUint16(centralHeader, 34, 0);
      writeUint16(centralHeader, 36, 0);
      writeUint32(centralHeader, 38, 0);
      writeUint32(centralHeader, 42, localOffset);
      centralHeader.set(nameBytes, 46);
      centralParts.push(centralHeader);

      localOffset += localHeader.length + fileBytes.length;
    });

    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const endRecord = new Uint8Array(22);
    writeUint32(endRecord, 0, 0x06054b50);
    writeUint16(endRecord, 4, 0);
    writeUint16(endRecord, 6, 0);
    writeUint16(endRecord, 8, centralParts.length);
    writeUint16(endRecord, 10, centralParts.length);
    writeUint32(endRecord, 12, centralSize);
    writeUint32(endRecord, 16, localOffset);
    writeUint16(endRecord, 20, 0);

    return concatBytes(
      [...localParts, ...centralParts, endRecord],
      localOffset + centralSize + endRecord.length,
    );
  }

  function getMessageList() {
    return getElement("message-list");
  }

  function getAttachmentList() {
    return getElement("attachment-list");
  }

  function setStatus(message, tone = "neutral") {
    state.ui.status = String(message || "");
    const meta = getElement("search-meta");
    if (!meta) return;
    updateSearchMeta();
    meta.dataset.tone = tone;
  }

  function clearStatus() {
    state.ui.status = "";
    updateSearchMeta();
  }

  function updateThemeUi() {
    const effectiveTheme = ns.dom.detectHostTheme();
    const sidebar = getElement("chatgpt-nav-sidebar");
    const floatingToggle = getElement("chatgpt-nav-toggle");
    const edgeToggle = getElement("chatgpt-nav-edge-toggle");

    [sidebar, floatingToggle, edgeToggle].forEach((element) => {
      if (!element) return;
      element.classList.remove("theme-dark", "theme-light");
      element.classList.add(
        effectiveTheme === "dark" ? "theme-dark" : "theme-light",
      );
    });
  }

  function applySearchState(partialState) {
    const searchState = {
      ...state.ui.search,
      ...partialState,
      error: "",
    };
    searchState.term = String(searchState.term || "");
    searchState.regex = false;
    searchState.caseSensitive = false;
    state.ui.search = searchState;
    state.ui.status = "";
    state.ui.virtualization.visibleStart = null;

    renderFiltersAndMessages();
  }

  function doesMessageMatch(message) {
    const term = state.ui.search.term;
    if (!term) return true;

    const haystack = `${message.fullText} ${message.preview}`;
    return haystack.toLowerCase().includes(term.toLowerCase());
  }

  function computeVisibleIndices() {
    const indices = [];
    state.ui.search.error = "";
    syncMessageMarks();
    const visibleRoleFilter = state.ui.currentFilter;

    state.conversation.messages.forEach((message) => {
      const filterMatches =
        visibleRoleFilter === "all" ||
        visibleRoleFilter === message.role ||
        (visibleRoleFilter === "marked" && hasMarks(message));
      if (filterMatches && doesMessageMatch(message)) {
        indices.push(message.index);
      }
    });

    state.conversation.visibleIndices = state.ui.search.error ? [] : indices;
    state.ui.search.matchCount = state.ui.search.error ? 0 : indices.length;
    return state.conversation.visibleIndices;
  }

  function getVirtualWindow(indices) {
    if (indices.length <= ns.config.virtualListThreshold) {
      return {
        windowIndices: indices,
        canLoadOlder: false,
      };
    }

    const pageSize = ns.config.virtualListPageSize;
    const maxStart = Math.max(0, indices.length - pageSize);
    const requestedStart = state.ui.virtualization.visibleStart;
    const start =
      requestedStart == null ? maxStart : clamp(requestedStart, 0, maxStart);
    state.ui.virtualization.visibleStart = start;

    return {
      windowIndices: indices.slice(start),
      canLoadOlder: start > 0,
    };
  }

  function getVisibleRenderedItems() {
    return Array.from(
      getMessageList()?.querySelectorAll("li[data-message-index]") || [],
    );
  }

  function syncSelection() {
    const items = getVisibleRenderedItems();
    const availableIndices = items.map((item) =>
      Number(item.dataset.messageIndex),
    );
    if (
      state.ui.selectedMessageIndex !== -1 &&
      !availableIndices.includes(state.ui.selectedMessageIndex)
    ) {
      state.ui.selectedMessageIndex = -1;
    }

    items.forEach((item) => {
      const actualIndex = Number(item.dataset.messageIndex);
      const selected = actualIndex === state.ui.selectedMessageIndex;
      item.classList.toggle("selected", selected);
      item.setAttribute("aria-selected", selected ? "true" : "false");
    });
  }

  function normalizeMarkRecord(value) {
    if (!value || typeof value !== "object") return null;
    const normalized = {};
    if (value.bookmark === true) normalized.bookmark = true;
    if (value.decision === true) normalized.decision = true;
    if (!normalized.bookmark && !normalized.decision) return null;
    normalized.updatedAt =
      typeof value.updatedAt === "string" && value.updatedAt
        ? value.updatedAt
        : new Date().toISOString();
    return normalized;
  }

  function hasMarks(message) {
    const marks = normalizeMarkRecord(message?.marks);
    return Boolean(marks?.bookmark || marks?.decision);
  }

  function getMarkLabels(message) {
    const marks = normalizeMarkRecord(message?.marks) || {};
    const labels = [];
    if (marks.bookmark) labels.push("Bookmark");
    if (marks.decision) labels.push("Decision");
    return labels;
  }

  function hashText(value) {
    let hash = 2166136261;
    String(value || "").split("").forEach((character) => {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    });
    return (hash >>> 0).toString(36);
  }

  function getNormalizedMessageText(message) {
    const text = ns.dom.collapseText?.(message?.fullText || message?.preview || "");
    return String(text || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getMessageMarkBase(message) {
    const role = String(message?.role || "unknown");
    return `${role}|${hashText(getNormalizedMessageText(message))}`;
  }

  function getMessageMarksKey(message) {
    if (message?.markKey) return String(message.markKey);
    return `${getMessageMarkBase(message)}|0`;
  }

  function syncMessageMarks() {
    if (!state.conversation?.marks) {
      state.conversation.marks = {};
    }
    const occurrences = new Map();
    state.conversation.messages.forEach((message) => {
      const base = getMessageMarkBase(message);
      const occurrence = occurrences.get(base) || 0;
      occurrences.set(base, occurrence + 1);
      const key = `${base}|${occurrence}`;
      message.markKey = key;
      message.marks = normalizeMarkRecord(state.conversation.marks[key]);
    });
  }

  function getExportMarkFields(message) {
    const marks = normalizeMarkRecord(message?.marks || {}) || {};
    return {
      bookmark: marks.bookmark === true,
      decision: marks.decision === true,
      mark: getMarkLabels(message).join(", "),
    };
  }

  function appendInlinePreview(parent, value) {
    const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
    let lastIndex = 0;
    String(value || "").replace(pattern, (match, _token, offset) => {
      if (offset > lastIndex) {
        parent.appendChild(document.createTextNode(value.slice(lastIndex, offset)));
      }

      if (match.startsWith("`")) {
        const code = document.createElement("code");
        code.textContent = match.slice(1, -1);
        parent.appendChild(code);
      } else if (match.startsWith("**")) {
        const strong = document.createElement("strong");
        strong.textContent = match.slice(2, -2);
        parent.appendChild(strong);
      } else {
        const emphasis = document.createElement("em");
        emphasis.textContent = match.slice(1, -1);
        parent.appendChild(emphasis);
      }

      lastIndex = offset + match.length;
      return match;
    });

    if (lastIndex < value.length) {
      parent.appendChild(document.createTextNode(value.slice(lastIndex)));
    }
  }

  function getPreviewRows(markdown) {
    const rows = [];
    let inCodeFence = false;
    normalizeExportMarkdown(markdown)
      .split("\n")
      .forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        if (trimmed.startsWith("```")) {
          inCodeFence = !inCodeFence;
          return;
        }

        if (inCodeFence) {
          rows.push({ text: trimmed, code: true });
          return;
        }

        if (isMarkdownTableSeparator(trimmed)) return;

        if (trimmed.includes("|")) {
          const cells = splitMarkdownTableRow(trimmed).filter(Boolean);
          if (cells.length > 1) {
            rows.push({ text: cells.join(" · ") });
            return;
          }
        }

        const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
        if (heading) {
          rows.push({ text: heading[2], strong: true });
          return;
        }

        const unordered = trimmed.match(/^[-*+]\s+(.+)$/);
        if (unordered) {
          rows.push({ prefix: "• ", text: unordered[1] });
          return;
        }

        const ordered = trimmed.match(/^(\d+)\.\s+(.+)$/);
        if (ordered) {
          rows.push({ prefix: `${ordered[1]}. `, text: ordered[2] });
          return;
        }

        const quote = trimmed.match(/^>\s?(.+)$/);
        rows.push({ text: quote?.[1] || trimmed });
      });
    return rows;
  }

  function renderPreview(parent, markdown) {
    const maxLength = ns.config.maxPreviewLength;
    let remaining = maxLength;
    const rows = getPreviewRows(markdown);

    rows.some((row, index) => {
      if (remaining <= 0) return true;
      const rowElement = document.createElement("span");
      rowElement.className = "jtch-preview-row";
      if (row.strong) rowElement.classList.add("strong");
      if (row.code) rowElement.classList.add("code");

      if (row.prefix) {
        const prefix = document.createElement("span");
        prefix.className = "jtch-preview-prefix";
        prefix.textContent = row.prefix;
        rowElement.appendChild(prefix);
      }

      const rawText = row.text || "";
      const clipped = rawText.length > remaining ? `${rawText.slice(0, remaining)}...` : rawText;
      appendInlinePreview(rowElement, clipped);
      parent.appendChild(rowElement);
      remaining -= rawText.length;

      if (index < rows.length - 1 && remaining > 0) {
        parent.appendChild(document.createTextNode(" "));
        remaining -= 1;
      }

      return remaining <= 0;
    });

    if (!parent.childNodes.length) {
      parent.textContent = "";
    }
  }

  function getPlainPreviewText(markdown) {
    const preview = getPreviewRows(markdown)
      .map((row) => {
        const plainText = String(row.text || "")
          .replace(/`([^`]+)`/g, "$1")
          .replace(/\*\*([^*]+)\*\*/g, "$1")
          .replace(/\*([^*]+)\*/g, "$1");
        return `${row.prefix || ""}${plainText}`;
      })
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    return preview.length > ns.config.maxPreviewLength
      ? `${preview.slice(0, ns.config.maxPreviewLength)}...`
      : preview;
  }

  function createMessageItem(message) {
    const item = document.createElement("li");
    item.className = `jtch-item role-${message.role}`;
    item.dataset.messageIndex = String(message.index);
    item.dataset.role = message.role;
    item.dataset.preview = message.preview;
    item.tabIndex = 0;
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", "false");
    item.setAttribute(
      "aria-label",
      `${message.role}: ${getPlainPreviewText(message.fullText || message.preview)}`,
    );

    const badge = document.createElement("span");
    badge.className = "jtch-role-badge";
    badge.textContent =
      message.role === "assistant" ? "AI" : message.role === "user" ? "You" : "-";

    const content = document.createElement("span");
    content.className = "jtch-item-content";

    const text = document.createElement("span");
    text.className = "jtch-item-text";
    renderPreview(text, message.fullText || message.preview);

    const meta = document.createElement("span");
    meta.className = "jtch-item-meta";
    meta.textContent = `#${message.index + 1}`;

    const actions = document.createElement("span");
    actions.className = "jtch-item-actions";
    const marks = normalizeMarkRecord(message.marks) || {};
    [
      {
        type: "bookmark",
        label: "Bookmark",
        text: marks.bookmark ? "★" : "☆",
        className: "jtch-mark-bookmark",
      },
      {
        type: "decision",
        label: "Decision",
        text: "Decision",
        className: "jtch-mark-decision",
      },
    ].forEach((mark) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `jtch-mark-button ${mark.className}${
        marks[mark.type] ? " active" : ""
      }`;
      button.dataset.markAction = mark.type;
      button.dataset.messageIndex = String(message.index);
      button.textContent = mark.text;
      button.setAttribute(
        "aria-label",
        `${marks[mark.type] ? "Remove" : "Add"} ${mark.label} mark for message #${
          message.index + 1
        }`,
      );
      button.setAttribute("aria-pressed", marks[mark.type] ? "true" : "false");
      button.title = mark.label;
      actions.appendChild(button);
    });

    content.appendChild(text);
    content.appendChild(meta);
    content.appendChild(actions);
    item.appendChild(badge);
    item.appendChild(content);
    return item;
  }

  function getAttachmentSourceLabel(attachment) {
    if (attachment.role === "assistant") return "AI";
    if (attachment.role === "user") return "You";
    return "Chat";
  }

  function getAttachmentBadgeText(attachment) {
    if (attachment.kind === "spreadsheet") return "XLS";
    if (attachment.kind === "image") return "IMG";
    if (/pdf/i.test(attachment.typeLabel)) return "PDF";
    const typeLabel = String(attachment.typeLabel || "").trim();
    return typeLabel ? typeLabel.slice(0, 3).toUpperCase() : "FILE";
  }

  function getAttachmentSummaryType(attachment) {
    if (attachment.kind === "spreadsheet") return "XLS";
    return attachment.typeLabel;
  }

  function createAttachmentItem(attachment) {
    const item = document.createElement("li");
    item.className = `jtch-attachment-item kind-${attachment.kind}`;
    item.dataset.attachmentId = attachment.id;
    item.dataset.attachmentKind = attachment.kind;
    item.setAttribute("title", attachment.name);
    item.setAttribute(
      "aria-label",
      `${attachment.name}, ${attachment.typeLabel || "file"}, ${getAttachmentSourceLabel(attachment)}`,
    );

    const preview = document.createElement("span");
    preview.className = "jtch-attachment-preview";
    if (attachment.kind === "image" && attachment.thumbnailUrl) {
      const image = document.createElement("img");
      image.src = attachment.thumbnailUrl;
      image.alt = "";
      image.loading = "lazy";
      preview.appendChild(image);
    } else {
      preview.textContent = getAttachmentBadgeText(attachment);
    }

    const body = document.createElement("span");
    body.className = "jtch-attachment-body";

    const name = document.createElement("span");
    name.className = "jtch-attachment-name";
    name.textContent = attachment.name;

    const meta = document.createElement("span");
    meta.className = "jtch-attachment-meta";
    const cached = state.runtime.cachedAttachmentKeys?.has?.(attachment.cacheKey);
    [
      { className: "jtch-attachment-kind", text: attachment.typeLabel },
      { className: "jtch-attachment-source", text: getAttachmentSourceLabel(attachment) },
      { className: "jtch-attachment-cache", text: cached ? "Local" : "" },
    ].forEach((part) => {
      if (!part.text) return;
      const node = document.createElement("span");
      node.className = part.className;
      node.textContent = part.text;
      meta.appendChild(node);
    });

    body.appendChild(name);
    body.appendChild(meta);

    const actions = document.createElement("span");
    actions.className = "jtch-attachment-actions";
    [
      { label: "Open", action: "open" },
      { label: "Save", action: "download" },
    ].forEach((control) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "jtch-attachment-action";
      button.textContent = control.label;
      button.dataset.attachmentAction = control.action;
      button.dataset.attachmentId = attachment.id;
      button.setAttribute("aria-label", `${control.label} ${attachment.name}`);
      button.title = `${control.label} ${attachment.name}`;
      actions.appendChild(button);
    });

    item.appendChild(preview);
    item.appendChild(body);
    item.appendChild(actions);
    return item;
  }

  function updateAttachmentUi() {
    const list = getAttachmentList();
    const count = getElement("attachment-count");
    const types = getElement("attachment-types");
    const dropbox = getElement("attachment-dropbox");
    const summary = dropbox?.querySelector?.(".jtch-attachment-summary");
    const attachments = state.conversation.attachments || [];

    if (count) count.textContent = String(attachments.length);
    if (types) {
      const typeSummary = Array.from(
        new Set(
          attachments
            .map((attachment) => getAttachmentSummaryType(attachment))
            .filter(Boolean),
        ),
      );
      const visibleTypes = typeSummary.slice(0, 3);
      const hiddenTypeCount = typeSummary.length - visibleTypes.length;
      types.textContent = visibleTypes.length
        ? `${visibleTypes.join(", ")}${hiddenTypeCount > 0 ? ` +${hiddenTypeCount}` : ""}`
        : "No files";
      types.title = typeSummary.join(", ");
    }
    if (dropbox) {
      dropbox.classList.toggle("empty", attachments.length === 0);
    }
    if (summary) {
      summary.setAttribute(
        "aria-label",
        attachments.length
          ? `Conversation files, ${attachments.length} file${attachments.length === 1 ? "" : "s"}`
          : "Conversation files, no files",
      );
    }
    if (!list) return;
    list.innerHTML = "";

    if (!attachments.length) {
      const empty = document.createElement("li");
      empty.className = "jtch-attachment-empty";
      empty.textContent = "No files in this conversation yet.";
      list.appendChild(empty);
      return;
    }

    attachments.forEach((attachment) => {
      list.appendChild(createAttachmentItem(attachment));
    });
  }

  function renderMessageList(windowIndices, canLoadOlder) {
    const list = getMessageList();
    if (!list) return;
    list.innerHTML = "";

    if (canLoadOlder) {
      const older = document.createElement("li");
      older.className = "jtch-load-older";
      older.textContent = "Load earlier matches";
      older.dataset.action = "load-older";
      older.tabIndex = 0;
      older.setAttribute("role", "button");
      older.setAttribute("aria-label", "Load earlier matching messages");
      list.appendChild(older);
    }

    if (windowIndices.length === 0) {
      const empty = document.createElement("li");
      empty.className = "jtch-empty";
      empty.textContent = state.ui.search.term
        ? "No messages match the current filters."
        : "No messages found in this conversation yet.";
      list.appendChild(empty);
      return;
    }

    windowIndices.forEach((messageIndex) => {
      const message = state.conversation.messages[messageIndex];
      if (message) {
        list.appendChild(createMessageItem(message));
      }
    });
    syncSelection();
  }

  function updateSearchMeta() {
    const meta = getElement("search-meta");
    if (!meta) return;

    if (state.ui.search.error) {
      meta.textContent = state.ui.search.error;
      meta.className = "jtch-search-meta error";
      return;
    }

    if (state.ui.status) {
      meta.textContent = state.ui.status;
      meta.className = "jtch-search-meta";
      return;
    }

    if (!state.ui.search.term) {
      meta.textContent = "";
      meta.className = "jtch-search-meta";
      return;
    }

    const count = state.ui.search.matchCount;
    meta.textContent = `${count} match${count === 1 ? "" : "es"}`;
    meta.className = "jtch-search-meta";
  }

  function updateFilterUi() {
    const buttons = document.querySelectorAll("#filter-group .jtch-filter");
    buttons.forEach((button) => {
      const active = button.dataset.filter === state.ui.currentFilter;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function updateSearchOptionUi() {
    state.ui.search.regex = false;
    state.ui.search.caseSensitive = false;
  }

  function updateSearchUi() {
    const searchInput = getElement("message-search");
    if (searchInput) searchInput.value = state.ui.search.term;
  }

  function updatePreviewSizeUi() {
    const previewControls = getElement("preview-controls");
    if (!previewControls) return;
    previewControls.dataset.previewFontSize = String(state.ui.previewFontSize);
    previewControls.querySelectorAll("[data-preview-size-action]").forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        button.dataset.previewSizeAction === "reset" &&
          state.ui.previewFontSize === ns.config.previewFontSize
          ? "true"
          : "false",
      );
    });
  }

  function updateCountUi() {
    const count = getElement("message-count");
    if (count) count.textContent = String(state.conversation.messages.length);
  }

  function renderFiltersAndMessages() {
    const visibleIndices = computeVisibleIndices();
    const { windowIndices, canLoadOlder } = getVirtualWindow(visibleIndices);
    renderMessageList(windowIndices, canLoadOlder);
    updateSearchMeta();
    updateFilterUi();
    updateSearchOptionUi();
    updateSearchUi();
    updatePreviewSizeUi();
    updateCountUi();
    updateAttachmentUi();
  }

  function selectMessage(index) {
    state.ui.selectedMessageIndex = index;
    syncSelection();
  }

  function selectRelativeMessage(step) {
    const items = getVisibleRenderedItems();
    if (items.length === 0) {
      state.ui.selectedMessageIndex = -1;
      return;
    }

    const currentPosition = items.findIndex(
      (item) => Number(item.dataset.messageIndex) === state.ui.selectedMessageIndex,
    );
    const nextPosition =
      currentPosition === -1
        ? step >= 0
          ? 0
          : items.length - 1
        : (currentPosition + step + items.length) % items.length;
    const nextIndex = Number(items[nextPosition].dataset.messageIndex);
    selectMessage(nextIndex);
    items[nextPosition].scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function clearSelection() {
    state.ui.selectedMessageIndex = -1;
    syncSelection();
  }

  function getMessageKey(message) {
    return `${message?.role || "unknown"}\n${ns.dom.collapseText?.(
      message?.fullText || message?.preview || "",
    )}`;
  }

  function getMessageText(message) {
    return ns.dom.collapseText?.(message?.fullText || message?.preview || "") || "";
  }

  function normalizeMessageSearchText(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getLooseMessageKey(message) {
    return `${message?.role || "unknown"}\n${normalizeMessageSearchText(getMessageText(message))}`;
  }

  function scoreMessageCandidate(target, candidate, targetIndex, candidateIndex) {
    if (!target || !candidate || target.role !== candidate.role) return -1;
    if (getMessageKey(target) === getMessageKey(candidate)) return 100;

    const targetText = normalizeMessageSearchText(getMessageText(target));
    const candidateText = normalizeMessageSearchText(getMessageText(candidate));
    if (!targetText || !candidateText) return -1;
    if (targetText === candidateText) return 96;

    const shorterLength = Math.min(targetText.length, candidateText.length);
    if (
      shorterLength >= 24 &&
      (targetText.includes(candidateText) || candidateText.includes(targetText))
    ) {
      return 88;
    }

    const targetTokens = new Set(targetText.split(" ").filter((token) => token.length >= 3));
    const candidateTokens = candidateText.split(" ").filter((token) => token.length >= 3);
    if (targetTokens.size && candidateTokens.length) {
      const overlap = candidateTokens.filter((token) => targetTokens.has(token)).length;
      const overlapRatio = overlap / Math.max(targetTokens.size, candidateTokens.length);
      if (overlap >= 4 && overlapRatio >= 0.45) return 78;
    }

    if (Number.isFinite(targetIndex) && targetIndex === candidateIndex) return 58;
    return -1;
  }

  function scoreMessageNode(target, node) {
    if (!target || !node?.isConnected) return -1;
    const targetText = normalizeMessageSearchText(getMessageText(target));
    const nodeText = normalizeMessageSearchText(node.textContent || "");
    if (!targetText || !nodeText) return -1;
    if (targetText === nodeText) return 96;

    const shorterLength = Math.min(targetText.length, nodeText.length);
    if (
      shorterLength >= 24 &&
      (targetText.includes(nodeText) || nodeText.includes(targetText))
    ) {
      return 88;
    }

    const targetTokens = new Set(targetText.split(" ").filter((token) => token.length >= 3));
    const nodeTokens = nodeText.split(" ").filter((token) => token.length >= 3);
    if (targetTokens.size && nodeTokens.length) {
      const overlap = nodeTokens.filter((token) => targetTokens.has(token)).length;
      const overlapRatio = overlap / Math.max(targetTokens.size, nodeTokens.length);
      if (overlap >= 4 && overlapRatio >= 0.45) return 78;
    }

    return -1;
  }

  function getScrollElement() {
    const candidates = [
      document.scrollingElement,
      document.documentElement,
      document.body,
      ns.dom.getChatContainer?.(),
      ...Array.from(
        document.querySelectorAll(
          [
            "main",
            "[role='main']",
            "[data-testid*='conversation']",
            "[class*='overflow-y-auto']",
            "[class*='overflow-auto']",
            "[class*='scroll']",
          ].join(", "),
        ),
      ),
    ].filter(Boolean);
    let best = candidates[0] || document.documentElement || document.body;
    let bestScrollable = Math.max(
      0,
      (best?.scrollHeight || 0) - (best?.clientHeight || root.innerHeight || 0),
    );

    candidates.forEach((element) => {
      if (!element?.isConnected && element !== document.documentElement && element !== document.body) {
        return;
      }
      const style = root.getComputedStyle?.(element);
      const canScrollByStyle = /auto|scroll|overlay/i.test(
        `${style?.overflowY || ""} ${style?.overflow || ""}`,
      );
      const scrollable = Math.max(
        0,
        (element.scrollHeight || 0) - (element.clientHeight || root.innerHeight || 0),
      );
      if (scrollable > bestScrollable && (canScrollByStyle || element === document.scrollingElement)) {
        best = element;
        bestScrollable = scrollable;
      }
    });

    return best;
  }

  function setScrollTop(scroller, top) {
    if (!scroller) return;
    if (scroller === document.body || scroller === document.documentElement) {
      if (!root.__CHRONOCHAT_TEST__) {
        try {
          root.scrollTo?.({ top, behavior: "auto" });
        } catch (_) {}
      }
      scroller.scrollTop = top;
      return;
    }
    try {
      scroller.scrollTo?.({ top, behavior: "auto" });
    } catch (_) {
      scroller.scrollTop = top;
    }
    scroller.scrollTop = top;
  }

  function delay(ms) {
    return new Promise((resolve) => root.setTimeout(resolve, ms));
  }

  async function waitForHydrationIdle(timeoutMs = 9000) {
    if (!state.runtime.domHydrationInFlight || !state.runtime.domHydrationPromise) return;
    await Promise.race([
      state.runtime.domHydrationPromise.catch?.(() => {}) || state.runtime.domHydrationPromise,
      delay(timeoutMs),
    ]);
    await delay(80);
  }

  function findLiveMessageCandidate(message, targetIndex = message?.index) {
    let best = null;
    let bestScore = -1;
    ns.dom.collectMessages().forEach((candidate, candidateIndex) => {
      const score = scoreMessageCandidate(message, candidate, targetIndex, candidateIndex);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    });
    return bestScore >= 72 ? { node: best?.domNode || null, score: bestScore } : null;
  }

  function findLiveMessageNode(message, targetIndex = message?.index) {
    return findLiveMessageCandidate(message, targetIndex)?.node || null;
  }

  function resolveBestCurrentMessageNode(message, targetIndex = message?.index) {
    const cachedScore = scoreMessageNode(message, message?.domNode);
    const live = findLiveMessageCandidate(message, targetIndex);
    if (live?.node && live.score > cachedScore) {
      return live.node;
    }
    if (cachedScore >= 72) return message.domNode;
    return live?.node || null;
  }

  function highlightAndScrollNode(node) {
    if (!node?.isConnected) return false;
    node.classList.add("jtch-target-highlight");
    node.scrollIntoView({ behavior: "auto", block: "start" });
    root.setTimeout(() => {
      if (node.isConnected) {
        node.scrollIntoView({ behavior: "auto", block: "start" });
      }
    }, 120);
    root.setTimeout(() => {
      node.classList.remove("jtch-target-highlight");
    }, ns.config.highlightDuration);
    return true;
  }

  function findWindowMessageNode(message, targetIndex, seenMessages, seenKeys) {
    let best = null;
    let bestScore = -1;
    const candidates = ns.dom.collectMessages();
    candidates.forEach((candidate) => {
      const score = scoreMessageCandidate(message, candidate, targetIndex, undefined);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    });
    if (bestScore >= 72) return best?.domNode || null;

    for (const candidate of candidates) {
      const key = getLooseMessageKey(candidate);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      const candidateIndex = seenMessages.length;
      seenMessages.push(candidate);
      const score = scoreMessageCandidate(message, candidate, targetIndex, candidateIndex);
      if (score >= 50) return candidate.domNode || null;
    }
    return null;
  }

  async function findVirtualizedMessageNode(message, targetIndex = message?.index) {
    const scroller = getScrollElement();
    const viewportHeight = scroller?.clientHeight || root.innerHeight || 800;
    const step = Math.max(360, Math.floor(viewportHeight * 0.75));
    const originalTop = scroller?.scrollTop || root.scrollY || 0;
    let position = 0;
    let guard = 0;
    const seenMessages = [];
    const seenKeys = new Set();

    setScrollTop(scroller, 0);
    await delay(100);
    let node = findWindowMessageNode(message, targetIndex, seenMessages, seenKeys);
    if (node) return node;

    while (guard < 80) {
      const maxTop = Math.max(0, (scroller?.scrollHeight || 0) - viewportHeight);
      if (position >= maxTop) break;
      position = Math.min(maxTop, position + step);
      setScrollTop(scroller, position);
      await delay(100);
      node = findWindowMessageNode(message, targetIndex, seenMessages, seenKeys);
      if (node) return node;
      guard += 1;
    }

    setScrollTop(scroller, originalTop);
    return null;
  }

  async function scrollToMessage(index) {
    const jumpToken = (state.runtime.messageJumpToken || 0) + 1;
    state.runtime.messageJumpToken = jumpToken;

    if (state.runtime.domHydrationInFlight) {
      state.runtime.pendingMessageJumpIndex = index;
      return;
    }

    let message = state.conversation.messages[index];
    if (!message) return;
    let resolvedNode = resolveBestCurrentMessageNode(message, index);
    if (resolvedNode) {
      message.domNode = resolvedNode;
      highlightAndScrollNode(resolvedNode);
      return;
    }

    await waitForHydrationIdle();
    if (state.runtime.messageJumpToken !== jumpToken) return;

    message = state.conversation.messages[index] || message;
    let liveNode = findLiveMessageNode(message, index) || (await findVirtualizedMessageNode(message, index));
    if (state.runtime.messageJumpToken !== jumpToken) return;
    if (liveNode) {
      message = state.conversation.messages[index] || message;
      message.domNode = liveNode;
      highlightAndScrollNode(liveNode);
    }
  }

  function focusSearch() {
    const input = getElement("message-search");
    if (input) {
      input.focus();
      input.select();
    }
  }

  function setFilter(filter) {
    if (!ns.constants.filters.includes(filter)) return;
    state.ui.currentFilter = filter;
    state.ui.virtualization.visibleStart = null;
    renderFiltersAndMessages();
  }

  function setMessageMark(messageIndex, markType, active) {
    const message = state.conversation.messages[Number(messageIndex)];
    if (!message || !ns.constants.markTypes.includes(markType)) return;
    if (typeof syncMessageMarks === "function") {
      syncMessageMarks();
    }
    const key = getMessageMarksKey(message);
    if (!key) return;

    const current = normalizeMarkRecord(state.conversation.marks?.[key]) || {};
    const next = {
      bookmark: current.bookmark,
      decision: current.decision,
    };
    next[markType] = Boolean(active);

    if (next.bookmark || next.decision) {
      const record = {
        updatedAt: new Date().toISOString(),
      };
      if (next.bookmark) record.bookmark = true;
      if (next.decision) record.decision = true;
      state.conversation.marks[key] = record;
    } else {
      delete state.conversation.marks[key];
    }

    message.marks = normalizeMarkRecord(state.conversation.marks[key]);
    ns.storage.scheduleMarksSave?.(state.conversation.id, state.conversation.marks);
    renderFiltersAndMessages();
  }

  function toggleMessageMark(messageIndex, markType) {
    const message = state.conversation.messages[Number(messageIndex)];
    if (!message || !ns.constants.markTypes.includes(markType)) return;
    const nextActive = !Boolean(message.marks?.[markType]);
    setMessageMark(message.index, markType, nextActive);
  }

  function setSidebarWidth(width) {
    state.ui.sidebarWidth = clamp(
      Number(width) || ns.config.sidebarWidth,
      ns.config.minSidebarWidth,
      getResponsiveMaxSidebarWidth(),
    );
    ns.storage.scheduleSave?.();
  }

  function setPreviewFontSize(size) {
    state.ui.previewFontSize = clamp(
      Number(size) || ns.config.previewFontSize,
      ns.config.minPreviewFontSize,
      ns.config.maxPreviewFontSize,
    );
    ns.storage.scheduleSave?.();
    updatePreviewSizeUi();
  }

  function getResponsiveMaxSidebarWidth() {
    const viewportWidth =
      root.innerWidth || document.documentElement.clientWidth || ns.config.maxSidebarWidth;
    return Math.max(
      ns.config.minSidebarWidth,
      Math.min(ns.config.maxSidebarWidth, Math.floor(viewportWidth * 0.92)),
    );
  }

  function buildExportPayload() {
    if (typeof syncMessageMarks === "function") {
      syncMessageMarks();
    }
    return state.conversation.messages.map((message) => ({
      index: message.index,
      role: message.role,
      content: message.fullText,
      ...(typeof getExportMarkFields === "function"
        ? getExportMarkFields(message)
        : {}),
    }));
  }

  async function prepareCompleteExportSnapshot() {
    if (typeof ns.runtime?.ensureCompleteMessageSnapshot !== "function") return;
    setStatus("Collecting full conversation...");
    await ns.runtime.ensureCompleteMessageSnapshot();
  }

  function buildAttachmentExportManifest(attachments = state.conversation.attachments || []) {
    return attachments.map((attachment, index) => ({
      id: attachment.id,
      index,
      name: attachment.name,
      type: attachment.typeLabel || "",
      kind: attachment.kind || "file",
      role: attachment.role || "unknown",
      messageIndex: attachment.messageIndex,
      sourceUrl: attachment.url || "",
      fileId: attachment.fileId || "",
      pointer: attachment.pointer || "",
      backendSource: attachment.backendSource || "",
      included: false,
      exportPath: "",
      reason: "",
    }));
  }

  function formatAttachmentLabel(attachment) {
    const type = attachment.type || attachment.typeLabel || attachment.kind || "file";
    const role = attachment.role || "unknown";
    const message =
      typeof attachment.messageIndex === "number" && attachment.messageIndex >= 0
        ? `message ${attachment.messageIndex}`
        : "conversation";
    return `${attachment.name} (${type}, ${role}, ${message})`;
  }

  function sanitizeCsvCell(value) {
    const stringValue = value == null ? "" : String(value);
    if (/^\s*[=+\-@]/.test(stringValue)) {
      return `'${stringValue}`;
    }
    return stringValue;
  }

  function getExportMarkLabel(message) {
    if (typeof message?.mark === "string" && message.mark.trim()) {
      return message.mark.trim();
    }
    const labels = [];
    if (message?.bookmark === true) labels.push("Bookmark");
    if (message?.decision === true) labels.push("Decision");
    if (labels.length) return labels.join(", ");
    return getMarkLabels(message).join(", ");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function normalizeExportMarkdown(value) {
    return String(value || "")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function renderInlineMarkdown(value) {
    return escapeHtml(value)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");
  }

  function splitMarkdownTableRow(line) {
    const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
    return trimmed.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
  }

  function isMarkdownTableSeparator(line) {
    return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
  }

  function isMarkdownTableStart(lines, index) {
    return (
      lines[index]?.includes("|") &&
      index + 1 < lines.length &&
      isMarkdownTableSeparator(lines[index + 1])
    );
  }

  function renderMarkdownTable(lines, startIndex) {
    const tableLines = [lines[startIndex]];
    let cursor = startIndex + 2;
    while (cursor < lines.length && lines[cursor].includes("|") && lines[cursor].trim()) {
      tableLines.push(lines[cursor]);
      cursor += 1;
    }

    const rows = tableLines.map(splitMarkdownTableRow);
    const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
    const normalizeRow = (row) =>
      Array.from({ length: columnCount }, (_, index) => row[index] || "");
    const [headerRow, ...bodyRows] = rows.map(normalizeRow);
    const header = headerRow
      .map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`)
      .join("");
    const body = bodyRows
      .map(
        (row) =>
          `<tr>${row
            .map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`)
            .join("")}</tr>`,
      )
      .join("");

    return {
      html: `<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`,
      nextIndex: cursor,
    };
  }

  function renderMarkdownToHTML(markdown) {
    const lines = normalizeExportMarkdown(markdown).split("\n");
    const html = [];
    let index = 0;
    let paragraph = [];
    let listType = null;
    let listItems = [];

    const flushParagraph = () => {
      if (!paragraph.length) return;
      html.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
      paragraph = [];
    };

    const flushList = () => {
      if (!listType) return;
      const tag = listType;
      html.push(
        `<${tag}>${listItems
          .map((item) => `<li>${renderInlineMarkdown(item)}</li>`)
          .join("")}</${tag}>`,
      );
      listType = null;
      listItems = [];
    };

    while (index < lines.length) {
      const line = lines[index];
      const trimmed = line.trim();

      if (!trimmed) {
        flushParagraph();
        flushList();
        index += 1;
        continue;
      }

      const fenceMatch = trimmed.match(/^```(.*)$/);
      if (fenceMatch) {
        flushParagraph();
        flushList();
        const codeLines = [];
        index += 1;
        while (index < lines.length && !lines[index].trim().startsWith("```")) {
          codeLines.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) index += 1;
        html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        continue;
      }

      if (isMarkdownTableStart(lines, index)) {
        flushParagraph();
        flushList();
        const renderedTable = renderMarkdownTable(lines, index);
        html.push(renderedTable.html);
        index = renderedTable.nextIndex;
        continue;
      }

      const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        flushParagraph();
        flushList();
        const level = headingMatch[1].length;
        html.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
        index += 1;
        continue;
      }

      const unorderedMatch = trimmed.match(/^[-*+]\s+(.+)$/);
      const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
      if (unorderedMatch || orderedMatch) {
        flushParagraph();
        const nextListType = unorderedMatch ? "ul" : "ol";
        if (listType && listType !== nextListType) flushList();
        listType = nextListType;
        listItems.push(unorderedMatch?.[1] || orderedMatch?.[1] || "");
        index += 1;
        continue;
      }

      flushList();
      paragraph.push(trimmed);
      index += 1;
    }

    flushParagraph();
    flushList();
    return html.join("\n");
  }

  function generateJSON(messages, attachments = buildAttachmentExportManifest()) {
    return JSON.stringify(
      {
        conversation: {
          id: state.conversation.id,
          exported: new Date().toISOString(),
          messageCount: messages.length,
          attachmentCount: attachments.length,
          messages,
          attachments,
        },
      },
      null,
      2,
    );
  }

  function generateCSV(messages) {
    const header = "Index,Role,Bookmark,Decision,Content\n";
    const rows = messages
      .map((message) => {
        const content = sanitizeCsvCell(message.content).replace(/"/g, '""');
        return [
          message.index,
          message.role,
          message.bookmark === true ? "true" : "false",
          message.decision === true ? "true" : "false",
          `"${content}"`,
        ].join(",");
      })
      .join("\n");
    return header + rows;
  }

  function generateMarkdown(messages, attachments = buildAttachmentExportManifest()) {
    let markdown = "# ChatGPT Conversation Export\n";
    markdown += `Exported: ${new Date().toLocaleString()}\n\n`;
    markdown += `## Messages (${messages.length})\n\n`;
    messages.forEach((message) => {
      markdown += `### Message ${message.index} - ${message.role}\n`;
      const mark = getExportMarkLabel(message);
      if (mark) markdown += `Mark: ${mark}\n\n`;
      markdown += `${normalizeExportMarkdown(message.content)}\n\n`;
    });
    if (attachments.length) {
      markdown += `## Files (${attachments.length})\n\n`;
      attachments.forEach((attachment) => {
        const path = attachment.exportPath ? ` - ${attachment.exportPath}` : "";
        const status = attachment.included === true ? "included" : "referenced";
        markdown += `- ${formatAttachmentLabel(attachment)} - ${status}${path}\n`;
      });
      markdown += "\n";
    }
    return markdown;
  }

  function getPrintableRoleLabel(role) {
    if (role === "user") return "User query";
    if (role === "assistant") return "Assistant response";
    return "Message";
  }

  function generatePrintableHTML(messages, attachments = buildAttachmentExportManifest()) {
    const rows = messages
      .map(
        (message) => `
          <section class="message role-${escapeHtml(message.role)}">
            <h2>${escapeHtml(getPrintableRoleLabel(message.role))} <span>Message ${message.index}</span></h2>
            ${
              getExportMarkLabel(message)
                ? `<p class="message-mark">Mark: ${escapeHtml(getExportMarkLabel(message))}</p>`
                : ""
            }
            <div class="message-body">${renderMarkdownToHTML(message.content)}</div>
          </section>
        `,
      )
      .join("");
    const fileRows = attachments.length
      ? `
          <section class="files">
            <h2>Files <span>${attachments.length}</span></h2>
            <ul>
              ${attachments
                .map(
                  (attachment) =>
                    `<li>${escapeHtml(formatAttachmentLabel(attachment))}</li>`,
                )
                .join("")}
            </ul>
          </section>
        `
      : "";

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>ChronoChat Conversation Export</title>
  <style>
    @page { margin: 18mm 16mm; }
    * { box-sizing: border-box; }
    body {
      color: #111827;
      font: 12.5px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      margin: 0;
    }
    h1 { font-size: 24px; line-height: 1.2; margin: 0 0 4px; }
    .meta { border-bottom: 1px solid #d1d5db; color: #6b7280; margin: 0 0 22px; padding-bottom: 12px; }
    .message { border-top: 1px solid #e5e7eb; padding: 16px 0 18px; }
    .message:first-of-type { border-top: 0; }
    .message.role-user {
      background: #f9fafb;
      border: 1px solid #9ca3af;
      border-left: 5px solid #111827;
      border-radius: 8px;
      break-inside: avoid;
      margin: 8px 0 18px;
      padding: 12px 14px;
    }
    .message.role-user + .message.role-assistant {
      border-top: 0;
      padding-top: 8px;
    }
    .message > h2 {
      color: #374151;
      font-size: 11px;
      letter-spacing: .04em;
      margin: 0 0 10px;
      text-transform: uppercase;
    }
    .message > h2 span {
      color: #6b7280;
      font-weight: 500;
      letter-spacing: 0;
      margin-left: 6px;
      text-transform: none;
    }
    .message.role-user > h2 {
      color: #111827;
      margin-bottom: 7px;
    }
    .message.role-user .message-body {
      font-size: 14px;
      font-weight: 600;
      line-height: 1.45;
    }
    .message.role-user .message-body p {
      margin: 0 0 6px;
    }
    .message.role-user .message-body p:last-child {
      margin-bottom: 0;
    }
    .message-body h1,
    .message-body h2,
    .message-body h3,
    .message-body h4,
    .message-body h5,
    .message-body h6 {
      break-after: avoid;
      color: #111827;
      line-height: 1.25;
      margin: 16px 0 7px;
    }
    .message-body h1 { font-size: 19px; }
    .message-body h2 { font-size: 17px; }
    .message-body h3 { font-size: 15px; }
    .message-body h4,
    .message-body h5,
    .message-body h6 { font-size: 13px; }
    .message-body p { margin: 0 0 9px; }
    .message-body ul,
    .message-body ol { margin: 0 0 10px 20px; padding: 0; }
    .message-body li { margin: 2px 0; }
    .message-body table {
      border-collapse: collapse;
      break-inside: avoid;
      font-size: 11px;
      margin: 10px 0 14px;
      width: 100%;
    }
    .message-body th,
    .message-body td {
      border: 1px solid #d1d5db;
      padding: 5px 6px;
      text-align: left;
      vertical-align: top;
    }
    .message-body th { background: #f3f4f6; font-weight: 700; }
    .message-body pre {
      background: #f9fafb;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      margin: 9px 0 12px;
      overflow-wrap: anywhere;
      padding: 9px 10px;
      white-space: pre-wrap;
    }
    .message-body code {
      background: #f3f4f6;
      border-radius: 4px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: .94em;
      padding: 1px 3px;
    }
    .message-body pre code { background: transparent; border-radius: 0; padding: 0; }
    .files {
      border-top: 1px solid #d1d5db;
      margin-top: 18px;
      padding-top: 14px;
    }
    .files h2 {
      color: #374151;
      font-size: 11px;
      letter-spacing: .04em;
      margin: 0 0 8px;
      text-transform: uppercase;
    }
    .files ul { margin: 0 0 0 18px; padding: 0; }
    .files li { margin: 3px 0; }
  </style>
</head>
<body>
  <h1>ChatGPT Conversation Export</h1>
  <p class="meta">Exported: ${escapeHtml(new Date().toLocaleString())} - Messages: ${messages.length} - Files: ${attachments.length}</p>
  ${rows}
  ${fileRows}
</body>
</html>`;
  }

  function getExportData(format) {
    const messages = buildExportPayload();
    const attachments = buildAttachmentExportManifest();
    if (format === "json") {
      return {
        content: generateJSON(messages, attachments),
        extension: "json",
        type: "application/json",
      };
    }
    if (format === "csv") {
      return {
        content: generateCSV(messages),
        extension: "csv",
        type: "text/csv",
      };
    }
    if (format === "markdown") {
      return {
        content: generateMarkdown(messages, attachments),
        extension: "md",
        type: "text/markdown",
      };
    }
    return null;
  }

  function printPDFExport() {
    const messages = buildExportPayload();
    const attachments = buildAttachmentExportManifest();
    const frame = document.createElement("iframe");
    frame.className = "jtch-print-frame";
    frame.title = "ChronoChat PDF export";
    frame.setAttribute("aria-hidden", "true");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "1px";
    frame.style.height = "1px";
    frame.style.border = "0";
    frame.style.opacity = "0";
    frame.srcdoc = generatePrintableHTML(messages, attachments);

    frame.addEventListener(
      "load",
      () => {
        if (root.__CHRONOCHAT_TEST__) {
          return;
        }
        try {
          frame.contentWindow?.focus?.();
          frame.contentWindow?.print?.();
        } catch (_) {
          setStatus("PDF export blocked by browser", "error");
          return;
        }
        root.setTimeout(() => frame.remove(), 5000);
      },
      { once: true },
    );

    document.body.appendChild(frame);
    if (!frame.contentWindow) {
      if (root.__CHRONOCHAT_TEST__) {
        setStatus("PDF export opened");
        return true;
      }
      frame.remove();
      setStatus("PDF export blocked by browser", "error");
      return false;
    }
    setStatus("PDF export opened");
    return true;
  }

  async function downloadExport(format) {
    await prepareCompleteExportSnapshot();

    if (format === "pdf") {
      return printPDFExport();
    }
    if (format === "zip") {
      return downloadZipExport();
    }

    const exportData = getExportData(format);
    if (!exportData) {
      setStatus("Unknown export format", "error");
      return false;
    }

    const filename = `chronochat-${createFilenameTimestamp()}.${exportData.extension}`;
    const blob = new Blob([exportData.content], { type: exportData.type });
    const url = root.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    root.setTimeout(() => root.URL.revokeObjectURL(url), 0);
    setStatus(`Exported ${filename}`);
    return true;
  }

  function findAttachment(id) {
    return (state.conversation.attachments || []).find(
      (attachment) => attachment.id === id,
    );
  }

  function sanitizeDownloadName(name, fallback = "chronochat-file") {
    const cleaned = String(name || fallback)
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned || fallback;
  }

  function getExtensionFromMimeType(mimeType) {
    const normalized = String(mimeType || "").toLowerCase().split(";")[0].trim();
    return (
      {
        "application/pdf": "pdf",
        "application/json": "json",
        "text/csv": "csv",
        "text/markdown": "md",
        "text/plain": "txt",
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/gif": "gif",
        "image/webp": "webp",
        "image/svg+xml": "svg",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
        "application/vnd.ms-excel": "xls",
      }[normalized] || ""
    );
  }

  function hasFilenameExtension(name) {
    return /\.[a-z0-9]{2,5}$/i.test(String(name || ""));
  }

  function getZipAttachmentFilename(attachment, blob) {
    const safeName = sanitizeDownloadName(
      attachment.name,
      `attachment-${String((attachment.messageIndex || 0) + 1).padStart(2, "0")}`,
    );
    if (hasFilenameExtension(safeName)) return safeName;
    const extension =
      getExtensionFromMimeType(blob?.type) ||
      String(attachment.typeLabel || "").toLowerCase().match(/^[a-z0-9]{2,5}$/)?.[0] ||
      "";
    return extension ? `${safeName}.${extension}` : safeName;
  }

  function prepareAttachmentPreview() {
    document.dispatchEvent(new CustomEvent("jtch:prepare-attachment-preview"));
  }

  function clickOriginalAttachment(attachment) {
    prepareAttachmentPreview();
    if (attachment.actionNode?.isConnected) {
      attachment.actionNode.click();
      clearStatus();
      return true;
    }

    const target =
      attachment.domNode?.matches?.("a, button, [role='button']")
        ? attachment.domNode
        : attachment.domNode?.querySelector?.(
            "a[href], [data-default-action] button, button:not([role='combobox']), [role='button']:not([role='combobox'])",
          );
    if (!target) return false;
    target.click();
    clearStatus();
    return true;
  }

  function clickAttachmentDownloadAction(attachment) {
    if (!attachment.downloadNode?.isConnected) return false;
    attachment.downloadNode.click();
    clearStatus();
    return true;
  }

  async function fetchAttachmentBlob(attachment) {
    const cached = await ns.storage.getCachedAttachment?.(attachment.cacheKey);
    if (cached?.blob) {
      state.runtime.cachedAttachmentKeys.add(attachment.cacheKey);
      return cached.blob;
    }

    if (attachment.url && !attachment.fileId && !attachment.pointer) {
      const response = await root.fetch(attachment.url, { credentials: "include" });
      if (!response?.ok && response?.status !== 0) {
        throw new Error("Attachment fetch failed");
      }
      const blob = await response.blob();
      await ns.storage.cacheAttachment?.(attachment, blob);
      state.runtime.cachedAttachmentKeys.add(attachment.cacheKey);
      return blob;
    }

    try {
      const backendBlob = await fetchBackendAttachmentBlob(attachment);
      if (backendBlob) {
        await ns.storage.cacheAttachment?.(attachment, backendBlob);
        state.runtime.cachedAttachmentKeys.add(attachment.cacheKey);
        return backendBlob;
      }
    } catch (error) {
      if (!attachment.url) throw error;
    }

    if (!attachment.url) return null;
    const response = await root.fetch(attachment.url, { credentials: "include" });
    if (!response?.ok && response?.status !== 0) {
      throw new Error("Attachment fetch failed");
    }
    const blob = await response.blob();
    await ns.storage.cacheAttachment?.(attachment, blob);
    state.runtime.cachedAttachmentKeys.add(attachment.cacheKey);
    return blob;
  }

  function getFilenameFromContentDisposition(value) {
    const match = String(value || "").match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
    try {
      return match ? decodeURIComponent(match[1].replace(/^"|"$/g, "")) : "";
    } catch (_) {
      return match?.[1] || "";
    }
  }

  async function blobFromDownloadResponse(response) {
    if (!response?.ok && response?.status !== 0) {
      const text = await response?.text?.().catch(() => "");
      throw new Error(`Attachment fetch failed${response?.status ? ` (${response.status})` : ""}${text ? `: ${text.slice(0, 120)}` : ""}`);
    }

    const contentType = response.headers?.get?.("content-type") || "";
    if (/json/i.test(contentType)) {
      const payload = await response.json();
      const downloadUrl = payload.download_url || payload.url;
      if (!downloadUrl) {
        throw new Error("Attachment download URL missing");
      }
      const signedResponse = await root.fetch(downloadUrl, { credentials: "include" });
      return signedResponse.blob();
    }

    return response.blob();
  }

  async function fetchBackendFileBlob(attachment) {
    if (!attachment.fileId) return null;
    const url = new URL(
      `/backend-api/files/download/${encodeURIComponent(attachment.fileId)}`,
      root.location?.origin || "https://chatgpt.com",
    );
    url.searchParams.set("inline", "false");
    if (attachment.backendGizmoId && /^file-/.test(attachment.fileId)) {
      url.searchParams.set("gizmo_id", attachment.backendGizmoId);
    }

    return blobFromDownloadResponse(
      await root.fetch(url.toString(), { credentials: "include" }),
    );
  }

  async function fetchSandboxAttachmentBlob(attachment) {
    if (
      !attachment.pointer?.startsWith?.("sandbox:") ||
      !attachment.backendConversationId ||
      !attachment.backendMessageId
    ) {
      return null;
    }

    const url = new URL(
      `/backend-api/conversation/${encodeURIComponent(
        attachment.backendConversationId,
      )}/interpreter/download`,
      root.location?.origin || "https://chatgpt.com",
    );
    url.searchParams.set("message_id", attachment.backendMessageId);
    url.searchParams.set("sandbox_path", attachment.pointer.replace(/^sandbox:/, ""));

    const metaResponse = await root.fetch(url.toString(), { credentials: "include" });
    if (!metaResponse?.ok) {
      throw new Error(`Sandbox download metadata failed (${metaResponse?.status || "unknown"})`);
    }
    const metadata = await metaResponse.json();
    const downloadUrl = metadata.download_url || metadata.url;
    if (!downloadUrl) throw new Error("Sandbox download URL missing");
    const response = await root.fetch(downloadUrl, { credentials: "include" });
    const blob = await response.blob();
    if (metadata.file_name && !hasFilenameExtension(attachment.name)) {
      attachment.name = sanitizeDownloadName(metadata.file_name);
    }
    return blob;
  }

  async function fetchBackendAttachmentBlob(attachment) {
    if (!attachment) return null;
    if (attachment.pointer?.startsWith?.("sandbox:")) {
      return fetchSandboxAttachmentBlob(attachment);
    }
    if (attachment.fileId) {
      return fetchBackendFileBlob(attachment);
    }
    return null;
  }

  function downloadBlob(blob, filename) {
    const url = root.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = sanitizeDownloadName(filename);
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    root.setTimeout(() => root.URL.revokeObjectURL(url), 0);
  }

  function downloadUrl(url, filename) {
    const link = document.createElement("a");
    link.href = url;
    link.download = sanitizeDownloadName(filename);
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function makeUniqueZipPath(pathName, usedPaths) {
    if (!usedPaths.has(pathName)) {
      usedPaths.add(pathName);
      return pathName;
    }

    const slashIndex = pathName.lastIndexOf("/");
    const directory = slashIndex >= 0 ? pathName.slice(0, slashIndex + 1) : "";
    const fileName = slashIndex >= 0 ? pathName.slice(slashIndex + 1) : pathName;
    const dotIndex = fileName.lastIndexOf(".");
    const base = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
    const extension = dotIndex > 0 ? fileName.slice(dotIndex) : "";
    let suffix = 2;
    let candidate = "";
    do {
      candidate = `${directory}${base}-${suffix}${extension}`;
      suffix += 1;
    } while (usedPaths.has(candidate));
    usedPaths.add(candidate);
    return candidate;
  }

  function downloadByteArray(bytes, filename, type = "application/octet-stream") {
    const blob = new Blob([bytes], { type });
    downloadBlob(blob, filename);
  }

  async function collectZipAttachmentEntries(manifest) {
    const files = {};
    const usedPaths = new Set([
      "conversation.md",
      "conversation.json",
      "conversation.csv",
      "attachments-manifest.json",
    ]);
    const attachments = state.conversation.attachments || [];

    for (let index = 0; index < attachments.length; index += 1) {
      const attachment = attachments[index];
      const manifestEntry = manifest[index];

      try {
        const blob = await fetchAttachmentBlob(attachment);
        if (!blob) {
          manifestEntry.reason = "No readable file URL was exposed by ChatGPT";
          continue;
        }

        const safeName = getZipAttachmentFilename(attachment, blob);
        const zipPath = makeUniqueZipPath(
          `attachments/${String(index + 1).padStart(2, "0")}-${safeName}`,
          usedPaths,
        );
        files[zipPath] = new Uint8Array(await blob.arrayBuffer());
        manifestEntry.included = true;
        manifestEntry.exportPath = zipPath;
        manifestEntry.size = blob.size || files[zipPath].byteLength;
        manifestEntry.mimeType = blob.type || "";
      } catch (error) {
        manifestEntry.reason =
          error?.message || "Attachment could not be fetched automatically";
      }
    }

    return files;
  }

  async function downloadZipExport() {
    await prepareCompleteExportSnapshot();
    const messages = buildExportPayload();
    const manifest = buildAttachmentExportManifest();
    setStatus("Preparing ZIP export...");

    const attachmentFiles = await collectZipAttachmentEntries(manifest);
    const includedCount = manifest.filter((attachment) => attachment.included).length;
    const zipFiles = {
      "conversation.md": encodeZipText(generateMarkdown(messages, manifest)),
      "conversation.json": encodeZipText(generateJSON(messages, manifest)),
      "conversation.csv": encodeZipText(generateCSV(messages)),
      "attachments-manifest.json": encodeZipText(
        JSON.stringify({ attachments: manifest }, null, 2),
      ),
      ...attachmentFiles,
    };

    const zipBytes = createStoredZip(zipFiles);
    const filename = `chronochat-${createFilenameTimestamp()}.zip`;
    downloadByteArray(zipBytes, filename, "application/zip");
    updateAttachmentUi();
    setStatus(
      `ZIP exported: ${includedCount}/${manifest.length} file${manifest.length === 1 ? "" : "s"} included`,
    );
    return true;
  }

  async function downloadAttachment(id) {
    const attachment = findAttachment(id);
    if (!attachment) return false;

    try {
      const blob = await fetchAttachmentBlob(attachment);
      if (blob) {
        downloadBlob(blob, attachment.name);
        updateAttachmentUi();
        clearStatus();
        return true;
      }
    } catch (_) {
      if (attachment.url) {
        downloadUrl(attachment.url, attachment.name);
        clearStatus();
        return true;
      }
    }

    if (clickAttachmentDownloadAction(attachment)) return true;
    setStatus("No direct download action was exposed for this file", "error");
    return false;
  }

  async function openAttachment(id) {
    const attachment = findAttachment(id);
    if (!attachment) return false;

    if (attachment.url) {
      prepareAttachmentPreview();
      root.open?.(attachment.url, "_blank", "noopener");
      clearStatus();
      return true;
    }

    if (clickOriginalAttachment(attachment)) return true;
    scrollToMessage(attachment.messageIndex);
    clearStatus();
    return true;
  }

  ns.features = {
    applySearchState,
    renderFiltersAndMessages,
    updateThemeUi,
    selectMessage,
    selectRelativeMessage,
    clearSelection,
    scrollToMessage,
    focusSearch,
    setFilter,
    setMessageMark,
    toggleMessageMark,
    setSidebarWidth,
    setPreviewFontSize,
    getResponsiveMaxSidebarWidth,
    sanitizeCsvCell,
    generateJSON,
    generateCSV,
    generateMarkdown,
    generatePrintableHTML,
    renderMarkdownToHTML,
    getExportData,
    downloadExport,
    downloadZipExport,
    printPDFExport,
    downloadAttachment,
    openAttachment,
    buildExportPayload,
    buildAttachmentExportManifest,
    updateCountUi,
    updateAttachmentUi,
    setStatus,
  };
})(globalThis);
