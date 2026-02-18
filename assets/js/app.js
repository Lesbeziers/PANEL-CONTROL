const columns = [
  { key: "listo", label: "LISTO", type: "checkbox" },
  { key: "title", label: "TÍTULO", type: "text" },
  { key: "startDate", label: "INICIO VIG", type: "text" },
  { key: "endDate", label: "FIN VIG", type: "text" },
  { key: "genre", label: "GÉNERO", type: "text" },
  { key: "id", label: "ID", type: "text" },
];

const headers = columns.map((column) => column.label);

let rowId = 0;

function newRow() {
  rowId += 1;
  return { id: `row-${Date.now()}-${rowId}`, blockType: "", listo: false, title: "" };
}

function newRowForBlock(blockType) {
  const row = newRow();
  row.blockType = blockType;
  return row;
}

let blocks = [
  { id: "block-1", blockType: "Promo 20", headerColor: "#70ad47", rows: [newRowForBlock("Promo 20")] },
  { id: "block-2", blockType: "Promo 20", headerColor: "#fcc000", rows: [newRowForBlock("Promo 20")] },
];
let contextMenu = { open: false, x: 0, y: 0, blockIndex: -1, rowIndex: -1 };
let menuElement = null;
let selectedCell = null;
let selectedCellState = null;
let editingCell = null;
let titleOverlayLayer = null;

function getTitleOverlayLayer() {
  if (titleOverlayLayer?.isConnected) {
    return titleOverlayLayer;
  }

  const gridRoot = document.querySelector(".month-block__body-grid");
  if (!gridRoot) {
    return null;
  }

  const layer = document.createElement("div");
  layer.className = "title-edit-overlay-layer";
  gridRoot.appendChild(layer);
  titleOverlayLayer = layer;
  return titleOverlayLayer;
}

function setSelectedCell(cell) {
  if (selectedCell && selectedCell !== cell && selectedCell.isConnected) {
    selectedCell.classList.remove("is-selected");
  }

  selectedCell = cell;

  if (selectedCell?.dataset?.rowId && selectedCell?.dataset?.columnKey) {
    selectedCellState = {
      rowId: selectedCell.dataset.rowId,
      columnKey: selectedCell.dataset.columnKey,
    };
  } else {
    selectedCellState = null;
  }

  if (selectedCell?.isConnected) {
    selectedCell.classList.add("is-selected");

    const gridRoot = document.querySelector(".month-block__body-grid");
    if (gridRoot && !editingCell) {
      gridRoot.focus({ preventScroll: true });
    }
  }
}

function isSelectedCellState(row, columnKey) {
  return selectedCellState?.rowId === row.id && selectedCellState?.columnKey === columnKey;
}

function getCellMeta(cell) {
  if (!cell?.dataset) {
    return null;
  }

  const blockIndex = Number.parseInt(cell.dataset.blockIndex, 10);
  const rowIndex = Number.parseInt(cell.dataset.rowIndex, 10);
  const columnKey = cell.dataset.columnKey;

  if (Number.isNaN(blockIndex) || Number.isNaN(rowIndex) || !columnKey) {
    return null;
  }

  return { blockIndex, rowIndex, columnKey };
}

function getRowByCell(cell) {
  const meta = getCellMeta(cell);
  if (!meta) {
    return null;
  }

  const block = blocks[meta.blockIndex];
  const row = block?.rows?.[meta.rowIndex];
  if (!row) {
    return null;
  }

  return { meta, row };
}

function getColumnByKey(columnKey) {
  return columns.find((column) => column.key === columnKey) || null;
}

function parseCellValue(columnKey, rawValue) {
  const column = getColumnByKey(columnKey);
  const textValue = `${rawValue ?? ""}`;

  if (!column) {
    return textValue;
  }

  if (column.type === "checkbox") {
    const normalized = textValue.trim().toLowerCase();
    return ["true", "1", "x", "si", "sí"].includes(normalized);
  }

  if (columnKey === "title") {
    return textValue.slice(0, 100);
  }

  return textValue;
}

