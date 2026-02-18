const columns = [
  { key: "listo", label: "LISTO", type: "checkbox" },
  { key: "title", label: "TÍTULO", type: "text" },
  { key: "startDate", label: "INICIO VIG", type: "text" },
  { key: "endDate", label: "FIN VIG", type: "text" },
  {
    key: "genre",
    label: "GÉNERO",
    type: "text",
    cellType: "select",
    options: ["Caza y Pesca", "Cine", "Deportes", "Entretenimiento", "Ficción", "No ficción", "Series"],
  },
  { key: "id", label: "ID", type: "text" },
];

const headers = columns.map((column) => column.label);
const DATE_DEFAULT_MONTH = 2; // TODO: read active month dynamically.
const DATE_DEFAULT_YEAR = 2026; // TODO: read active year dynamically.
const DATE_COLUMNS = new Set(["startDate", "endDate"]);

let rowId = 0;

function newRow() {
  rowId += 1;
  return {
    rowKey: `row-${Date.now()}-${rowId}`,
    id: "",
    blockType: "",
    listo: false,
    title: "",
    genre: "",
    startDateText: "",
    startDateISO: null,
    endDateText: "",
    endDateISO: null,
  };
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
let genreMenuElement = null;
let fillHandleElement = null;
let fillDragState = null;
const DRAG_THRESHOLD_PX = 6;
let copyAntsElement = null;
let copyRange = null;
let copyRangeBlockIndex = null;
let dragSelectState = {
  pointerDown: false,
  isDragSelect: false,
  anchorCell: null,
  anchorCol: null,
  anchorBlockIndex: null,
  anchorRow: null,
  downX: 0,
  downY: 0,
};
let dragSelection = null;
let suppressNextGridClick = false;
let genreTypeBuffer = "";
let genreTypeBufferTimestamp = 0;
const GENRE_TYPE_BUFFER_TIMEOUT_MS = 700;
const MAX_AUTO_INSERT = 50;
const TOAST_DURATION_MS = 3200;
let toastElement = null;
let toastHideTimer = null;
let deleteConfirmElement = null;
let deleteConfirmState = null;

function getDeleteTarget(preferredBlockIndex = null) {
  if (
    dragSelection
    && Number.isInteger(dragSelection.blockIndex)
    && Number.isInteger(dragSelection.r1)
    && Number.isInteger(dragSelection.r2)
  ) {
    if (preferredBlockIndex === null || dragSelection.blockIndex === preferredBlockIndex) {
      const startRow = Math.min(dragSelection.r1, dragSelection.r2);
      const endRow = Math.max(dragSelection.r1, dragSelection.r2);
      return {
        blockIndex: dragSelection.blockIndex,
        startRow,
        endRow,
        count: endRow - startRow + 1,
      };
    }
  }

  const activeMeta = getCellMeta(selectedCell);
  if (!activeMeta) {
    return null;
  }

  if (preferredBlockIndex !== null && activeMeta.blockIndex !== preferredBlockIndex) {
    return null;
  }

  return {
    blockIndex: activeMeta.blockIndex,
    startRow: activeMeta.rowIndex,
    endRow: activeMeta.rowIndex,
    count: 1,
  };
}

function canDeleteRows(preferredBlockIndex = null) {
  return !!getDeleteTarget(preferredBlockIndex);
}

function refreshDeleteControls() {
  document.querySelectorAll('.gutter-icon-btn[data-action="delete-rows"]').forEach((button) => {
    const blockIndex = Number.parseInt(button.dataset.blockIndex, 10);
    const enabled = canDeleteRows(Number.isNaN(blockIndex) ? null : blockIndex);
    button.disabled = !enabled;
    button.classList.toggle("is-disabled", !enabled);
  });

  if (menuElement?.classList.contains("open")) {
    updateContextMenuDeleteState();
  }
}

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

function getToastElement() {
  if (toastElement?.isConnected) {
    return toastElement;
  }

  const toast = document.createElement("div");
  toast.className = "grid-toast";
  document.body.appendChild(toast);
  toastElement = toast;
  return toastElement;
}

function showGridToast(message) {
  if (!message) {
    return;
  }

  const toast = getToastElement();
  toast.textContent = message;
  toast.classList.add("is-visible");

  if (toastHideTimer) {
    window.clearTimeout(toastHideTimer);
  }

  toastHideTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, TOAST_DURATION_MS);
}

function closeDeleteConfirmModal({ shouldRestoreFocus = true } = {}) {
  if (!deleteConfirmElement) {
    deleteConfirmState = null;
    return;
  }

  deleteConfirmElement.classList.remove("open");
  deleteConfirmElement.setAttribute("aria-hidden", "true");
  document.body.classList.remove("delete-modal-open");

  const triggerElement = deleteConfirmState?.triggerElement;
  deleteConfirmState = null;

  if (shouldRestoreFocus && triggerElement?.isConnected) {
    triggerElement.focus({ preventScroll: true });
  }
}

function handleDeleteConfirmKeydown(event) {
  if (!deleteConfirmState || !deleteConfirmElement?.classList.contains("open")) {
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    closeDeleteConfirmModal();
    return;
  }

  if (event.key !== "Tab") {
    return;
  }

  const focusable = [...deleteConfirmElement.querySelectorAll('button:not([disabled])')];
  if (!focusable.length) {
    event.preventDefault();
    return;
  }

  const currentIndex = focusable.indexOf(document.activeElement);
  const direction = event.shiftKey ? -1 : 1;
  const nextIndex = currentIndex === -1
    ? 0
    : (currentIndex + direction + focusable.length) % focusable.length;

  event.preventDefault();
  focusable[nextIndex].focus();
}

function ensureDeleteConfirmElement() {
  if (deleteConfirmElement) {
    return deleteConfirmElement;
  }

  const overlay = document.createElement("div");
  overlay.className = "delete-confirm-overlay";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `
    <div class="delete-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title">
      <p id="delete-confirm-title" class="delete-confirm-modal__text"></p>
      <div class="delete-confirm-modal__actions">
        <button type="button" class="delete-confirm-modal__btn" data-action="ok">OK</button>
        <button type="button" class="delete-confirm-modal__btn" data-action="cancel">Cancelar</button>
      </div>
    </div>
  `;

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      event.preventDefault();
      event.stopPropagation();
    }
  });

  overlay.addEventListener("keydown", handleDeleteConfirmKeydown);

  overlay.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset?.action;
    if (!action) {
      return;
    }

    if (action === "cancel") {
      closeDeleteConfirmModal();
      return;
    }

    if (action === "ok") {
      const target = deleteConfirmState?.target;
      closeDeleteConfirmModal({ shouldRestoreFocus: false });
      executeDeleteRows(target);
    }
  });

  document.body.appendChild(overlay);
  deleteConfirmElement = overlay;
  return deleteConfirmElement;
}

function openDeleteConfirmModal(target, triggerElement = document.activeElement) {
  if (!target) {
    return;
  }

  closeContextMenu();

  const overlay = ensureDeleteConfirmElement();
  const title = overlay.querySelector(".delete-confirm-modal__text");
  title.textContent = `Vas a eliminar ${target.count} filas`;

  deleteConfirmState = {
    target,
    triggerElement: triggerElement instanceof HTMLElement ? triggerElement : null,
  };

  overlay.classList.add("open");
  overlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("delete-modal-open");

  const okButton = overlay.querySelector('[data-action="ok"]');
  okButton?.focus({ preventScroll: true });
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

  syncFillHandlePosition();
  refreshDeleteControls();
}

