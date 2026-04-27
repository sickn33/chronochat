(function (root) {
  const ns = root.__JTC__;
  const state = ns.state;
  const { clamp, createFilenameTimestamp } = ns.utils;

  function getElement(id) {
    return document.getElementById(id);
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
    state.ui.search = searchState;
    state.ui.status = "";
    state.ui.virtualization.visibleStart = null;

    if ("regex" in partialState || "caseSensitive" in partialState) {
      ns.storage.scheduleSave?.();
    }

    renderFiltersAndMessages();
  }

  function doesMessageMatch(message) {
    const term = state.ui.search.term;
    if (!term) return true;

    const haystack = `${message.fullText} ${message.preview}`;
    if (state.ui.search.regex) {
      try {
        const flags = state.ui.search.caseSensitive ? "" : "i";
        return new RegExp(term, flags).test(haystack);
      } catch (_) {
        state.ui.search.error = "Invalid regex";
        return false;
      }
    }

    if (state.ui.search.caseSensitive) {
      return haystack.includes(term);
    }

    return haystack.toLowerCase().includes(term.toLowerCase());
  }

  function computeVisibleIndices() {
    const indices = [];
    state.ui.search.error = "";

    state.conversation.messages.forEach((message) => {
      const filterMatches =
        state.ui.currentFilter === "all" ||
        state.ui.currentFilter === message.role;
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

    const text = document.createElement("span");
    text.className = "jtch-item-text";
    renderPreview(text, message.fullText || message.preview);

    item.appendChild(badge);
    item.appendChild(text);
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
    return attachment.typeLabel.slice(0, 3).toUpperCase();
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
    const attachments = state.conversation.attachments || [];

    if (count) count.textContent = String(attachments.length);
    if (types) {
      const typeSummary = Array.from(
        new Set(
          attachments
            .map((attachment) => getAttachmentSummaryType(attachment))
            .filter(Boolean),
        ),
      ).slice(0, 3);
      types.textContent = typeSummary.length ? typeSummary.join(", ") : "No files";
    }
    if (dropbox) {
      dropbox.classList.toggle("empty", attachments.length === 0);
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

  function getSearchModeLabel() {
    const modes = [];
    if (state.ui.search.regex) modes.push("Regex");
    if (state.ui.search.caseSensitive) modes.push("Aa");
    return modes.length ? ` (${modes.join(" + ")})` : "";
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

    const modeLabel = getSearchModeLabel();
    if (!state.ui.search.term) {
      meta.textContent = modeLabel ? `Search mode${modeLabel}` : "";
      meta.className = "jtch-search-meta";
      return;
    }

    const count = state.ui.search.matchCount;
    meta.textContent = `${count} match${count === 1 ? "" : "es"}${modeLabel}`;
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
    document.querySelectorAll("[data-search-option]").forEach((button) => {
      const active = Boolean(state.ui.search[button.dataset.searchOption]);
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
      button.title = active ? "Enabled" : "Disabled";
    });
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

  function scrollToMessage(index) {
    const message = state.conversation.messages[index];
    if (!message?.domNode) return;
    message.domNode.classList.add("jtch-target-highlight");
    message.domNode.scrollIntoView({ behavior: "smooth", block: "start" });
    root.setTimeout(() => {
      message.domNode?.classList.remove("jtch-target-highlight");
    }, ns.config.highlightDuration);
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
    return state.conversation.messages.map((message) => ({
      index: message.index,
      role: message.role,
      content: message.fullText,
    }));
  }

  function sanitizeCsvCell(value) {
    const stringValue = value == null ? "" : String(value);
    if (/^\s*[=+\-@]/.test(stringValue)) {
      return `'${stringValue}`;
    }
    return stringValue;
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

  function generateJSON(messages) {
    return JSON.stringify(
      {
        conversation: {
          id: state.conversation.id,
          exported: new Date().toISOString(),
          messageCount: messages.length,
          messages,
        },
      },
      null,
      2,
    );
  }

  function generateCSV(messages) {
    const header = "Index,Role,Content\n";
    const rows = messages
      .map((message) => {
        const content = sanitizeCsvCell(message.content).replace(/"/g, '""');
        return `${message.index},${message.role},"${content}"`;
      })
      .join("\n");
    return header + rows;
  }

  function generateMarkdown(messages) {
    let markdown = "# ChatGPT Conversation Export\n";
    markdown += `Exported: ${new Date().toLocaleString()}\n\n`;
    markdown += `## Messages (${messages.length})\n\n`;
    messages.forEach((message) => {
      markdown += `### Message ${message.index} - ${message.role}\n`;
      markdown += `${normalizeExportMarkdown(message.content)}\n\n`;
    });
    return markdown;
  }

  function getPrintableRoleLabel(role) {
    if (role === "user") return "User query";
    if (role === "assistant") return "Assistant response";
    return "Message";
  }

  function generatePrintableHTML(messages) {
    const rows = messages
      .map(
        (message) => `
          <section class="message role-${escapeHtml(message.role)}">
            <h2>${escapeHtml(getPrintableRoleLabel(message.role))} <span>Message ${message.index}</span></h2>
            <div class="message-body">${renderMarkdownToHTML(message.content)}</div>
          </section>
        `,
      )
      .join("");

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
  </style>
</head>
<body>
  <h1>ChatGPT Conversation Export</h1>
  <p class="meta">Exported: ${escapeHtml(new Date().toLocaleString())} - Messages: ${messages.length}</p>
  ${rows}
</body>
</html>`;
  }

  function getExportData(format) {
    const messages = buildExportPayload();
    if (format === "json") {
      return {
        content: generateJSON(messages),
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
        content: generateMarkdown(messages),
        extension: "md",
        type: "text/markdown",
      };
    }
    return null;
  }

  function printPDFExport() {
    const messages = buildExportPayload();
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
    frame.srcdoc = generatePrintableHTML(messages);

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
      frame.remove();
      setStatus("PDF export blocked by browser", "error");
      return false;
    }
    setStatus("PDF export opened");
    return true;
  }

  function downloadExport(format) {
    if (format === "pdf") {
      return printPDFExport();
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

  function prepareAttachmentPreview() {
    document.dispatchEvent(new CustomEvent("jtch:prepare-attachment-preview"));
  }

  function clickOriginalAttachment(attachment) {
    prepareAttachmentPreview();
    if (attachment.actionNode?.isConnected) {
      attachment.actionNode.click();
      setStatus(`Opened ${attachment.name}`);
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
    setStatus(`Opened ${attachment.name}`);
    return true;
  }

  function clickAttachmentDownloadAction(attachment) {
    if (!attachment.downloadNode?.isConnected) return false;
    attachment.downloadNode.click();
    setStatus(`Saved ${attachment.name}`);
    return true;
  }

  async function fetchAttachmentBlob(attachment) {
    const cached = await ns.storage.getCachedAttachment?.(attachment.cacheKey);
    if (cached?.blob) {
      state.runtime.cachedAttachmentKeys.add(attachment.cacheKey);
      return cached.blob;
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

  async function downloadAttachment(id) {
    const attachment = findAttachment(id);
    if (!attachment) return false;

    try {
      const blob = await fetchAttachmentBlob(attachment);
      if (blob) {
        downloadBlob(blob, attachment.name);
        updateAttachmentUi();
        setStatus(`Saved ${attachment.name} locally`);
        return true;
      }
    } catch (_) {
      if (attachment.url) {
        downloadUrl(attachment.url, attachment.name);
        setStatus(`Downloaded ${attachment.name}`);
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
      setStatus(`Opened ${attachment.name}`);
      return true;
    }

    if (clickOriginalAttachment(attachment)) return true;
    scrollToMessage(attachment.messageIndex);
    setStatus(`Located ${attachment.name}`);
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
    printPDFExport,
    downloadAttachment,
    openAttachment,
    buildExportPayload,
    updateCountUi,
    updateAttachmentUi,
    setStatus,
  };
})(globalThis);