function setCellValue(cell, rawValue) {
  const rowData = getRowByCell(cell);
  if (!rowData) {
    return null;
  }

  const { row, meta } = rowData;
  const parsedValue = parseCellValue(meta.columnKey, rawValue);

  if (meta.columnKey === "title") {
    row.title = parsedValue;
    const titleText = cell.querySelector(".title-cell__text");
    if (titleText) {
      titleText.textContent = row.title;
      titleText.title = row.title;
    }
  } else if (meta.columnKey === "listo") {
    row.listo = parsedValue;
    const checkbox = cell.querySelector('input[type="checkbox"]');
    if (checkbox) {
      checkbox.checked = row.listo;
    }
  }

  return { row, meta };
}

function focusCellEditor(cell) {
  if (!cell) {
    return;
  }

  const columnKey = cell.dataset.columnKey;
  if (columnKey === "title" && typeof cell.openEditMode === "function") {
    cell.openEditMode({ keepContent: true });
    return;
  }

  if (columnKey === "listo") {
    const checkbox = cell.querySelector('input[type="checkbox"]');
    if (checkbox) {
      checkbox.focus();
    }
  }
}

function moveSelectionDownWithinBlock(cell) {
  const meta = getCellMeta(cell);
  if (!meta) {
    return { moved: false, cell };
  }

  const block = blocks[meta.blockIndex];
  const nextRowIndex = meta.rowIndex + 1;
  if (!block || nextRowIndex >= block.rows.length) {
    return { moved: false, cell };
  }

  const nextCell = document.querySelector(
    `[data-block-index="${meta.blockIndex}"][data-row-index="${nextRowIndex}"][data-column-key="${meta.columnKey}"]`
  );

  if (!nextCell) {
    return { moved: false, cell };
  }

  setSelectedCell(nextCell);
  return { moved: true, cell: nextCell };
}

function getAdjacentCellByArrow(cell, key) {
  const meta = getCellMeta(cell);
  if (!meta) {
    return null;
  }

  if (key === "ArrowLeft" || key === "ArrowRight") {
    const row = cell.parentElement;
    if (!row) {
      return null;
    }

    const rowCells = [...row.querySelectorAll("[data-column-key]")];
    const currentIndex = rowCells.indexOf(cell);
    if (currentIndex < 0) {
      return null;
    }

    const delta = key === "ArrowLeft" ? -1 : 1;
    return rowCells[currentIndex + delta] || null;
  }

  if (key === "ArrowUp" || key === "ArrowDown") {
    const block = blocks[meta.blockIndex];
    if (!block) {
      return null;
    }

    const delta = key === "ArrowUp" ? -1 : 1;
    const nextRowIndex = meta.rowIndex + delta;
    if (nextRowIndex < 0 || nextRowIndex >= block.rows.length) {
      return null;
    }

    return document.querySelector(
      `[data-block-index="${meta.blockIndex}"][data-row-index="${nextRowIndex}"][data-column-key="${meta.columnKey}"]`
    );
  }

  return null;
}

function focusCellWithoutEditing(cell) {
  if (!cell || editingCell) {
    return;
  }

  requestAnimationFrame(() => {
    if (!editingCell) {
      const gridRoot = document.querySelector(".month-block__body-grid");
      gridRoot?.focus({ preventScroll: true });
    }
  });
}

function isEditingElement(element) {
  if (!element) {
    return false;
  }

  const tagName = element.tagName?.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || element.isContentEditable;
}