function isSelectedCellState(row, columnKey) {
  return selectedCellState?.rowId === row.rowKey && selectedCellState?.columnKey === columnKey;
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

function getCopyRangeValues(selection) {
  if (!selection || copyRangeBlockIndex === null) {
    return [];
  }

  const sourceBlock = blocks[copyRangeBlockIndex];
  if (!sourceBlock?.rows?.length) {
    return [];
  }

  const sourceValues = [];
  for (let rowIndex = selection.r1; rowIndex <= selection.r2; rowIndex += 1) {
    const sourceRow = sourceBlock.rows[rowIndex];
    if (!sourceRow) {
      break;
    }

    sourceValues.push(getCellRawValue(sourceRow, selection.col));
  }

  return sourceValues;
}

function resolveVerticalPasteValues({ rangeSize, clipboardText }) {
  const normalizedClipboard = `${clipboardText || ""}`.replace(/\r\n/g, "\n");
  const shouldUseCopyRange =
    !!copyRange
    && copyRangeBlockIndex !== null
    && normalizedClipboard === buildCopyTextFromSelection(copyRange);

  if (shouldUseCopyRange) {
    const sourceValues = getCopyRangeValues(copyRange);
    if (sourceValues.length === 1) {
      return Array.from({ length: rangeSize }, () => sourceValues[0]);
    }

    if (sourceValues.length > 1) {
      return sourceValues;
    }
  }

  const clipboardLines = normalizedClipboard.split("\n");
  if (clipboardLines.length > 1 && clipboardLines[clipboardLines.length - 1] === "") {
    clipboardLines.pop();
  }

  const normalizedLines = clipboardLines.map((line) => line.split("\t")[0]);
  if (!normalizedLines.length) {
    return [];
  }

  if (normalizedLines.length === 1) {
    return Array.from({ length: rangeSize }, () => normalizedLines[0]);
  }

  return normalizedLines;
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

  if (column?.cellType === "select") {
    const normalizedInput = textValue.trim().toLocaleLowerCase();
    if (!normalizedInput) {
      return "";
    }

    const matchedOption = column.options?.find((option) => option.toLocaleLowerCase() === normalizedInput);
    return matchedOption || "";
  }

  if (DATE_COLUMNS.has(columnKey)) {
    return `${rawValue ?? ""}`;
  }

  return textValue;
}

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(month, year) {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  if ([4, 6, 9, 11].includes(month)) {
    return 30;
  }
  return 31;
}

function formatDateDisplay(day, month, year) {
  const dd = String(day).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  const yy = String(year).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

function formatDateISO(day, month, year) {
  const dd = String(day).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function parseDateInput(text, defaultMonth = DATE_DEFAULT_MONTH, defaultYear = DATE_DEFAULT_YEAR) {
  const originalText = `${text ?? ""}`;
  const trimmed = originalText.trim();
  if (!trimmed) {
    return { ok: true, display: "", iso: null, error: null };
  }

  const normalizedSeparators = trimmed.replace(/[.-]/g, "/");
  let day;
  let month;
  let year;

  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split("-").map((chunk) => Number.parseInt(chunk, 10));
    day = d;
    month = m;
    year = y;
  } else if (/^\d{6}$/.test(trimmed)) {
    day = Number.parseInt(trimmed.slice(0, 2), 10);
    month = Number.parseInt(trimmed.slice(2, 4), 10);
    year = Number.parseInt(trimmed.slice(4, 6), 10) + 2000;
  } else if (/^\d{1,2}([/.-]\d{1,2}){0,2}$/.test(trimmed)) {
    const parts = normalizedSeparators.split("/");
    day = Number.parseInt(parts[0], 10);
    month = parts[1] ? Number.parseInt(parts[1], 10) : defaultMonth;
    if (parts[2]) {
      year = Number.parseInt(parts[2], 10);
      if (parts[2].length === 2) {
        year += 2000;
      }
    } else {
      year = defaultYear;
    }
  } else if (/^\d{8}$/.test(trimmed)) {
    day = Number.parseInt(trimmed.slice(0, 2), 10);
    month = Number.parseInt(trimmed.slice(2, 4), 10);
    year = Number.parseInt(trimmed.slice(4, 8), 10);
  } else {
    return { ok: false, display: originalText, iso: null, error: "Fecha no válida (DD/MM/YY)" };
  }

  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) {
    return { ok: false, display: originalText, iso: null, error: "Fecha no válida (DD/MM/YY)" };
  }

  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(month, year)) {
    return { ok: false, display: originalText, iso: null, error: "Fecha no válida (DD/MM/YY)" };
  }

  return {
    ok: true,
    display: formatDateDisplay(day, month, year),
    iso: formatDateISO(day, month, year),
    error: null,
  };
}

function getDateFieldNames(columnKey) {
  return columnKey === "startDate"
    ? { textField: "startDateText", isoField: "startDateISO" }
    : { textField: "endDateText", isoField: "endDateISO" };
}

function renderDateCell(cell, row, columnKey) {
  const { textField } = getDateFieldNames(columnKey);
  const displayValue = row[textField] || "";
  cell.textContent = displayValue;
  cell.title = row[`${columnKey}Error`] || "";
  cell.classList.toggle("has-error", !!row[`${columnKey}Error`]);
}

