(function (root) {
  const ns = root.__JTC__;
  let hostToggleButton = null;
  let hostToggleSlot = null;

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
    const exportGroup = document.createElement("div");
    exportGroup.className = "jtch-export-group";

    const exportToggle = createButton({
      id: "export-toggle",
      className: "jtch-export-toggle jtch-icon-button",
      text: "Export",
      label: "Export conversation",
      title: "Export conversation",
      dataset: {
        exportMenuToggle: "true",
      },
    });
    exportToggle.setAttribute("aria-haspopup", "menu");
    exportToggle.setAttribute("aria-expanded", "false");

    const exportMenu = document.createElement("div");
    exportMenu.id = "export-menu";
    exportMenu.className = "jtch-export-menu";
    exportMenu.setAttribute("role", "menu");
    exportMenu.hidden = true;

    [
      { label: "JSON", value: "json" },
      { label: "CSV", value: "csv" },
      { label: "Markdown", value: "markdown" },
      { label: "DOCX", value: "docx" },
      { label: "PDF", value: "pdf" },
    ].forEach((format) => {
      exportMenu.appendChild(
        createButton({
          className: "jtch-export-item",
          text: format.label,
          label: `Export as ${format.label}`,
          dataset: { exportFormat: format.value },
        }),
      );
    });

    exportGroup.appendChild(exportToggle);
    exportGroup.appendChild(exportMenu);
    titleMeta.appendChild(exportGroup);
    titleMeta.appendChild(closeButton);
    titleRow.appendChild(title);
    titleRow.appendChild(titleMeta);

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

    searchRow.appendChild(searchInput);

    const searchMeta = document.createElement("div");
    searchMeta.id = "search-meta";
    searchMeta.className = "jtch-search-meta";

    header.appendChild(titleRow);
    header.appendChild(filterGroup);
    header.appendChild(searchRow);
    header.appendChild(searchMeta);

    const messageSection = document.createElement("div");
    messageSection.className = "jtch-section jtch-message-section";

    const messageList = document.createElement("ul");
    messageList.id = "message-list";
    messageList.className = "jtch-list";
    messageList.setAttribute("aria-label", "Conversation messages");

    messageSection.appendChild(messageList);

    sidebar.appendChild(header);
    sidebar.appendChild(messageSection);
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
        text: "Jump",
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

    const { toggle, slot, mounted } = ensureHostToggleMounted();
    return {
      sidebar,
      toggle,
      toggleSlot: slot,
      toggleMounted: mounted,
      exportToggle: document.getElementById("export-toggle"),
      exportMenu: document.getElementById("export-menu"),
    };
  }

  ns.ui = {
    ensureUiRoot,
    ensureHostToggleMounted,
    syncHostTogglePosition,
  };
})(globalThis);
