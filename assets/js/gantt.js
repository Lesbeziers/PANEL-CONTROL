(function initGanttModule(globalScope) {
  const DEFAULT_VIEW = {
    month: 2,
    year: 2026,
  };

  const DEFAULT_CONTAINER_SELECTOR = "#gantt";

  function daysInMonth(month, year) {
    return new Date(year, month, 0).getDate();
  }

  function normalizeView(view) {
    const month = Number.isInteger(view?.month) && view.month >= 1 && view.month <= 12
      ? view.month
      : DEFAULT_VIEW.month;
    const year = Number.isInteger(view?.year) && view.year >= 1
      ? view.year
      : DEFAULT_VIEW.year;

    return { month, year };
  }

  function resolveContainer(container) {
    if (container instanceof HTMLElement) {
      return container;
    }

    if (typeof container === "string") {
      return document.querySelector(container);
    }

    return document.querySelector(DEFAULT_CONTAINER_SELECTOR);
  }

  function normalizeBlocks(blocksInput, rowsInput) {
    if (Array.isArray(blocksInput) && blocksInput.length > 0) {
      return blocksInput.map((block, index) => ({
        id: block.id ?? `block-${index + 1}`,
        name: block.name ?? block.blockType ?? `Bloque ${index + 1}`,
        colorClass: block.colorClass ?? (index % 2 === 0 ? "is-green" : "is-yellow"),
        rows: Number.isInteger(block.rows) && block.rows > 0
          ? block.rows
          : Array.isArray(block.rows)
            ? block.rows.length
            : 1,
      }));
    }

    const rows = Number.isInteger(rowsInput) && rowsInput > 0 ? rowsInput : 3;

    return [
      { id: "block-1", name: "Bloque 1", colorClass: "is-green", rows },
      { id: "block-2", name: "Bloque 2", colorClass: "is-yellow", rows },
    ];
  }

  function renderMonthHeader(days) {
    const row = document.createElement("div");
    row.className = "ganttMonthHeader";

    for (let day = 1; day <= days; day += 1) {
      const cell = document.createElement("div");
      cell.className = "ganttDayCell";
      cell.textContent = String(day);
      row.appendChild(cell);
    }

    return row;
  }

  function renderGridRow(days, rowClassName = "") {
    const row = document.createElement("div");
    row.className = `ganttGridRow ${rowClassName}`.trim();

    for (let day = 1; day <= days; day += 1) {
      const cell = document.createElement("div");
      cell.className = "ganttGridCell";
      row.appendChild(cell);
    }

    return row;
  }

  function renderBlock(block, days) {
    const fragment = document.createDocumentFragment();

    const blockHeader = document.createElement("div");
    blockHeader.className = `ganttBlockHeader ${block.colorClass}`.trim();
    blockHeader.textContent = block.name;
    fragment.appendChild(blockHeader);
    fragment.appendChild(renderGridRow(days, "is-block-header"));

    for (let index = 0; index < block.rows; index += 1) {
      const leftRow = document.createElement("div");
      leftRow.className = "ganttRowLabel";
      leftRow.textContent = "";
      fragment.appendChild(leftRow);
      fragment.appendChild(renderGridRow(days));
    }

    return fragment;
  }

  function initGantt({ blocks, rows, view, container } = {}) {
    const host = resolveContainer(container);
    if (!host) {
      return null;
    }

    const currentView = normalizeView(view);
    const days = daysInMonth(currentView.month, currentView.year);
    const normalizedBlocks = normalizeBlocks(blocks, rows);

    host.classList.add("ganttRoot");
    host.innerHTML = "";

    const layout = document.createElement("div");
    layout.className = "ganttLayout";

    const leftColumn = document.createElement("div");
    leftColumn.className = "ganttLeftColumn";

    const rightColumn = document.createElement("div");
    rightColumn.className = "ganttRightColumn";

    host.style.setProperty("--gantt-days", String(days));

    leftColumn.appendChild(document.createElement("div")).className = "ganttMonthSpacer";
    rightColumn.appendChild(renderMonthHeader(days));

    normalizedBlocks.forEach((block) => {
      const blockRows = renderBlock(block, days);
      const leftNodes = [];
      const rightNodes = [];

      [...blockRows.childNodes].forEach((node, index) => {
        if (index % 2 === 0) {
          leftNodes.push(node);
        } else {
          rightNodes.push(node);
        }
      });

      leftNodes.forEach((node) => leftColumn.appendChild(node));
      rightNodes.forEach((node) => rightColumn.appendChild(node));
    });

    layout.appendChild(leftColumn);
    layout.appendChild(rightColumn);
    host.appendChild(layout);

    return host;
  }

  globalScope.initGantt = initGantt;

  document.addEventListener("DOMContentLoaded", () => {
    const ganttContainer = document.getElementById("gantt");
    if (!ganttContainer) {
      return;
    }

    initGantt({
      container: ganttContainer,
      view: { month: 2, year: 2026 },
      blocks: [
        { id: "block-promo", name: "Promo 20", colorClass: "is-green", rows: 3 },
        { id: "block-club", name: "Promo 20", colorClass: "is-yellow", rows: 3 },
      ],
    });
  });
})(window);