function applyDateCellValue(row, columnKey, rawValue, { preserveRawOnInvalid = true } = {}) {
  const { textField, isoField } = getDateFieldNames(columnKey);
  const parsed = parseDateInput(rawValue);
  if (parsed.ok) {
    row[textField] = parsed.display;
    row[isoField] = parsed.iso;
    row[`${columnKey}Error`] = null;
    return { ok: true, display: row[textField], iso: row[isoField] };
  }

  row[textField] = preserveRawOnInvalid ? `${rawValue ?? ""}` : "";
  row[isoField] = null;
  row[`${columnKey}Error`] = parsed.error;
  return { ok: false, display: row[textField], iso: null, error: parsed.error };
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
  } else if (DATE_COLUMNS.has(meta.columnKey)) {
    applyDateCellValue(row, meta.columnKey, parsedValue);
    renderDateCell(cell, row, meta.columnKey);
  } else if (meta.columnKey === "genre") {
    row.genre = parsedValue;
    cell.textContent = row.genre;
  } else if (meta.columnKey === "id") {
    row.id = parsedValue;
    cell.textContent = row.id;
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
    return;
  }

  if (DATE_COLUMNS.has(columnKey) && typeof cell.openEditMode === "function") {
    cell.openEditMode({ keepContent: true });
    return;
  }

  if (columnKey === "id" && typeof cell.openEditMode === "function") {
    cell.openEditMode({ keepContent: true });
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

function isCellVisible(cell) {
  if (!cell) {
    return false;
  }

  const styles = window.getComputedStyle(cell);
  return styles.display !== "none" && styles.visibility !== "hidden";
}

function getRowEditableColumnKeys(rowElement) {
  if (!rowElement) {
    return [];
  }

  return columns
    .filter((column) => column.editable !== false && column.visible !== false)
    .map((column) => column.key)
    .filter((columnKey) => {
      const rowCell = rowElement.querySelector(`[data-column-key="${columnKey}"]`);
      return isCellVisible(rowCell);
    });
}

function getNextTabCell(cell, direction) {
  const meta = getCellMeta(cell);
  if (!meta) {
    return null;
  }

  const block = blocks[meta.blockIndex];
  if (!block) {
    return null;
  }

  const currentRow = cell.parentElement;
  const currentRowColumns = getRowEditableColumnKeys(currentRow);
  if (!currentRowColumns.length) {
    return null;
  }

  const currentColumnIndex = currentRowColumns.indexOf(meta.columnKey);
  if (currentColumnIndex < 0) {
    return null;
  }

  const nextColumnIndex = currentColumnIndex + direction;
  if (nextColumnIndex >= 0 && nextColumnIndex < currentRowColumns.length) {
    return currentRow.querySelector(`[data-column-key="${currentRowColumns[nextColumnIndex]}"]`);
  }

  let nextRowIndex = meta.rowIndex + direction;
  while (nextRowIndex >= 0 && nextRowIndex < block.rows.length) {
    const nextRow = document.querySelector(
      `[data-block-index="${meta.blockIndex}"][data-row-index="${nextRowIndex}"]`
    )?.parentElement;

    const nextRowColumns = getRowEditableColumnKeys(nextRow);
    if (nextRowColumns.length) {
      const targetColumnKey = direction > 0 ? nextRowColumns[0] : nextRowColumns[nextRowColumns.length - 1];
      const nextCell = nextRow?.querySelector(`[data-column-key="${targetColumnKey}"]`);
      if (nextCell) {
        return nextCell;
      }
    }

    nextRowIndex += direction;
  }

  return cell;
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

function ensureGenreMenuElement() {
  if (genreMenuElement?.isConnected) {
    return genreMenuElement;
  }

  genreMenuElement = document.createElement("div");
  genreMenuElement.className = "genre-dropdown-menu";
  genreMenuElement.setAttribute("role", "listbox");
  document.body.appendChild(genreMenuElement);
  return genreMenuElement;
}

function getCellRawValue(row, columnKey) {
  if (!row) {
    return "";
  }

  if (columnKey === "listo") {
    return row.listo ? "true" : "";
  }

  if (columnKey === "title") {
    return row.title || "";
  }

  if (columnKey === "genre") {
    return row.genre || "";
  }

  if (columnKey === "id") {
    return row.id || "";
  }

  if (DATE_COLUMNS.has(columnKey)) {
    const { textField } = getDateFieldNames(columnKey);
    return row[textField] || "";
  }

  return "";
}

function computeFillValue(masterValue, targetOffset, columnKey) {
  const normalizedValue = `${masterValue ?? ""}`;
  if (!normalizedValue) {
    return normalizedValue;
  }

  if (DATE_COLUMNS.has(columnKey) || columnKey === "genre") {
    return normalizedValue;
  }

  const seriesMatch = normalizedValue.match(/^(.*?)(\d+)$/);
  if (!seriesMatch) {
    return normalizedValue;
  }

  const prefix = seriesMatch[1];
  const numberText = seriesMatch[2];
  const nextNumber = Number.parseInt(numberText, 10) + targetOffset;
  const paddedNumber = String(nextNumber).padStart(numberText.length, "0");
  return `${prefix}${paddedNumber}`;
}

function ensureFillHandleElement() {
  if (fillHandleElement?.isConnected) {
    return fillHandleElement;
  }

  const gridRoot = document.querySelector(".month-block__body-grid");
  if (!gridRoot) {
    return null;
  }

  fillHandleElement = document.createElement("button");
  fillHandleElement.type = "button";
  fillHandleElement.className = "fill-handle";
  fillHandleElement.setAttribute("aria-label", "Autorrelleno hacia abajo");
  fillHandleElement.setAttribute("tabindex", "-1");
  fillHandleElement.addEventListener("pointerdown", startFillDrag);
  gridRoot.appendChild(fillHandleElement);
  return fillHandleElement;
}

function ensureCopyAntsElement() {
  if (copyAntsElement?.isConnected) {
    return copyAntsElement;
  }

  const gridRoot = document.querySelector(".month-block__body-grid");
  if (!gridRoot) {
    return null;
  }

  copyAntsElement = document.createElement("div");
  copyAntsElement.className = "copy-ants";
  copyAntsElement.setAttribute("aria-hidden", "true");
  gridRoot.appendChild(copyAntsElement);
  return copyAntsElement;
}

function syncCopyAntsPosition() {
  const ants = ensureCopyAntsElement();
  if (!ants) {
    return;
  }

  if (!copyRange || copyRangeBlockIndex === null) {
    ants.classList.remove("is-visible");
    return;
  }

  const gridRoot = document.querySelector(".month-block__body-grid");
  if (!gridRoot) {
    ants.classList.remove("is-visible");
    return;
  }

  const topCell = document.querySelector(
    `[data-block-index="${copyRangeBlockIndex}"][data-row-index="${copyRange.r1}"][data-column-key="${copyRange.col}"]`
  );
  const bottomCell = document.querySelector(
    `[data-block-index="${copyRangeBlockIndex}"][data-row-index="${copyRange.r2}"][data-column-key="${copyRange.col}"]`
  );

  if (!topCell || !bottomCell) {
    ants.classList.remove("is-visible");
    return;
  }

  const rootRect = gridRoot.getBoundingClientRect();
  const topRect = topCell.getBoundingClientRect();
  const bottomRect = bottomCell.getBoundingClientRect();

  ants.style.left = `${topRect.left - rootRect.left}px`;
  ants.style.top = `${topRect.top - rootRect.top}px`;
  ants.style.width = `${topRect.width}px`;
  ants.style.height = `${bottomRect.bottom - topRect.top}px`;
  ants.classList.add("is-visible");
}

function setCopyRange(nextRange, blockIndex = null) {
  if (!nextRange) {
    copyRange = null;
    copyRangeBlockIndex = null;
    syncCopyAntsPosition();
    return;
  }

  copyRange = {
    col: nextRange.col,
    r1: nextRange.r1,
    r2: nextRange.r2,
  };
  copyRangeBlockIndex = blockIndex;
  syncCopyAntsPosition();
}

function getCopySelection() {
  if (dragSelection) {
    return {
      blockIndex: dragSelection.blockIndex,
      col: dragSelection.col,
      r1: dragSelection.r1,
      r2: dragSelection.r2,
    };
  }

  const activeMeta = getCellMeta(selectedCell);
  if (!activeMeta) {
    return null;
  }

  return {
    blockIndex: activeMeta.blockIndex,
    col: activeMeta.columnKey,
    r1: activeMeta.rowIndex,
    r2: activeMeta.rowIndex,
  };
}

function buildCopyTextFromSelection(selection) {
  const block = blocks[selection.blockIndex];
  if (!block) {
    return "";
  }

  const values = [];
  for (let rowIndex = selection.r1; rowIndex <= selection.r2; rowIndex += 1) {
    values.push(getCellRawValue(block.rows[rowIndex], selection.col));
  }

  return values.join("\n");
}

function copyTextToClipboard(text) {
  const fallbackCopy = () => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  };

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {
      fallbackCopy();
    });
    return;
  }

  fallbackCopy();
}

function clearFillPreview() {
  document.querySelectorAll(".left-row > div[data-column-key].is-fill-preview").forEach((cell) => {
    cell.classList.remove("is-fill-preview");
  });
}

function clearDragSelectionPreview() {
  document.querySelectorAll(".left-row > div[data-column-key].is-drag-selected").forEach((cell) => {
    cell.classList.remove("is-drag-selected");
  });
}

function renderDragSelectionPreview(selection) {
  clearDragSelectionPreview();

  if (!selection) {
    refreshDeleteControls();
    return;
  }

  for (let rowIndex = selection.r1; rowIndex <= selection.r2; rowIndex += 1) {
    const cell = document.querySelector(
      `[data-block-index="${selection.blockIndex}"][data-row-index="${rowIndex}"][data-column-key="${selection.col}"]`
    );
    if (cell) {
      cell.classList.add("is-drag-selected");
    }
  }

  refreshDeleteControls();
}