function handleGridEnterKey(event) {
  const isArrowNavigationKey = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key);
  const isPrintableKey = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
  const hasSelectedCell = !!selectedCell && !!getCellMeta(selectedCell);

  if (editingCell) {
    if (event.key === "Enter") {
      event.preventDefault();
      const currentCell = editingCell.cell;
      editingCell.commit();
      const nextSelection = moveSelectionDownWithinBlock(currentCell);
      focusCellWithoutEditing(nextSelection.cell);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      editingCell.cancel();
      focusCellWithoutEditing(selectedCell);
      return;
    }

    if (isArrowNavigationKey) {
      return;
      }

    return;
  }

  if (!hasSelectedCell) {
    return;
  }

  if (isArrowNavigationKey) {
    if (isEditingElement(document.activeElement)) {
      return;
    }

    const nextCell = getAdjacentCellByArrow(selectedCell, event.key);
    if (!nextCell) {
      return;
    }

    event.preventDefault();
    setSelectedCell(nextCell);
    focusCellWithoutEditing(nextCell);
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    const nextSelection = moveSelectionDownWithinBlock(selectedCell);
    focusCellWithoutEditing(nextSelection.cell);
    return;
  }

  if (event.key === "F2" && selectedCell.dataset.columnKey === "title" && typeof selectedCell.openEditMode === "function") {
    event.preventDefault();
    selectedCell.openEditMode({ keepContent: true });
    return;
  }

  if (isPrintableKey && selectedCell.dataset.columnKey === "title" && typeof selectedCell.openEditMode === "function") {
    event.preventDefault();
    selectedCell.openEditMode({ replaceWith: event.key });
    return;
  }

  if ((event.key === "Delete" || event.key === "Backspace") && selectedCell) {
    const rowData = getRowByCell(selectedCell);
    if (!rowData) {
      return;
    }

    event.preventDefault();
    setCellValue(selectedCell, "");
    
    focusCellEditor(selectedCell);
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v" && selectedCell.dataset.columnKey === "title") {
    return;
  }
}

function handleGridPaste(event) {
  if (!selectedCell || editingCell) {
    return;
  }

  const rowData = getRowByCell(selectedCell);
  if (!rowData) {
    return;
  }

  event.preventDefault();
  const pastedText = event.clipboardData?.getData("text/plain") || "";
  if (!setCellValue(selectedCell, pastedText)) {
    return;
  }
}
function insertRow(blockIndex, atIndex) {
  const block = blocks[blockIndex];
  if (!block) {
    return;
  }

  const nextRows = [...block.rows];
  nextRows.splice(atIndex, 0, newRowForBlock(block.blockType));
  blocks[blockIndex] = { ...block, rows: nextRows };
  renderRows();
}

function ensureContextMenuElement() {
  if (menuElement) {
    return menuElement;
  }

  menuElement = document.createElement("div");
  menuElement.className = "context-menu";
  menuElement.setAttribute("role", "menu");
  menuElement.innerHTML = `
    <button type="button" class="context-menu__item" data-action="above" role="menuitem">Insertar fila encima</button>
    <button type="button" class="context-menu__item" data-action="below" role="menuitem">Insertar fila debajo</button>
  `;

  menuElement.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target || !contextMenu.open) {
      return;
    }

    if (target.dataset.action === "above") {
      insertRow(contextMenu.blockIndex, contextMenu.rowIndex);
    } else {
      insertRow(contextMenu.blockIndex, contextMenu.rowIndex + 1);
    }

    closeContextMenu();
  });

  document.body.appendChild(menuElement);
  return menuElement;
}

function handleOutsidePointer(event) {
  if (menuElement && !menuElement.contains(event.target)) {
    closeContextMenu();
  }
}

function handleMenuEscape(event) {
  if (event.key === "Escape") {
    closeContextMenu();
  }
}

function closeContextMenu() {
  contextMenu = { open: false, x: 0, y: 0, blockIndex: -1, rowIndex: -1 };
  if (menuElement) {
    menuElement.classList.remove("open");
  }
  document.removeEventListener("mousedown", handleOutsidePointer);
  document.removeEventListener("keydown", handleMenuEscape);
}

