(function (root) {
  const ns = root.__JTC__;
  const state = ns.state;
  const { clamp } = ns.utils;

  function getElement(id) {
    return document.getElementById(id);
  }

  function getMessageList() {
    return getElement("message-list");
  }

  function setStatus() {}

  function getExportToggle() {
    return getElement("export-toggle");
  }

  function getExportMenu() {
    return getElement("export-menu");
  }

  function getExportMessages() {
    return ns.dom
      .collectMessages()
      .map((message) => {
      if (typeof ns.exporters?.buildMessageDocument === "function") {
        return ns.exporters.buildMessageDocument(message, message.fullText || message.preview || "");
      }

      return {
        index: message.index,
        role: message.role,
        content: message.fullText || message.preview || "",
      };
      })
      .filter(
        (message) =>
          Boolean(
            (Array.isArray(message?.blocks) && message.blocks.length > 0) ||
              String(message?.content || "").trim(),
          ),
      );
  }

  function formatExportTimestamp(date = new Date()) {
    return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  }

  function sanitizeConversationId(conversationId) {
    const value = String(conversationId || "unknown")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return value || "unknown";
  }

  function escapeCsvValue(value) {
    const raw = String(value ?? "");
    const guarded = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
    return `"${guarded.replace(/"/g, '""')}"`;
  }

  function buildExportPayload(exportedAt = new Date().toISOString()) {
    const messages = getExportMessages();
    return {
      conversationId: state.conversation.id,
      exportedAt,
      messageCount: messages.length,
      messages,
    };
  }

  function generateJSON(payload = buildExportPayload()) {
    return `${JSON.stringify(payload, null, 2)}\n`;
  }

  function generateCSV(payload = buildExportPayload()) {
    const rows = [["Index", "Role", "Content"]];
    payload.messages.forEach((message) => {
      rows.push([message.index, message.role, message.content]);
    });
    return `${rows
      .map((row) => row.map(escapeCsvValue).join(","))
      .join("\n")}\n`;
  }

  function renderMessageMarkdown(message) {
    if (message.blocks?.length && typeof ns.exporters?.renderBlocksToMarkdown === "function") {
      return ns.exporters.renderBlocksToMarkdown(message.blocks).trim();
    }
    return message.content || "";
  }

  function generateMarkdown(payload = buildExportPayload()) {
    const lines = [
      "# Export",
      "",
      "## Metadata",
      "",
      `- Conversation ID: ${payload.conversationId}`,
      `- Exported At: ${payload.exportedAt}`,
      `- Message Count: ${payload.messageCount}`,
      "",
      "## Messages",
      "",
    ];

    payload.messages.forEach((message) => {
      lines.push(`## ${message.index}. ${message.role}`);
      lines.push("");
      lines.push(renderMessageMarkdown(message) || message.content || "");
      lines.push("");
    });

    return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
  }

  function buildExportFilename(conversationId, exportedAt, extension) {
    return `chronochat-${sanitizeConversationId(conversationId)}-${formatExportTimestamp(
      new Date(exportedAt),
    )}.${extension}`;
  }

  function updateExportMenuUi() {
    const menu = getExportMenu();
    const toggle = getExportToggle();
    const open = Boolean(state.ui.exportMenuOpen);

    if (menu) {
      menu.hidden = !open;
    }

    if (toggle) {
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.classList.toggle("active", open);
    }
  }

  function openExportMenu() {
    state.ui.exportMenuOpen = true;
    updateExportMenuUi();
  }

  function closeExportMenu({ restoreFocus = false } = {}) {
    state.ui.exportMenuOpen = false;
    updateExportMenuUi();
    if (restoreFocus) {
      getExportToggle()?.focus?.();
    }
  }

  function toggleExportMenu() {
    if (state.ui.exportMenuOpen) {
      closeExportMenu();
      return;
    }
    openExportMenu();
  }

  function exportConversation(format) {
    const normalizedFormat = String(format || "").toLowerCase();
    const exportedAt = new Date().toISOString();
    const payload = buildExportPayload(exportedAt);
    let content = "";
    let extension = normalizedFormat;
    let mimeType = "text/plain;charset=utf-8";

    switch (normalizedFormat) {
      case "json":
        content = generateJSON(payload);
        extension = "json";
        mimeType = "application/json;charset=utf-8";
        break;
      case "csv":
        content = generateCSV(payload);
        extension = "csv";
        mimeType = "text/csv;charset=utf-8";
        break;
      case "markdown":
        content = generateMarkdown(payload);
        extension = "md";
        mimeType = "text/markdown;charset=utf-8";
        break;
      case "docx":
        extension = "docx";
        mimeType =
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        break;
      case "pdf":
        extension = "pdf";
        mimeType = "application/pdf";
        break;
      default:
        return null;
    }

    const filename = buildExportFilename(
      payload.conversationId,
      payload.exportedAt,
      extension,
    );
    const result = {
      ...payload,
      filename,
      mimeType,
      content,
    };
    const downloadBlob = (downloadContent) => {
      const blob = new Blob([downloadContent], { type: mimeType });
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = filename;
      anchor.rel = "noopener";
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      const isMockedClick = typeof anchor.click === "function" && "mock" in anchor.click;
      const shouldInvokeClick = typeof root.process === "undefined" || isMockedClick;
      if (shouldInvokeClick) {
        anchor.click();
      }
      anchor.remove();
      root.setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
      }, 0);
    };

    if (normalizedFormat === "docx") {
      Promise.resolve(ns.exporters?.renderDocx?.(payload))
        .then((bytes) => {
          result.content = bytes;
          downloadBlob(bytes);
        })
        .catch((error) => {
          ns.log.error("DOCX export failed", error);
        });
      return result;
    }

    if (normalizedFormat === "pdf") {
      Promise.resolve(ns.exporters?.renderPdf?.(payload))
        .then((bytes) => {
          result.content = bytes;
          downloadBlob(bytes);
        })
        .catch((error) => {
          ns.log.error("PDF export failed", error);
        });
      return result;
    }

    downloadBlob(content);
    return result;
  }

  function updateThemeUi() {
    const effectiveTheme = ns.dom.detectHostTheme();
    const sidebar = getElement("chatgpt-nav-sidebar");
    const floatingToggle = getElement("chatgpt-nav-toggle");

    [sidebar, floatingToggle].forEach((element) => {
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
    };
    searchState.term = String(searchState.term || "");
    state.ui.search = searchState;
    state.ui.virtualization.start = null;
    renderFiltersAndMessages();
  }

  function doesMessageMatch(message) {
    const term = state.ui.search.term;
    if (!term) return true;

    const haystack = `${message.fullText} ${message.preview}`.toLowerCase();
    return haystack.includes(term.toLowerCase());
  }

  function computeVisibleIndices() {
    const indices = [];
    state.conversation.messages.forEach((message) => {
      const filterMatches =
        state.ui.currentFilter === "all" ||
        state.ui.currentFilter === message.role;
      if (filterMatches && doesMessageMatch(message)) {
        indices.push(message.index);
      }
    });
    state.conversation.visibleIndices = indices;
    state.ui.search.matchCount = indices.length;
    return indices;
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
    const start =
      Number.isInteger(state.ui.virtualization.start)
        ? clamp(state.ui.virtualization.start, 0, maxStart)
        : maxStart;
    state.ui.virtualization.start = start;
    return {
      windowIndices: indices.slice(start, start + pageSize),
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
      item.classList.toggle(
        "selected",
        actualIndex === state.ui.selectedMessageIndex,
      );
    });
  }

  function createMessageItem(message) {
    const item = document.createElement("li");
    item.className = `jtch-item role-${message.role}`;
    item.dataset.messageIndex = String(message.index);
    item.dataset.role = message.role;
    item.dataset.preview = message.preview;
    item.tabIndex = 0;
    item.setAttribute("aria-label", `${message.role}: ${message.preview}`);

    const badge = document.createElement("span");
    badge.className = "jtch-role-badge";
    badge.textContent =
      message.role === "assistant" ? "AI" : message.role === "user" ? "You" : "—";

    const text = document.createElement("span");
    text.className = "jtch-item-text";
    const preview =
      message.preview.length > ns.config.maxPreviewLength
        ? `${message.preview.slice(0, ns.config.maxPreviewLength)}...`
        : message.preview;
    text.textContent = preview;

    item.appendChild(badge);
    item.appendChild(text);
    return item;
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
      button.classList.toggle(
        "active",
        button.dataset.filter === state.ui.currentFilter,
      );
    });
  }

  function updateSearchUi() {
    const searchInput = getElement("message-search");
    if (searchInput) searchInput.value = state.ui.search.term;
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
    updateSearchUi();
    updateCountUi();
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
    const scrollTarget =
      ns.dom.resolveMessageScrollTarget?.(message.domNode) || message.domNode;
    scrollTarget.scrollIntoView({ behavior: "smooth", block: "start" });
    scrollTarget.classList.add("jtch-target-highlight");
    root.setTimeout(() => {
      scrollTarget?.classList.remove("jtch-target-highlight");
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
    state.ui.virtualization.start = null;
    renderFiltersAndMessages();
  }

  ns.features = {
    buildExportPayload,
    applySearchState,
    closeExportMenu,
    exportConversation,
    formatExportTimestamp,
    generateCSV,
    generateJSON,
    generateMarkdown,
    openExportMenu,
    renderFiltersAndMessages,
    updateThemeUi,
    updateExportMenuUi,
    selectMessage,
    selectRelativeMessage,
    clearSelection,
    scrollToMessage,
    focusSearch,
    setFilter,
    updateCountUi,
    setStatus,
    toggleExportMenu,
  };
})(globalThis);