function getCellFromPointer(event) {
  const directCell = event.target?.closest?.("[data-column-key]");
  if (directCell) {
    return directCell;
  }

  const hoveredCells = document.elementsFromPoint(event.clientX, event.clientY)
    .map((element) => element.closest?.("[data-column-key]"))
    .filter(Boolean);

  return hoveredCells[0] || null;
}

function updateDragSelectionFromPointer(event) {
  if (!dragSelectState.pointerDown || !dragSelectState.isDragSelect) {
    return;
  }

  const hoverCell = getCellFromPointer(event);
  const hoverMeta = getCellMeta(hoverCell);
  if (!hoverMeta || hoverMeta.blockIndex !== dragSelectState.anchorBlockIndex) {
    return;
  }

  const r1 = Math.min(dragSelectState.anchorRow, hoverMeta.rowIndex);
  const r2 = Math.max(dragSelectState.anchorRow, hoverMeta.rowIndex);
  dragSelection = {
    blockIndex: dragSelectState.anchorBlockIndex,
    col: dragSelectState.anchorCol,
    r1,
    r2,
  };

  renderDragSelectionPreview(dragSelection);
}

function resetDragSelectState() {
  dragSelectState = {
    pointerDown: false,
    isDragSelect: false,
    anchorCell: null,
    anchorCol: null,
    anchorBlockIndex: null,
    anchorRow: null,
    downX: 0,
    downY: 0,
  };
}

function handleGridPointerDown(event) {
  if (event.button !== 0 || fillDragState || editingCell) {
    return;
  }

  if (event.target.closest(".fill-handle")) {
    return;
  }

  const cell = event.target.closest(".left-row > div[data-column-key]");
  if (!cell) {
    return;
  }

  const meta = getCellMeta(cell);
  if (!meta) {
    return;
  }

  dragSelection = null;
  clearDragSelectionPreview();

  dragSelectState = {
    pointerDown: true,
    isDragSelect: false,
    anchorCell: cell,
    anchorCol: meta.columnKey,
    anchorBlockIndex: meta.blockIndex,
    anchorRow: meta.rowIndex,
    downX: event.clientX,
    downY: event.clientY,
  };
}

function handleGridPointerMove(event) {
  if (!dragSelectState.pointerDown || fillDragState) {
    return;
  }

  if (!dragSelectState.isDragSelect) {
    const dx = event.clientX - dragSelectState.downX;
    const dy = event.clientY - dragSelectState.downY;
    const distance = Math.hypot(dx, dy);
    if (distance <= DRAG_THRESHOLD_PX) {
      return;
    }

    dragSelectState.isDragSelect = true;
    dragSelection = {
      blockIndex: dragSelectState.anchorBlockIndex,
      col: dragSelectState.anchorCol,
      r1: dragSelectState.anchorRow,
      r2: dragSelectState.anchorRow,
    };
    renderDragSelectionPreview(dragSelection);
  }

  updateDragSelectionFromPointer(event);
}

function handleGridPointerUp() {
  if (!dragSelectState.pointerDown) {
    return;
  }

  if (dragSelectState.isDragSelect) {
    suppressNextGridClick = true;
    setSelectedCell(dragSelectState.anchorCell);
    setTimeout(() => {
      suppressNextGridClick = false;
    }, 0);
  }

  resetDragSelectState();
}

function handleGridPointerCancel() {
  if (!dragSelectState.pointerDown) {
    return;
  }
  resetDragSelectState();
}

function handleGridClickCapture(event) {
  if (!suppressNextGridClick) {
    return;
  }

  if (event.target.closest(".left-row > div[data-column-key]")) {
    event.preventDefault();
    event.stopPropagation();
    suppressNextGridClick = false;
  }
}

function updateFillPreview(masterMeta, targetRowIndex) {
  clearFillPreview();
  if (targetRowIndex <= masterMeta.rowIndex) {
    return;
  }

  for (let rowIndex = masterMeta.rowIndex + 1; rowIndex <= targetRowIndex; rowIndex += 1) {
    const cell = document.querySelector(
      `[data-block-index="${masterMeta.blockIndex}"][data-row-index="${rowIndex}"][data-column-key="${masterMeta.columnKey}"]`
    );
    if (cell) {
      cell.classList.add("is-fill-preview");
    }
  }
}

function getFillTargetRowIndexFromPointer(event, masterMeta) {
  const cells = document.elementsFromPoint(event.clientX, event.clientY)
    .map((element) => element.closest?.("[data-column-key]"))
    .filter(Boolean);

  const matchedCell = cells.find(
    (cell) => cell.dataset.blockIndex === String(masterMeta.blockIndex) && cell.dataset.columnKey === masterMeta.columnKey
  );

  if (matchedCell) {
    const nextIndex = Number.parseInt(matchedCell.dataset.rowIndex, 10);
    return Number.isNaN(nextIndex) ? masterMeta.rowIndex : nextIndex;
  }

  const block = blocks[masterMeta.blockIndex];
  const lastRowIndex = Math.max(0, (block?.rows?.length || 1) - 1);
  const lastCell = document.querySelector(
    `[data-block-index="${masterMeta.blockIndex}"][data-row-index="${lastRowIndex}"][data-column-key="${masterMeta.columnKey}"]`
  );

  if (lastCell && event.clientY > lastCell.getBoundingClientRect().bottom) {
    return lastRowIndex;
  }

  return masterMeta.rowIndex;
}

function applyFillDown(masterMeta, targetRowIndex) {
  if (targetRowIndex <= masterMeta.rowIndex) {
    return;
  }

  const masterCell = document.querySelector(
    `[data-block-index="${masterMeta.blockIndex}"][data-row-index="${masterMeta.rowIndex}"][data-column-key="${masterMeta.columnKey}"]`
  );
  const masterData = masterCell ? getRowByCell(masterCell) : null;
  if (!masterData) {
    return;
  }

  const masterValue = getCellRawValue(masterData.row, masterMeta.columnKey);
  for (let rowIndex = masterMeta.rowIndex + 1; rowIndex <= targetRowIndex; rowIndex += 1) {
    const targetCell = document.querySelector(
      `[data-block-index="${masterMeta.blockIndex}"][data-row-index="${rowIndex}"][data-column-key="${masterMeta.columnKey}"]`
    );
    if (!targetCell) {
      continue;
    }

    const offset = rowIndex - masterMeta.rowIndex;
    setCellValue(targetCell, computeFillValue(masterValue, offset, masterMeta.columnKey));
  }
}

function stopFillDrag(applyChanges) {
  if (!fillDragState) {
    return;
  }

  const { pointerId, masterMeta, previewRowIndex } = fillDragState;
  const handle = ensureFillHandleElement();
  if (handle && pointerId !== null && pointerId !== undefined) {
    handle.releasePointerCapture?.(pointerId);
  }

  document.removeEventListener("pointermove", handleFillDragMove);
  document.removeEventListener("pointerup", handleFillDragEnd);
  document.removeEventListener("pointercancel", handleFillDragCancel);

  clearFillPreview();
  fillDragState = null;

  if (applyChanges) {
    applyFillDown(masterMeta, previewRowIndex);
  }

  syncFillHandlePosition();
}