function openContextMenu(event, blockIndex, rowIndex) {
  event.preventDefault();

  contextMenu = {
    open: true,
    x: event.clientX,
    y: event.clientY,
    blockIndex,
    rowIndex,
  };

  const menu = ensureContextMenuElement();
  menu.classList.add("open");
  menu.style.left = `${contextMenu.x}px`;
  menu.style.top = `${contextMenu.y}px`;

  document.addEventListener("mousedown", handleOutsidePointer);
  document.addEventListener("keydown", handleMenuEscape);
}

function createLeftRow({ group = false, cells = [], onAddRow } = {}) {
  const leftRow = document.createElement("div");
  leftRow.className = `left-row ${group ? "group" : ""}`;

  for (let i = 0; i < 7; i++) {
    const cell = document.createElement("div");

    if (i === 0) {
      cell.classList.add("gutter");
      if (group) {
        const addBtn = document.createElement("button");
        addBtn.className = "gutter-icon-btn";
        addBtn.type = "button";
        addBtn.setAttribute("aria-label", "Añadir fila");
        addBtn.textContent = "+";
        addBtn.addEventListener("click", () => {
          if (typeof onAddRow === "function") {
            onAddRow();
          }
        });

        const removeBtn = document.createElement("button");
        removeBtn.className = "gutter-icon-btn";
        removeBtn.type = "button";
        removeBtn.setAttribute("aria-label", "Eliminar fila");
        removeBtn.textContent = "−";

        cell.append(addBtn, removeBtn);
      }
    } else if (group && i === 2 && cells[i] && typeof cells[i] === "object") {
      const leftText = document.createElement("span");
      leftText.textContent = cells[i].left || "";
      const rightText = document.createElement("span");
      rightText.textContent = cells[i].right || "";
      cell.classList.add("group-title-cell");
      cell.append(leftText, rightText);
    } else {
      cell.textContent = cells[i] || "";
    }

    leftRow.appendChild(cell);
  }

  return leftRow;
}

function createDayRow(group = false) {
  const dayRow = document.createElement("div");
  dayRow.className = `day-row ${group ? "group" : ""}`;

  for (let day = 1; day <= 31; day++) {
    const dayCell = document.createElement("div");
    dayCell.className = `day-cell ${day > 28 ? "inactive" : ""}`;
    dayRow.appendChild(dayCell);
  }

  return dayRow;
}

function attachListoCheckbox(cell, row) {
  cell.classList.add("checkbox-cell");
  cell.textContent = "";
  cell.tabIndex = 0;

  const input = document.createElement("input");
  input.type = "checkbox";
  input.className = "listo-checkbox";
  input.checked = !!row.listo;
  input.setAttribute("aria-label", "Marcar LISTO");

  const toggleListo = () => {
    row.listo = !row.listo;
    input.checked = row.listo;
  };

  input.addEventListener("change", () => {
    row.listo = input.checked;
  });

  cell.addEventListener("click", (event) => {
    setSelectedCell(cell);    
    if (event.target === input) {
      return;
    }
    toggleListo();
  });

  cell.addEventListener("keydown", (event) => {
    if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      toggleListo();
    }
  });

  cell.addEventListener("focus", () => {
    setSelectedCell(cell);
  });
  
  cell.appendChild(input);
}

