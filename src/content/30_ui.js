(function (root) {
  const ns = root.__JTC__;
  let hostToggleButton = null;
  let hostToggleSlot = null;
  let edgeToggleButton = null;

  function createButton({
    id,
    className,
    text,
    label,
    title,
    dataset,
    type = "button",
  }) {
    const button = document.createElement("button");
    if (id) button.id = id;
    if (className) button.className = className;
    button.type = type;
    button.textContent = text;
    if (label) button.setAttribute("aria-label", label);
    if (title) button.title = title;
    if (dataset) {
      Object.entries(dataset).forEach(([key, value]) => {
        button.dataset[key] = value;
      });
    }
    return button;
  }

  function createSidebar() {
    const sidebar = document.createElement("aside");
    sidebar.id = "chatgpt-nav-sidebar";
    sidebar.className = "jtch-sidebar";
    sidebar.setAttribute("aria-label", "ChronoChat navigation");

    const header = document.createElement("div");
    header.className = "jtch-header";

    const titleRow = document.createElement("div");
    titleRow.className = "jtch-title-row";

    const title = document.createElement("div");
    title.className = "jtch-title";
    title.textContent = "ChronoChat";

    const titleMeta = document.createElement("div");
    titleMeta.className = "jtch-title-meta";

    const count = document.createElement("span");
    count.id = "message-count";
    count.className = "jtch-count";
    count.setAttribute("aria-live", "polite");
    count.textContent = "0";

    const closeButton = createButton({
      id: "sidebar-close",
      className: "jtch-icon-button jtch-sidebar-close",
      text: "×",
      label: "Close sidebar",
      title: "Close sidebar",
    });

    titleMeta.appendChild(count);
    titleMeta.appendChild(closeButton);
    titleRow.appendChild(title);
    titleRow.appendChild(titleMeta);

    const exportGroup = document.createElement("div");
    exportGroup.className = "jtch-export-group";
    exportGroup.id = "export-group";
    exportGroup.setAttribute("aria-label", "Export conversation");
    [
      { label: "JSON", format: "json" },
      { label: "CSV", format: "csv" },
      { label: "MD", format: "markdown" },
      { label: "PDF", format: "pdf" },
    ].forEach((exportOption) => {
      exportGroup.appendChild(
        createButton({
          className: "jtch-export-button",
          text: exportOption.label,
          label: `Export ${exportOption.label}`,
          dataset: { exportFormat: exportOption.format },
        }),
      );
    });

    const filterGroup = document.createElement("div");
    filterGroup.className = "jtch-filter-group";
    filterGroup.id = "filter-group";
    filterGroup.setAttribute("aria-label", "Message filters");
    [
      { label: "All", value: "all" },
      { label: "You", value: "user" },
      { label: "AI", value: "assistant" },
    ].forEach((filter, index) => {
      filterGroup.appendChild(
        createButton({
          className: index === 0 ? "jtch-filter active" : "jtch-filter",
          text: filter.label,
          label: `Filter ${filter.label}`,
          dataset: { filter: filter.value },
        }),
      );
    });

    const searchRow = document.createElement("div");
    searchRow.className = "jtch-search-row";

    const searchInput = document.createElement("input");
    searchInput.id = "message-search";
    searchInput.className = "jtch-search-input";
    searchInput.type = "text";
    searchInput.placeholder = "Search messages";
    searchInput.setAttribute("aria-label", "Search messages");

    searchRow.appendChild(searchInput);

    const searchOptions = document.createElement("div");
    searchOptions.className = "jtch-search-options";
    [
      { id: "regex-toggle", label: "Regex", option: "regex" },
      { id: "case-toggle", label: "Aa", option: "caseSensitive" },
    ].forEach((option) => {
      searchOptions.appendChild(
        createButton({
          id: option.id,
          className: "jtch-option-toggle",
          text: option.label,
          label:
            option.option === "regex"
              ? "Use regular expression search"
              : "Use case sensitive search",
          dataset: { searchOption: option.option },
        }),
      );
    });

    const previewControls = document.createElement("div");
    previewControls.className = "jtch-preview-controls";
    previewControls.id = "preview-controls";
    previewControls.setAttribute("aria-label", "Preview text size");
    [
      { label: "A-", action: "decrease", aria: "Decrease preview text size" },
      { label: "A", action: "reset", aria: "Reset preview text size" },
      { label: "A+", action: "increase", aria: "Increase preview text size" },
    ].forEach((control) => {
      previewControls.appendChild(
        createButton({
          className: "jtch-preview-size-button",
          text: control.label,
          label: control.aria,
          dataset: { previewSizeAction: control.action },
        }),
      );
    });

    const searchMeta = document.createElement("div");
    searchMeta.id = "search-meta";
    searchMeta.className = "jtch-search-meta";

    header.appendChild(titleRow);
    header.appendChild(exportGroup);
    header.appendChild(filterGroup);
    header.appendChild(searchRow);
    header.appendChild(searchOptions);
    header.appendChild(previewControls);
    header.appendChild(searchMeta);

    const attachmentDropBox = document.createElement("details");
    attachmentDropBox.id = "attachment-dropbox";
    attachmentDropBox.className = "jtch-attachment-dropbox";

    const attachmentSummary = document.createElement("summary");
    attachmentSummary.className = "jtch-attachment-summary";
    attachmentSummary.setAttribute("aria-label", "Conversation files");

    const attachmentSummaryBody = document.createElement("span");
    attachmentSummaryBody.className = "jtch-attachment-summary-body";

    const attachmentTitle = document.createElement("span");
    attachmentTitle.className = "jtch-attachment-title";
    attachmentTitle.textContent = "Files";

    const attachmentTypes = document.createElement("span");
    attachmentTypes.id = "attachment-types";
    attachmentTypes.className = "jtch-attachment-types";
    attachmentTypes.textContent = "No files";

    const attachmentCount = document.createElement("span");
    attachmentCount.id = "attachment-count";
    attachmentCount.className = "jtch-attachment-count";
    attachmentCount.textContent = "0";
    attachmentCount.setAttribute("aria-live", "polite");

    const attachmentCaret = document.createElement("span");
    attachmentCaret.className = "jtch-attachment-caret";
    attachmentCaret.setAttribute("aria-hidden", "true");
    attachmentCaret.textContent = ">";

    attachmentSummaryBody.appendChild(attachmentTitle);
    attachmentSummaryBody.appendChild(attachmentTypes);
    attachmentSummary.appendChild(attachmentSummaryBody);
    attachmentSummary.appendChild(attachmentCount);
    attachmentSummary.appendChild(attachmentCaret);

    const attachmentList = document.createElement("ul");
    attachmentList.id = "attachment-list";
    attachmentList.className = "jtch-attachment-list";
    attachmentList.setAttribute("aria-label", "Conversation files");

    attachmentDropBox.appendChild(attachmentSummary);
    attachmentDropBox.appendChild(attachmentList);

    const messageSection = document.createElement("div");
    messageSection.className = "jtch-section jtch-message-section";

    const messageList = document.createElement("ul");
    messageList.id = "message-list";
    messageList.className = "jtch-list";
    messageList.setAttribute("aria-label", "Conversation messages");
    messageList.setAttribute("role", "listbox");

    messageSection.appendChild(messageList);

    const resizeHandle = document.createElement("div");
    resizeHandle.id = "sidebar-resize-handle";
    resizeHandle.className = "jtch-resize-handle";
    resizeHandle.setAttribute("role", "separator");
    resizeHandle.setAttribute("aria-orientation", "vertical");
    resizeHandle.setAttribute("aria-label", "Resize ChronoChat sidebar");
    resizeHandle.tabIndex = 0;

    sidebar.appendChild(header);
    sidebar.appendChild(attachmentDropBox);
    sidebar.appendChild(messageSection);
    sidebar.appendChild(resizeHandle);
    return sidebar;
  }

  function getOrCreateHostToggleButton() {
    const existing = document.getElementById("chatgpt-nav-toggle");
    if (existing) {
      hostToggleButton = existing;
      return hostToggleButton;
    }

    if (!hostToggleButton) {
      hostToggleButton = createButton({
        id: "chatgpt-nav-toggle",
        className: "jtch-host-toggle",
        text: "Chrono",
        label: "Open ChronoChat",
        title: "Open ChronoChat",
      });
    }

    return hostToggleButton;
  }

  function getOrCreateHostToggleSlot() {
    const existing = document.getElementById("chatgpt-nav-toggle-slot");
    if (existing) {
      hostToggleSlot = existing;
      return hostToggleSlot;
    }

    if (!hostToggleSlot) {
      hostToggleSlot = document.createElement("div");
      hostToggleSlot.id = "chatgpt-nav-toggle-slot";
      hostToggleSlot.className = "jtch-host-toggle-slot";
    }

    return hostToggleSlot;
  }

  function getOrCreateEdgeToggleButton() {
    const existing = document.getElementById("chatgpt-nav-edge-toggle");
    if (existing) {
      edgeToggleButton = existing;
      return edgeToggleButton;
    }

    if (!edgeToggleButton) {
      edgeToggleButton = createButton({
        id: "chatgpt-nav-edge-toggle",
        className: "jtch-edge-toggle",
        text: ">",
        label: "Open ChronoChat",
        title: "Open ChronoChat",
      });
    }

    return edgeToggleButton;
  }

  function syncHostTogglePosition() {
    const slot = getOrCreateHostToggleSlot();
    const actionBar = ns.dom.getConversationActionBar();
    const reference = actionBar
      ? ns.dom.getConversationActionReference(actionBar)
      : null;

    if (!actionBar || !reference) {
      slot.hidden = true;
      slot.remove();
      return { mounted: false, slot };
    }

    if (!slot.contains(getOrCreateHostToggleButton())) {
      slot.appendChild(getOrCreateHostToggleButton());
    }

    if (slot.parentElement !== actionBar || slot.nextElementSibling !== reference) {
      actionBar.insertBefore(slot, reference);
    }

    slot.hidden = Boolean(ns.state?.ui?.sidebarVisible);
    return { mounted: true, slot };
  }

  function ensureHostToggleMounted() {
    const toggle = getOrCreateHostToggleButton();
    const slot = getOrCreateHostToggleSlot();
    if (!slot.contains(toggle)) {
      slot.appendChild(toggle);
    }

    const { mounted } = syncHostTogglePosition();

    return { toggle, slot, mounted };
  }

  function ensureUiRoot() {
    let sidebar = document.getElementById("chatgpt-nav-sidebar");

    if (!sidebar) {
      sidebar = createSidebar();
      document.body.appendChild(sidebar);
    }

    const edgeToggle = getOrCreateEdgeToggleButton();
    if (!edgeToggle.isConnected) {
      document.body.appendChild(edgeToggle);
    }

    const { toggle, slot, mounted } = ensureHostToggleMounted();
    return { sidebar, toggle, edgeToggle, toggleSlot: slot, toggleMounted: mounted };
  }

  ns.ui = {
    ensureUiRoot,
    ensureHostToggleMounted,
    syncHostTogglePosition,
  };
})(globalThis);