function handleFillDragMove(event) {
  if (!fillDragState) {
    return;
  }

  const nextTarget = getFillTargetRowIndexFromPointer(event, fillDragState.masterMeta);
  const clampedTarget = Math.max(fillDragState.masterMeta.rowIndex, nextTarget);
  fillDragState.previewRowIndex = clampedTarget;
  updateFillPreview(fillDragState.masterMeta, clampedTarget);
}

function handleFillDragEnd(event) {
  event.preventDefault();
  stopFillDrag(true);
}

function handleFillDragCancel() {
  stopFillDrag(false);
}

function startFillDrag(event) {
  if (event.button !== 0 || !selectedCell || editingCell) {
    return;
  }

  const masterMeta = getCellMeta(selectedCell);
  if (!masterMeta) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  const handle = ensureFillHandleElement();
  handle?.setPointerCapture?.(event.pointerId);

  fillDragState = {
    pointerId: event.pointerId,
    masterMeta,
    previewRowIndex: masterMeta.rowIndex,
  };

  document.addEventListener("pointermove", handleFillDragMove);
  document.addEventListener("pointerup", handleFillDragEnd);
  document.addEventListener("pointercancel", handleFillDragCancel);
}

function syncFillHandlePosition() {
  const handle = ensureFillHandleElement();
  if (!handle) {
    return;
  }

  if (!selectedCell || editingCell || fillDragState || dragSelectState.isDragSelect || !selectedCell.isConnected) {
    handle.classList.remove("is-visible");
    return;
  }

  const gridRoot = document.querySelector(".month-block__body-grid");
  if (!gridRoot) {
    handle.classList.remove("is-visible");
    return;
  }

  const cellRect = selectedCell.getBoundingClientRect();
  const rootRect = gridRoot.getBoundingClientRect();
  handle.style.left = `${cellRect.right - rootRect.left - 5}px`;
  handle.style.top = `${cellRect.bottom - rootRect.top - 5}px`;
  handle.classList.add("is-visible");
}

function handleGridEnterKey(event) {
  const isArrowNavigationKey = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key);
  const isPrintableKey = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
  const hasSelectedCell = !!selectedCell && !!getCellMeta(selectedCell);

  if (editingCell) {
    if (editingCell.type === "select" && typeof editingCell.handleKeyDown === "function") {
      const handled = editingCell.handleKeyDown(event);
      if (handled) {
        return;
      }
    }

    if (event.key === "Tab") {
      event.preventDefault();
      const currentCell = editingCell.cell;
      editingCell.commit();
      const nextCell = getNextTabCell(currentCell, event.shiftKey ? -1 : 1);
      if (nextCell) {
        setSelectedCell(nextCell);
        focusCellWithoutEditing(nextCell);
      }
      return;
    }

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

    if (isArrowNavigationKey && editingCell.type !== "select") {
      event.preventDefault();
      const currentCell = editingCell.cell;
      editingCell.commit();
      const nextCell = getAdjacentCellByArrow(currentCell, event.key);
      if (nextCell) {
        setSelectedCell(nextCell);
        focusCellWithoutEditing(nextCell);
      }
      return;
    }
    
    return;
  }

  if (!hasSelectedCell) {
    if (event.key === "Escape" && copyRange) {
      setCopyRange(null);
      event.preventDefault();
    }
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
    if (isEditingElement(document.activeElement)) {
      return;
    }

    const nextCopySelection = getCopySelection();
    if (!nextCopySelection) {
      return;
    }

    setCopyRange(
      {
        col: nextCopySelection.col,
        r1: nextCopySelection.r1,
        r2: nextCopySelection.r2,
      },
      nextCopySelection.blockIndex
    );
    const clipboardText = buildCopyTextFromSelection(nextCopySelection);
    copyTextToClipboard(clipboardText);
    event.preventDefault();
    return;
  }

  if (event.key === "Escape" && copyRange) {
    setCopyRange(null);
    event.preventDefault();
    return;
  }

  if (event.key === "Tab") {
    event.preventDefault();
    const nextCell = getNextTabCell(selectedCell, event.shiftKey ? -1 : 1);
    if (!nextCell) {
      return;
    }

    setSelectedCell(nextCell);
    focusCellWithoutEditing(nextCell);
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
    if (selectedCell.dataset.columnKey === "genre" && typeof selectedCell.openEditMode === "function") {
      selectedCell.openEditMode({ keepContent: true });
      return;
    }

    const nextSelection = moveSelectionDownWithinBlock(selectedCell);
    focusCellWithoutEditing(nextSelection.cell);
    return;
  }

  if (event.key === "F2" && typeof selectedCell.openEditMode === "function") {
    event.preventDefault();
    selectedCell.openEditMode({ keepContent: true });
    return;
  }

    if ((event.ctrlKey || event.metaKey) && (event.key === "Delete" || event.key === "Backspace")) {
    if (isEditingElement(document.activeElement)) {
      return;
    }

    const target = getDeleteTarget();
    if (!target) {
      return;
    }

    event.preventDefault();
    openDeleteConfirmModal(target, selectedCell);
    return;
  }

  if (isPrintableKey && typeof selectedCell.openEditMode === "function") {
    const column = getColumnByKey(selectedCell.dataset.columnKey);
    if (column?.cellType === "select") {
      event.preventDefault();
      const now = Date.now();
      const normalizedKey = event.key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
      genreTypeBuffer = now - genreTypeBufferTimestamp <= GENRE_TYPE_BUFFER_TIMEOUT_MS
        ? `${genreTypeBuffer}${normalizedKey}`
        : normalizedKey;
      genreTypeBufferTimestamp = now;

      const matchedOption = column.options?.find((option) => {
        const normalizedOption = option.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
        return normalizedOption.startsWith(genreTypeBuffer);
      });

      if (matchedOption) {
        setCellValue(selectedCell, matchedOption);
      }
      return;
    }

    event.preventDefault();
    selectedCell.openEditMode({ replaceWith: event.key });
    return;
  }

  if ((event.key === "Delete" || event.key === "Backspace") && selectedCell) {
    const hasVerticalRangeSelection =
      !!dragSelection
      && dragSelection.col === selectedCell.dataset.columnKey
      && dragSelection.r2 > dragSelection.r1;

    if (hasVerticalRangeSelection && !editingCell && !isEditingElement(document.activeElement)) {
      for (let rowIndex = dragSelection.r1; rowIndex <= dragSelection.r2; rowIndex += 1) {
        const targetCell = document.querySelector(
          `[data-block-index="${dragSelection.blockIndex}"][data-row-index="${rowIndex}"][data-column-key="${dragSelection.col}"]`
        );
        if (targetCell) {
          setCellValue(targetCell, "");
        }
      }

      event.preventDefault();
      return;
    }

    const rowData = getRowByCell(selectedCell);
    if (!rowData) {
      return;
    }

    event.preventDefault();
    setCellValue(selectedCell, "");
    
    focusCellEditor(selectedCell);
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
    return;
  }
}