function attachTitleCell(cell, row) {
  cell.classList.add("title-cell");
  let isEditing = false;

  const placeCaretAtEnd = (editorEl) => {
    if (!editorEl || !editorEl.isConnected) {
      return;
    }

    if (editorEl instanceof HTMLInputElement || editorEl instanceof HTMLTextAreaElement) {
      const end = editorEl.value.length;
      editorEl.setSelectionRange(end, end);
      return;
    }

    if (!editorEl.isContentEditable) {
      return;
    }

    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    const range = document.createRange();
    range.selectNodeContents(editorEl);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const focusTitleEditor = (editorEl) => {
    if (!editorEl || !editorEl.isConnected) {
      return;
    }

    editorEl.focus({ preventScroll: true });
    placeCaretAtEnd(editorEl);
  };
  
  const renderReadMode = () => {
    isEditing = false;
    cell.classList.remove("is-editing");    
    cell.textContent = "";
    const text = document.createElement("span");
    text.className = "title-cell__text";
    text.textContent = row.title || "";
    text.title = row.title || "";
    cell.appendChild(text);
  };

  const openEditMode = ({ replaceWith, keepContent = false } = {}) => {
    if (isEditing) {
      if (editingCell?.input) {
        editingCell.input.focus();
      }
      return;
    }

    isEditing = true;
    cell.classList.add("is-editing");
    const overlayLayer = getTitleOverlayLayer();
    if (!overlayLayer) {
      return;
    }

    const input = document.createElement("input");
    input.type = "text";
    input.className = "title-cell__input editor-overlay is-editing";
    input.disabled = false;
    input.readOnly = false;
    input.maxLength = 100;
    input.value = replaceWith !== undefined ? replaceWith : row.title || "";
    if (keepContent) {
      input.value = row.title || "";
    }
    const originalValue = row.title || "";
    let cancelled = false;

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    const updateOverlayPosition = () => {
      const gridRoot = overlayLayer.parentElement;
      if (!gridRoot) {
        return;
      }

      const cellRect = cell.getBoundingClientRect();
      const rootRect = gridRoot.getBoundingClientRect();
      const styles = window.getComputedStyle(cell);
      const horizontalPadding = Number.parseFloat(styles.paddingLeft || "0") + Number.parseFloat(styles.paddingRight || "0") + 24;
      const fontWeight = window.getComputedStyle(input).fontWeight || styles.fontWeight;
      const fontSize = window.getComputedStyle(input).fontSize || styles.fontSize;
      const fontFamily = window.getComputedStyle(input).fontFamily || styles.fontFamily;

      let measuredWidth = cellRect.width;
      if (context) {
        context.font = `${fontWeight} ${fontSize} ${fontFamily}`;
        const textWidth = context.measureText(input.value || " ").width;
        measuredWidth = textWidth + horizontalPadding;
      }

      const maxWidth = Math.max(cellRect.width, rootRect.right - cellRect.left - 2);
      const width = Math.min(maxWidth, Math.max(cellRect.width, measuredWidth));

      input.style.left = `${cellRect.left - rootRect.left}px`;
      input.style.top = `${cellRect.top - rootRect.top}px`;
      input.style.width = `${width}px`;
      input.style.height = `${cellRect.height}px`;
    };

    const cleanupEditingState = () => {
      if (editingCell?.cell === cell) {
        editingCell = null;
      }
    };

    const commit = () => {
      if (cancelled) {
        return;
      }
      
      row.title = (input.value || "").slice(0, 100);
      input.remove();
      window.removeEventListener("resize", updateOverlayPosition);
      cleanupEditingState();
      renderReadMode();
    };

    const cancel = () => {
      cancelled = true;
      row.title = originalValue;
      input.remove();
      window.removeEventListener("resize", updateOverlayPosition);
      cleanupEditingState();
      renderReadMode();
    };

    input.addEventListener("input", () => {
      if (input.value.length > 100) {
        input.value = input.value.slice(0, 100);
      }
    });

    input.addEventListener("blur", commit, { once: true });

    editingCell = {
      cell,
      input,
      commit: () => input.blur(),
      cancel,
    };

    overlayLayer.appendChild(input);
    window.addEventListener("resize", updateOverlayPosition);
    updateOverlayPosition();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        focusTitleEditor(input);
      });
    });
  };

  cell.openEditMode = openEditMode;

  cell.addEventListener("click", () => {
    setSelectedCell(cell);
  });

  cell.addEventListener("dblclick", () => {
    setSelectedCell(cell);
    openEditMode({ keepContent: true });
  });

  cell.addEventListener("focus", () => {
    setSelectedCell(cell);
  });
  
  renderReadMode();
}

