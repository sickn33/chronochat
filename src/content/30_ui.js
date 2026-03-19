(function (root) {
  const ns = root.__JTC__;

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
    title.textContent = "Conversation map";

    const count = document.createElement("span");
    count.id = "message-count";
    count.className = "jtch-count";
    count.setAttribute("aria-live", "polite");
    count.textContent = "0";

    const actions = document.createElement("div");
    actions.className = "jtch-header-actions";

    const themeButton = createButton({
      id: "theme-toggle",
      className: "jtch-icon-button",
      text: "Auto",
      label: "Cycle theme preference",
      title: "Cycle theme preference",
    });

    const exportButton = createButton({
      id: "export-toggle",
      className: "jtch-icon-button",
      text: "Export",
      label: "Open export menu",
      title: "Open export menu",
    });

    const closeButton = createButton({
      id: "sidebar-close",
      className: "jtch-icon-button",
      text: "Close",
      label: "Close sidebar",
      title: "Close sidebar",
    });

    const exportMenu = document.createElement("div");
    exportMenu.id = "export-menu";
    exportMenu.className = "jtch-export-menu hidden";
    ["json", "csv", "md"].forEach((format) => {
      exportMenu.appendChild(
        createButton({
          className: "jtch-export-option",
          text: format.toUpperCase(),
          label: `Export ${format.toUpperCase()}`,
          dataset: { format },
        }),
      );
    });

    actions.appendChild(themeButton);
    actions.appendChild(exportButton);
    actions.appendChild(closeButton);

    titleRow.appendChild(title);
    titleRow.appendChild(count);
    titleRow.appendChild(actions);

    const filterGroup = document.createElement("div");
    filterGroup.className = "jtch-filter-group";
    filterGroup.id = "filter-group";
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

    const regexButton = createButton({
      id: "regex-toggle",
      className: "jtch-search-toggle",
      text: ".*",
      label: "Toggle regex search",
      title: "Toggle regex search",
    });

    const caseButton = createButton({
      id: "case-toggle",
      className: "jtch-search-toggle",
      text: "Aa",
      label: "Toggle case sensitivity",
      title: "Toggle case sensitivity",
    });

    const clearSearch = createButton({
      id: "search-clear",
      className: "jtch-search-clear",
      text: "Clear",
      label: "Clear search",
      title: "Clear search",
    });

    searchRow.appendChild(searchInput);
    searchRow.appendChild(regexButton);
    searchRow.appendChild(caseButton);
    searchRow.appendChild(clearSearch);

    const searchMeta = document.createElement("div");
    searchMeta.id = "search-meta";
    searchMeta.className = "jtch-search-meta";

    const prefsRow = document.createElement("div");
    prefsRow.className = "jtch-prefs";

    const compactLabel = document.createElement("label");
    compactLabel.className = "jtch-pref";
    const compactCheckbox = document.createElement("input");
    compactCheckbox.type = "checkbox";
    compactCheckbox.id = "pref-compact";
    compactLabel.appendChild(compactCheckbox);
    compactLabel.appendChild(document.createTextNode(" Compact"));

    const previewLabel = document.createElement("label");
    previewLabel.className = "jtch-pref jtch-pref-select";
    previewLabel.appendChild(document.createTextNode("Preview"));
    const previewSelect = document.createElement("select");
    previewSelect.id = "pref-preview-len";
    [100, 140, 180, 220].forEach((value) => {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = `${value}`;
      previewSelect.appendChild(option);
    });
    previewLabel.appendChild(previewSelect);

    prefsRow.appendChild(compactLabel);
    prefsRow.appendChild(previewLabel);

    const status = document.createElement("div");
    status.id = "jtch-status";
    status.className = "jtch-status hidden";

    header.appendChild(titleRow);
    header.appendChild(exportMenu);
    header.appendChild(filterGroup);
    header.appendChild(searchRow);
    header.appendChild(searchMeta);
    header.appendChild(prefsRow);
    header.appendChild(status);

    const messageSection = document.createElement("div");
    messageSection.className = "jtch-section jtch-message-section";

    const messageList = document.createElement("ul");
    messageList.id = "message-list";
    messageList.className = "jtch-list";
    messageList.setAttribute("aria-label", "Conversation messages");

    messageSection.appendChild(messageList);

    const resizeHandle = document.createElement("div");
    resizeHandle.id = "sidebar-resize-handle";
    resizeHandle.className = "jtch-resize-handle";
    resizeHandle.setAttribute("aria-hidden", "true");

    sidebar.appendChild(header);
    sidebar.appendChild(messageSection);
    sidebar.appendChild(resizeHandle);
    return sidebar;
  }

  function createToggleButton() {
    return createButton({
      id: "chatgpt-nav-toggle",
      className: "jtch-toggle-button",
      text: "Chrono",
      label: "Toggle ChronoChat sidebar",
      title: "Open ChronoChat",
    });
  }

  function ensureUiRoot() {
    let sidebar = document.getElementById("chatgpt-nav-sidebar");
    let toggle = document.getElementById("chatgpt-nav-toggle");

    if (!toggle) {
      toggle = createToggleButton();
      document.body.appendChild(toggle);
    }

    if (!sidebar) {
      sidebar = createSidebar();
      document.body.appendChild(sidebar);
    }

    return { sidebar, toggle };
  }

  ns.ui = {
    ensureUiRoot,
  };
})(globalThis);