function handleGridPaste(event) {
  if (!selectedCell || editingCell) {
    return;
  }

    const pastedText = event.clipboardData?.getData("text/plain") || "";
  const clipboardRows = pastedText
    .split(/\r?\n/)
    .filter((line, index, all) => line !== "" || index < all.length - 1);
  if (!clipboardRows.length) {
    return;
  }

  const hasVerticalRangeSelection =
    !!dragSelection
    && dragSelection.r2 > dragSelection.r1;

  const isEditorActive = isEditingElement(document.activeElement);

  if (hasVerticalRangeSelection && !isEditorActive) {
    const selection = { ...dragSelection };
    const rangeSize = selection.r2 - selection.r1 + 1;
    const pasteValues = resolveVerticalPasteValues({
      rangeSize,
      clipboardText: pastedText,
    });
    if (!pasteValues.length) {
      return;
    }

    event.preventDefault();

    const missingRows = Math.max(0, pasteValues.length - rangeSize);
    const rowsToInsert = Math.min(missingRows, MAX_AUTO_INSERT);
    if (rowsToInsert > 0) {
      insertRows(selection.blockIndex, selection.r2 + 1, rowsToInsert);
      dragSelection = {
        ...selection,
        r2: selection.r2 + rowsToInsert,
      };
      renderDragSelectionPreview(dragSelection);

      if (missingRows > MAX_AUTO_INSERT) {
        showGridToast(`Se han creado ${MAX_AUTO_INSERT} filas. El resto del pegado se ha recortado.`);
      }
    }

    const maxPasteRows = rangeSize + rowsToInsert;
    for (let offset = 0; offset < Math.min(pasteValues.length, maxPasteRows); offset += 1) {
      const targetCell = document.querySelector(
        `[data-block-index="${selection.blockIndex}"][data-row-index="${selection.r1 + offset}"][data-column-key="${selection.col}"]`
      );
      if (targetCell) {
        setCellValue(targetCell, pasteValues[offset]);
      }
    }
    return;
  }

  const rowData = getRowByCell(selectedCell);
  if (!rowData) {
    return;
  }

  event.preventDefault();
  const startMeta = rowData.meta;
  const block = blocks[startMeta.blockIndex];
  if (!block?.rows?.length) {
    return;
  }

  if (clipboardRows.length > 1) {
    const availableRows = Math.max(0, block.rows.length - startMeta.rowIndex);
    const missingRows = Math.max(0, clipboardRows.length - availableRows);
    const rowsToInsert = Math.min(missingRows, MAX_AUTO_INSERT);
    if (rowsToInsert > 0) {
      insertRows(startMeta.blockIndex, block.rows.length, rowsToInsert);

      if (missingRows > MAX_AUTO_INSERT) {
        showGridToast(`Se han creado ${MAX_AUTO_INSERT} filas. El resto del pegado se ha recortado.`);
      }
    }
  }

  const currentBlock = blocks[startMeta.blockIndex];
  const availableRowsAfterInsert = Math.max(0, (currentBlock?.rows?.length || 0) - startMeta.rowIndex);
  const maxPasteRows = clipboardRows.length > 1
    ? Math.min(clipboardRows.length, availableRowsAfterInsert)
    : 1;

  for (let offset = 0; offset < maxPasteRows; offset += 1) {
    const line = clipboardRows[offset];
    const targetCell = document.querySelector(
      `[data-block-index="${startMeta.blockIndex}"][data-row-index="${startMeta.rowIndex + offset}"][data-column-key="${startMeta.columnKey}"]`
    );
    if (targetCell) {
      setCellValue(targetCell, line);
    }
  }

  if (DATE_COLUMNS.has(startMeta.columnKey)) {
    const finalCell = document.querySelector(
      `[data-block-index="${startMeta.blockIndex}"][data-row-index="${Math.min(startMeta.rowIndex + maxPasteRows - 1, blocks[startMeta.blockIndex].rows.length - 1)}"][data-column-key="${startMeta.columnKey}"]`
    );
    if (finalCell) {
      setSelectedCell(finalCell);
      focusCellWithoutEditing(finalCell);
    }
  }
}

function attachDateCell(cell, row, columnKey) {
  cell.classList.add("date-cell");
  cell.tabIndex = 0;

  const render = () => renderDateCell(cell, row, columnKey);

  const openEditMode = ({ replaceWith, keepContent = false } = {}) => {
    if (editingCell?.cell === cell) {
      return;
    }

    setCopyRange(null);

    cell.classList.add("is-editing");
    const input = document.createElement("input");
    input.type = "text";
    input.className = "date-cell__input editor-overlay is-editing";
    const currentText = row[getDateFieldNames(columnKey).textField] || "";
    input.value = keepContent ? currentText : (replaceWith ?? currentText);
    cell.textContent = "";
    cell.appendChild(input);

    const cleanup = () => {
      if (editingCell?.cell === cell) {
        editingCell = null;
      }
      cell.classList.remove("is-editing");
      render();
      syncFillHandlePosition();
    };

    const commit = () => {
      applyDateCellValue(row, columnKey, input.value);
      cleanup();
    };

    const cancel = () => {
      cleanup();
    };

    input.addEventListener("blur", commit, { once: true });

    editingCell = {
      cell,
      input,
      commit: () => input.blur(),
      cancel,
    };
    syncFillHandlePosition();
    
    requestAnimationFrame(() => {
      input.focus({ preventScroll: true });
      const end = input.value.length;
      input.setSelectionRange(end, end);
    });
  };

  cell.openEditMode = openEditMode;

  cell.addEventListener("click", () => setSelectedCell(cell));
  cell.addEventListener("dblclick", () => {
    setSelectedCell(cell);
    openEditMode({ keepContent: true });
  });
  cell.addEventListener("focus", () => setSelectedCell(cell));

  render();
}

function attachGenreCell(cell, row) {
  cell.classList.add("genre-cell");
  cell.tabIndex = 0;

  const render = () => {
    cell.textContent = row.genre || "";
  };

  const openEditMode = ({ keepContent = false, replaceWith } = {}) => {
    if (editingCell?.cell === cell) {
      return;
    }

    setCopyRange(null);

    const column = getColumnByKey("genre");
    if (!column) {
      return;
    }

    const menu = ensureGenreMenuElement();
    cell.classList.add("is-editing");
    const currentValue = keepContent ? row.genre || "" : (replaceWith ?? row.genre ?? "");
    let highlightedIndex = Math.max(0, column.options.findIndex((option) => option === currentValue));
    const originalValue = row.genre || "";
    let cancelled = false;

    const commit = () => {
      if (!cancelled) {
        row.genre = parseCellValue("genre", row.genre);
      }
      cleanup();
    };

    const cancel = () => {
      cancelled = true;
      row.genre = originalValue;
      cleanup();
    };

    const renderOptions = () => {
      menu.innerHTML = "";
      column.options.forEach((option, index) => {
        const optionElement = document.createElement("button");
        optionElement.type = "button";
        optionElement.className = "genre-dropdown-menu__option";
        if (option === currentValue) {
          optionElement.classList.add("is-selected");
        }
        if (index === highlightedIndex) {
          optionElement.classList.add("is-highlighted");
        }
        optionElement.textContent = option;
        optionElement.setAttribute("role", "option");
        optionElement.setAttribute("aria-selected", option === currentValue ? "true" : "false");
        optionElement.addEventListener("mousedown", (event) => event.preventDefault());
        optionElement.addEventListener("click", () => {
          row.genre = option;
          commit();
        });
        menu.appendChild(optionElement);
      });
    };

    const positionMenu = () => {
      const cellRect = cell.getBoundingClientRect();
      const menuWidth = Math.max(0, cellRect.width - 2);
      menu.style.left = `${cellRect.left}px`;
      menu.style.top = `${cellRect.bottom - 1}px`;
      menu.style.width = `${menuWidth}px`;
      menu.style.maxWidth = `${menuWidth}px`;
      menu.classList.add("open");
    };

    const cleanup = () => {
      if (editingCell?.cell === cell) {
        editingCell = null;
      }
      document.removeEventListener("mousedown", handlePointerDownOutside);
      menu.classList.remove("open");
      window.removeEventListener("resize", positionMenu);
      cell.classList.remove("is-editing");
      render();
      syncFillHandlePosition();
    };

    const handleKeyDown = (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        highlightedIndex = Math.min(column.options.length - 1, highlightedIndex + 1);
        renderOptions();
        return true;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        highlightedIndex = Math.max(0, highlightedIndex - 1);
        renderOptions();
        return true;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        row.genre = column.options[highlightedIndex] || "";
        commit();
        const nextSelection = moveSelectionDownWithinBlock(cell);
        focusCellWithoutEditing(nextSelection.cell);
        return true;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        cancel();
        focusCellWithoutEditing(cell);
        return true;
      }

      return false;
    };

    const handlePointerDownOutside = (event) => {
      if (!menu.contains(event.target) && !cell.contains(event.target)) {
        commit();
      }
    };

    renderOptions();
    positionMenu();
    window.addEventListener("resize", positionMenu);
    document.addEventListener("mousedown", handlePointerDownOutside);

    editingCell = {
      cell,
      input: menu,
      type: "select",
      commit,
      cancel,
      handleKeyDown,
    };
    syncFillHandlePosition();
  };

  cell.openEditMode = openEditMode;
  cell.addEventListener("click", () => {
    const wasSelected = selectedCell === cell;
    setSelectedCell(cell);
    if (wasSelected) {
      openEditMode({ keepContent: true });
    }
  });
  cell.addEventListener("focus", () => setSelectedCell(cell));

  render();
}
function insertRow(blockIndex, atIndex) {
  insertRows(blockIndex, atIndex, 1);
}

