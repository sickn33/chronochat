(function (root) {
  const ns = root.__JTC__;
  const state = ns.state;
  const { clamp, escapeRegExp, createFilenameTimestamp } = ns.utils;

  function getElement(id) {
    return document.getElementById(id);
  }

  function getMessageList() {
    return getElement("message-list");
  }

  function setStatus(message, tone = "info") {
    const element = getElement("jtch-status");
    if (!element) return;
    if (!message) {
      element.textContent = "";
      element.className = "jtch-status hidden";
      return;
    }
    element.textContent = message;
    element.className = `jtch-status jtch-status-${tone}`;
  }

  function updateThemeUi() {
    const toggle = getElement("theme-toggle");
    if (!toggle) return;
    const preference = state.ui.themePreference;
    const effectiveTheme =
      preference === "system-like" ? ns.dom.detectHostTheme() : preference;
    state.ui.effectiveTheme = effectiveTheme;

    const sidebar = getElement("chatgpt-nav-sidebar");
    const floatingToggle = getElement("chatgpt-nav-toggle");
    [sidebar, floatingToggle].forEach((element) => {
      if (!element) return;
      element.classList.remove("theme-dark", "theme-light");
      element.classList.add(
        effectiveTheme === "dark" ? "theme-dark" : "theme-light",
      );
    });

    const labelMap = {
      "system-like": "Auto",
      dark: "Dark",
      light: "Light",
    };
    toggle.textContent = labelMap[preference];
    toggle.title =
      preference === "system-like"
        ? "Using ChatGPT theme"
        : `Theme override: ${preference}`;
  }

  function cycleThemePreference() {
    const order = ["system-like", "dark", "light"];
    const currentIndex = order.indexOf(state.ui.themePreference);
    state.ui.themePreference = order[(currentIndex + 1) % order.length];
    updateThemeUi();
    ns.storage.persistTheme();
  }

  function compileSearchPattern(term, isRegex, caseSensitive) {
    if (!term) {
      return { matcher: null, error: null };
    }

    try {
      const source = isRegex ? term : escapeRegExp(term);
      const flags = caseSensitive ? "u" : "iu";
      const regex = new RegExp(source, flags);
      return {
        matcher: (message) => regex.test(message),
        error: null,
      };
    } catch (error) {
      if (
        error.message.includes("Unmatched") ||
        error.message.includes("Unterminated")
      ) {
        return { matcher: null, error: "Unmatched parenthesis or bracket" };
      }
      if (error.message.includes("range")) {
        return { matcher: null, error: "Invalid character range" };
      }
      return { matcher: null, error: "Invalid regex syntax" };
    }
  }

  function applySearchState(partialState) {
    const searchState = {
      ...state.ui.search,
      ...partialState,
    };
    searchState.term = String(searchState.term || "");

    const { matcher, error } = compileSearchPattern(
      searchState.term,
      searchState.isRegex,
      searchState.caseSensitive,
    );

    if (!searchState.term) {
      searchState.matcher = null;
      searchState.lastValidMatcher = null;
      searchState.lastError = null;
    } else if (error) {
      searchState.matcher = searchState.lastValidMatcher;
      searchState.lastError = error;
    } else {
      searchState.matcher = matcher;
      searchState.lastValidMatcher = matcher;
      searchState.lastError = null;
    }

    state.ui.search = searchState;
    state.ui.virtualization.start = 0;
    renderFiltersAndMessages();
  }

  function doesMessageMatch(message) {
    const { term, matcher, caseSensitive } = state.ui.search;
    if (!term) return true;

    if (matcher) {
      return matcher(message.fullText) || matcher(message.preview);
    }

    const haystack = caseSensitive
      ? `${message.fullText} ${message.preview}`
      : `${message.fullText} ${message.preview}`.toLowerCase();
    const needle = caseSensitive ? term : term.toLowerCase();
    return haystack.includes(needle);
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
    const start = clamp(state.ui.virtualization.start, 0, maxStart);
    state.ui.virtualization.start = start;
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
    const maxLength = clamp(
      state.ui.previewLen,
      80,
      ns.config.maxPreviewLength + 60,
    );
    const preview =
      message.preview.length > maxLength
        ? `${message.preview.slice(0, maxLength)}...`
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
    if (state.ui.search.lastError) {
      meta.textContent = `${state.ui.search.lastError}. Keeping previous valid search.`;
      meta.className = "jtch-search-meta error";
      return;
    }

    const { term, matchCount, isRegex, caseSensitive } = state.ui.search;
    if (!term) {
      meta.textContent = "Use / to focus search, j/k to navigate, Enter to jump.";
      meta.className = "jtch-search-meta";
      return;
    }

    const parts = [`${matchCount} match${matchCount === 1 ? "" : "es"}`];
    if (isRegex) parts.push("regex");
    if (caseSensitive) parts.push("case-sensitive");
    meta.textContent = parts.join(" • ");
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

  function updatePreferenceUi() {
    const compact = getElement("pref-compact");
    const previewSelect = getElement("pref-preview-len");
    if (compact) compact.checked = state.ui.compact;
    if (previewSelect) previewSelect.value = String(state.ui.previewLen);
  }

  function updateSearchUi() {
    const searchInput = getElement("message-search");
    const regexButton = getElement("regex-toggle");
    const caseButton = getElement("case-toggle");
    if (searchInput) searchInput.value = state.ui.search.term;
    if (regexButton) {
      regexButton.classList.toggle("active", state.ui.search.isRegex);
    }
    if (caseButton) {
      caseButton.classList.toggle("active", state.ui.search.caseSensitive);
      caseButton.textContent = state.ui.search.caseSensitive ? "Aa" : "aa";
    }
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
    updatePreferenceUi();
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
    message.domNode.scrollIntoView({ behavior: "smooth", block: "center" });
    message.domNode.classList.add("jtch-target-highlight");
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
    state.ui.virtualization.start = 0;
    renderFiltersAndMessages();
  }

  function setCompact(value) {
    state.ui.compact = Boolean(value);
    getMessageList()?.classList.toggle("compact", state.ui.compact);
    ns.storage.persistPrefs();
  }

  function setPreviewLength(value) {
    state.ui.previewLen = clamp(Number(value) || 120, 80, 220);
    ns.storage.persistPrefs();
    renderFiltersAndMessages();
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
    if (/^[=+\-@]/.test(stringValue)) {
      return `'${stringValue}`;
    }
    return stringValue;
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
      markdown += `${message.content}\n\n`;
    });
    return markdown;
  }

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    root.setTimeout(() => URL.revokeObjectURL(url), 50);
  }

  function exportConversation(format) {
    const messages = buildExportPayload();
    if (messages.length === 0) {
      setStatus("No messages available to export.", "warning");
      return;
    }

    switch (format) {
      case "json":
        downloadFile(
          generateJSON(messages),
          `chat-${createFilenameTimestamp()}.json`,
          "application/json",
        );
        break;
      case "csv":
        downloadFile(
          generateCSV(messages),
          `chat-${createFilenameTimestamp()}.csv`,
          "text/csv",
        );
        break;
      case "md":
        downloadFile(
          generateMarkdown(messages),
          `chat-${createFilenameTimestamp()}.md`,
          "text/markdown",
        );
        break;
      default:
        setStatus("Unsupported export format.", "warning");
        return;
    }

    setStatus("Conversation exported.", "success");
  }

  ns.features = {
    applySearchState,
    compileSearchPattern,
    renderFiltersAndMessages,
    updateThemeUi,
    cycleThemePreference,
    selectMessage,
    selectRelativeMessage,
    clearSelection,
    scrollToMessage,
    focusSearch,
    setFilter,
    setCompact,
    setPreviewLength,
    exportConversation,
    sanitizeCsvCell,
    generateJSON,
    generateCSV,
    generateMarkdown,
    buildExportPayload,
    updateCountUi,
    setStatus,
  };
})(globalThis);