function renderMonthBlockGrid(root) {
  root.innerHTML = `
    <section class="month-block" aria-label="MonthBlockGrid Febrero 2026">
      <header class="month-block__header">
        <div class="left-header" id="left-header"></div>
        <div class="right-header-scroll" id="right-header-scroll">
          <div class="right-header-track" id="right-header-track"></div>
        </div>
      </header>
      <div class="month-block__body">
        <div class="month-block__body-grid" tabindex="0" aria-label="Grid de planificación">
          <div class="left-grid" id="left-body"></div>
          <div class="right-body-scroll" id="right-body-scroll">
            <div id="right-body"></div>
          </div>
        </div>
      </div>
    </section>
  `;

  const leftHeader = root.querySelector("#left-header");
  headers.forEach((label) => {
    const cell = document.createElement("div");
    cell.textContent = label;
    leftHeader.appendChild(cell);
  });

  const dayHeader = root.querySelector("#right-header-track");
  for (let day = 1; day <= 31; day++) {
    const cell = document.createElement("div");
    cell.className = `day-cell ${day > 28 ? "inactive" : ""}`;
    cell.textContent = day;
    dayHeader.appendChild(cell);
  }

  renderRows();

  const gridRoot = root.querySelector(".month-block__body-grid");
  gridRoot?.addEventListener("keydown", handleGridEnterKey);
  gridRoot?.addEventListener("paste", handleGridPaste);
}

function renderRows() {
  const leftBody = document.getElementById("left-body");
  const rightBody = document.getElementById("right-body");

  leftBody.innerHTML = "";
  rightBody.innerHTML = "";
  selectedCell = null;
  
  blocks.forEach((block, blockIndex) => {
    const groupLeftRow = createLeftRow({
      group: true,
      cells: ["", "", { left: block.blockType.toUpperCase(), right: "(Máximo 5 simultáneas)" }, "", "", "", ""],
      onAddRow: () => insertRow(blockIndex, 0),
    });
    const groupDayRow = createDayRow(true);

    if (block.headerColor) {
      groupLeftRow.style.setProperty("--group-bg", block.headerColor);
      groupDayRow.style.setProperty("--group-bg", block.headerColor);
    }

    leftBody.appendChild(groupLeftRow);
    rightBody.appendChild(groupDayRow);
    block.rows.forEach((row, rowIndex) => {
      const leftRow = createLeftRow();
      const dayRow = createDayRow();
      
      attachListoCheckbox(leftRow.children[1], row);
      attachTitleCell(leftRow.children[2], row);

      leftRow.children[1].dataset.blockIndex = String(blockIndex);
      leftRow.children[1].dataset.rowIndex = String(rowIndex);
      leftRow.children[1].dataset.rowId = row.id;
      leftRow.children[1].dataset.columnKey = "listo";
      if (isSelectedCellState(row, "listo")) {
        selectedCell = leftRow.children[1];
        selectedCell.classList.add("is-selected");
      }

      leftRow.children[2].dataset.blockIndex = String(blockIndex);
      leftRow.children[2].dataset.rowIndex = String(rowIndex);
      leftRow.children[2].dataset.rowId = row.id;
      leftRow.children[2].dataset.columnKey = "title";
      leftRow.children[2].tabIndex = 0;
      if (isSelectedCellState(row, "title")) {
        selectedCell = leftRow.children[2];
        selectedCell.classList.add("is-selected");
      }

      leftRow.addEventListener("contextmenu", (event) => openContextMenu(event, blockIndex, rowIndex));
      dayRow.addEventListener("contextmenu", (event) => openContextMenu(event, blockIndex, rowIndex));

      leftBody.appendChild(leftRow);
      rightBody.appendChild(dayRow);
    });
  });
}

renderMonthBlockGrid(document.getElementById("app"));