function insertRows(blockIndex, atIndex, count = 1) {
  if (!Number.isInteger(count) || count <= 0) {
    return;
  }

  const block = blocks[blockIndex];
  if (!block) {
    return;
  }

  const nextRows = [...block.rows];
  const rowsToInsert = Array.from({ length: count }, () => newRowForBlock(block.blockType));
  nextRows.splice(atIndex, 0, ...rowsToInsert);
  blocks[blockIndex] = { ...block, rows: nextRows };
  renderRows();
}

function deleteRowsInBlock(blockIndex, startRow, endRow) {
  const block = blocks[blockIndex];
  if (!block?.rows?.length) {
    return null;
  }

  const safeStart = Math.max(0, Math.min(startRow, endRow));
  const safeEnd = Math.min(block.rows.length - 1, Math.max(startRow, endRow));
  if (safeEnd < safeStart) {
    return null;
  }

  const hasStructuralRow = block.rows
    .slice(safeStart, safeEnd + 1)
    .some((row) => row?.isHeader || row?.isStructural);
  if (hasStructuralRow) {
    return null;
  }

  const removeCount = safeEnd - safeStart + 1;
  const nextRows = [...block.rows];
  nextRows.splice(safeStart, removeCount);

  if (!nextRows.length) {
    nextRows.push(newRowForBlock(block.blockType));
  }

  blocks[blockIndex] = { ...block, rows: nextRows };

  return {
    removedStart: safeStart,
    removedEnd: safeEnd,
    removeCount,
    lastRowIndex: nextRows.length - 1,
  };
}

function createSelectionState(blockIndex, rowIndex, columnKey) {
  return {
    blockIndex,
    rowIndex,
    columnKey,
  };
}

function normalizeSelectionAfterDelete(blockIndex, deleteInfo) {
  const block = blocks[blockIndex];
  const activeMeta = getCellMeta(selectedCell);

  if (dragSelection && dragSelection.blockIndex === blockIndex) {
    const selectionStartsBeforeDelete = dragSelection.r1 < deleteInfo.removedStart;
    const selectionEndsBeforeDelete = dragSelection.r2 < deleteInfo.removedStart;
    const selectionStartsAfterDelete = dragSelection.r1 > deleteInfo.removedEnd;

    if (selectionEndsBeforeDelete) {
      // Keep selection as-is.
    } else if (selectionStartsAfterDelete) {
      dragSelection = {
        ...dragSelection,
        r1: Math.max(0, dragSelection.r1 - deleteInfo.removeCount),
        r2: Math.max(0, dragSelection.r2 - deleteInfo.removeCount),
      };
    } else {
      dragSelection = null;
    }

    if (selectionStartsBeforeDelete && dragSelection && dragSelection.r2 < dragSelection.r1) {
      dragSelection = null;
    }
  }

  if (copyRange && copyRangeBlockIndex === blockIndex) {
    const intersects = !(copyRange.r2 < deleteInfo.removedStart || copyRange.r1 > deleteInfo.removedEnd);
    if (intersects) {
      setCopyRange(null);
    } else if (copyRange.r1 > deleteInfo.removedEnd) {
      setCopyRange(
        {
          ...copyRange,
          r1: Math.max(0, copyRange.r1 - deleteInfo.removeCount),
          r2: Math.max(0, copyRange.r2 - deleteInfo.removeCount),
        },
        copyRangeBlockIndex
      );
    }
  }

  let nextSelection = null;
  if (activeMeta && activeMeta.blockIndex === blockIndex) {
    if (activeMeta.rowIndex < deleteInfo.removedStart) {
      nextSelection = createSelectionState(blockIndex, activeMeta.rowIndex, activeMeta.columnKey);
    } else if (activeMeta.rowIndex > deleteInfo.removedEnd) {
      nextSelection = createSelectionState(
        blockIndex,
        Math.max(0, activeMeta.rowIndex - deleteInfo.removeCount),
        activeMeta.columnKey
      );
    } else {
      nextSelection = createSelectionState(
        blockIndex,
        Math.min(deleteInfo.removedStart, deleteInfo.lastRowIndex),
        activeMeta.columnKey
      );
    }
  } else if (selectedCellState) {
    nextSelection = null;
  }

  renderRows();

  if (nextSelection) {
    const nextCell = document.querySelector(
      `[data-block-index="${nextSelection.blockIndex}"][data-row-index="${nextSelection.rowIndex}"][data-column-key="${nextSelection.columnKey}"]`
    );
    if (nextCell) {
      setSelectedCell(nextCell);
      focusCellWithoutEditing(nextCell);
    } else {
      setSelectedCell(null);
    }
  } else {
    setSelectedCell(null);
  }

  renderDragSelectionPreview(dragSelection);
}

function executeDeleteRows(target) {
  if (!target) {
    return;
  }

  const deleteInfo = deleteRowsInBlock(target.blockIndex, target.startRow, target.endRow);
  if (!deleteInfo) {
    return;
  }

  normalizeSelectionAfterDelete(target.blockIndex, deleteInfo);
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
    <div class="context-menu__divider" role="separator"></div>
    <button type="button" class="context-menu__item" data-action="delete" role="menuitem">Eliminar filas</button>
  `;

  menuElement.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target || !contextMenu.open) {
      return;
    }

    if (target.dataset.action === "above") {
      insertRow(contextMenu.blockIndex, contextMenu.rowIndex);
      closeContextMenu();
      return;
    }

    if (target.dataset.action === "below") {
      insertRow(contextMenu.blockIndex, contextMenu.rowIndex + 1);
      closeContextMenu();
      return;
    }

    if (target.dataset.action === "delete") {
      const deleteTarget = getDeleteTarget(contextMenu.blockIndex);
      if (!deleteTarget) {
        return;
      }
      openDeleteConfirmModal(deleteTarget);
      closeContextMenu();
    }
  });

  document.body.appendChild(menuElement);
  return menuElement;
}

function updateContextMenuDeleteState() {
  if (!menuElement) {
    return;
  }

  const deleteItem = menuElement.querySelector('[data-action="delete"]');
  if (!deleteItem) {
    return;
  }

  const enabled = canDeleteRows(contextMenu.blockIndex);
  deleteItem.disabled = !enabled;
  deleteItem.classList.toggle("is-disabled", !enabled);
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
  updateContextMenuDeleteState();
  
  document.addEventListener("mousedown", handleOutsidePointer);
  document.addEventListener("keydown", handleMenuEscape);
}

function createLeftRow({ group = false, cells = [], onAddRow, onDeleteRows, canDeleteRowsInGroup = false, groupBlockIndex = null } = {}) {
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
        removeBtn.setAttribute("aria-label", "Eliminar filas");
        removeBtn.textContent = "−";
        removeBtn.dataset.action = "delete-rows";
        if (groupBlockIndex !== null) {
          removeBtn.dataset.blockIndex = String(groupBlockIndex);
        }
        removeBtn.disabled = !canDeleteRowsInGroup;
        removeBtn.classList.toggle("is-disabled", !canDeleteRowsInGroup);
        removeBtn.addEventListener("click", () => {
          if (removeBtn.disabled || typeof onDeleteRows !== "function") {
            return;
          }
          onDeleteRows(removeBtn);
        });
        
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

    setCopyRange(null);

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
      syncFillHandlePosition();
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
    syncFillHandlePosition();
    
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

function attachIdTextCell(cell, row) {
  cell.classList.add("text-cell");
  cell.tabIndex = 0;

  const renderReadMode = () => {
    cell.classList.remove("is-editing");
    cell.textContent = row.id || "";
  };

  const openEditMode = ({ replaceWith, keepContent = false } = {}) => {
    if (editingCell?.cell === cell) {
      return;
    }

    setCopyRange(null);

    cell.classList.add("is-editing");
    const input = document.createElement("input");
    input.type = "text";
    input.className = "date-cell__input editor-overlay is-editing";
    const currentText = row.id || "";
    input.value = keepContent ? currentText : (replaceWith ?? currentText);
    cell.textContent = "";
    cell.appendChild(input);

    const cleanup = () => {
      if (editingCell?.cell === cell) {
        editingCell = null;
      }
      renderReadMode();
      syncFillHandlePosition();
    };

    const commit = () => {
      row.id = input.value || "";
      cleanup();
    };

    const cancel = () => {
      cleanup();
    };

    input.addEventListener("blur", commit, { once: true });

    editingCell = {
      cell,
      input,
      commit: () => input.blur(),
      cancel,
    };
    syncFillHandlePosition();
    
    requestAnimationFrame(() => {
      input.focus({ preventScroll: true });
      const end = input.value.length;
      input.setSelectionRange(end, end);
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
  gridRoot?.addEventListener("pointerdown", handleGridPointerDown);
  document.addEventListener("pointermove", handleGridPointerMove);
  document.addEventListener("pointerup", handleGridPointerUp);
  document.addEventListener("pointercancel", handleGridPointerCancel);
  gridRoot?.addEventListener("click", handleGridClickCapture, true);
  ensureFillHandleElement();

  const rightBodyScroll = gridRoot?.querySelector("#right-body-scroll");
  rightBodyScroll?.addEventListener("scroll", () => {
    syncFillHandlePosition();
    syncCopyAntsPosition();
  });
  window.addEventListener("resize", () => {
    syncFillHandlePosition();
    syncCopyAntsPosition();
  });
}

function renderRows() {
  const leftBody = document.getElementById("left-body");
  const rightBody = document.getElementById("right-body");

  leftBody.innerHTML = "";
  rightBody.innerHTML = "";
  selectedCell = null;
  clearFillPreview();
  renderDragSelectionPreview(dragSelection);
  
  blocks.forEach((block, blockIndex) => {
    const groupLeftRow = createLeftRow({
      group: true,
      cells: ["", "", { left: block.blockType.toUpperCase(), right: "(Máximo 5 simultáneas)" }, "", "", "", ""],
      onAddRow: () => insertRow(blockIndex, 0),
      canDeleteRowsInGroup: canDeleteRows(blockIndex),
      groupBlockIndex: blockIndex,
      onDeleteRows: (triggerElement) => {
        const target = getDeleteTarget(blockIndex);
        if (!target) {
          return;
        }
        openDeleteConfirmModal(target, triggerElement);
      },
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
      leftRow.children[1].dataset.rowId = row.rowKey;
      leftRow.children[1].dataset.columnKey = "listo";
      if (isSelectedCellState(row, "listo")) {
        selectedCell = leftRow.children[1];
        selectedCell.classList.add("is-selected");
      }

      leftRow.children[2].dataset.blockIndex = String(blockIndex);
      leftRow.children[2].dataset.rowIndex = String(rowIndex);
      leftRow.children[2].dataset.rowId = row.rowKey;
      leftRow.children[2].dataset.columnKey = "title";
      leftRow.children[2].tabIndex = 0;
      if (isSelectedCellState(row, "title")) {
        selectedCell = leftRow.children[2];
        selectedCell.classList.add("is-selected");
      }

      attachDateCell(leftRow.children[3], row, "startDate");
      leftRow.children[3].dataset.blockIndex = String(blockIndex);
      leftRow.children[3].dataset.rowIndex = String(rowIndex);
      leftRow.children[3].dataset.rowId = row.rowKey;
      leftRow.children[3].dataset.columnKey = "startDate";
      if (isSelectedCellState(row, "startDate")) {
        selectedCell = leftRow.children[3];
        selectedCell.classList.add("is-selected");
      }

      attachDateCell(leftRow.children[4], row, "endDate");
      leftRow.children[4].dataset.blockIndex = String(blockIndex);
      leftRow.children[4].dataset.rowIndex = String(rowIndex);
      leftRow.children[4].dataset.rowId = row.rowKey;
      leftRow.children[4].dataset.columnKey = "endDate";
      if (isSelectedCellState(row, "endDate")) {
        selectedCell = leftRow.children[4];
        selectedCell.classList.add("is-selected");
      }

      attachGenreCell(leftRow.children[5], row);
      leftRow.children[5].dataset.blockIndex = String(blockIndex);
      leftRow.children[5].dataset.rowIndex = String(rowIndex);
      leftRow.children[5].dataset.rowId = row.rowKey;
      leftRow.children[5].dataset.columnKey = "genre";
      if (isSelectedCellState(row, "genre")) {
        selectedCell = leftRow.children[5];
        selectedCell.classList.add("is-selected");
      }

      attachIdTextCell(leftRow.children[6], row);
      leftRow.children[6].dataset.blockIndex = String(blockIndex);
      leftRow.children[6].dataset.rowIndex = String(rowIndex);
      leftRow.children[6].dataset.rowId = row.rowKey;
      leftRow.children[6].dataset.columnKey = "id";
      if (isSelectedCellState(row, "id")) {
        selectedCell = leftRow.children[6];
        selectedCell.classList.add("is-selected");
      }
      leftRow.children[6].textContent = "";

      leftRow.addEventListener("contextmenu", (event) => openContextMenu(event, blockIndex, rowIndex));
      dayRow.addEventListener("contextmenu", (event) => openContextMenu(event, blockIndex, rowIndex));

      leftBody.appendChild(leftRow);
      rightBody.appendChild(dayRow);
    });
  });

  syncFillHandlePosition();
  syncCopyAntsPosition();
}

renderMonthBlockGrid(document.getElementById("app"));
