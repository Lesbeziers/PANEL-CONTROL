(function initCalendarColumnDebugModule() {
  const RANGE_CELL_CLASS = "ganttBarCell";
  const RANGE_START_CLASS = "ganttBarStart";
  const RANGE_END_CLASS = "ganttBarEnd";
  const DAY_ATTR = "data-day";
  const OBSERVER_TARGET_SELECTOR = ".month-block #right-body";
  const DATE_COLUMN_SELECTOR = '.left-row > div[data-column-key="startDate"], .left-row > div[data-column-key="endDate"]';
  const GANTT_BODY_SELECTOR = "#left-body, #right-body, .month-block__body-grid";
  const BLOCK_HEADER_GREEN_CLASS = "blockHeader--green";
  const BLOCK_HEADER_YELLOW_CLASS = "blockHeader--yellow";
  const GANTT_BLOCK_HEADER_CLASS = "ganttBlockHeader";
  const GANTT_BLOCK_GREEN_CLASS = "ganttBlockGreen";
  const GANTT_BLOCK_YELLOW_CLASS = "ganttBlockYellow";
  const BLOCK_DAY_COUNT_CLASS = "ganttBlockDayCount";
  const BAND_COLOR_GREEN = "#5b843a";
  const BAND_COLOR_YELLOW = "#d68505";
  const HEADER_COLOR_GREEN = "#70ad47";
  const HEADER_COLOR_YELLOW = "#fcc000";
  const DEBUG_PASTE = true;
  
  let observer = null;
  let rafId = null;

  let repaintRafId = null;
  let repaintRafId2 = null;
  let repaintTimeoutId = null;
  let stableRepaintRunId = 0;
  let pendingFullRepaint = false;
  const pendingRowsToRepaint = new Set();

  function waitPostRenderTick() {
    return new Promise((resolve) => {
      window.requestAnimationFrame(() => {
        window.setTimeout(resolve, 16);
      });
    });
  }

  function getStartEndHash(root) {
    const leftRows = [...root.querySelectorAll("#left-body .left-row")];
    const dayRows = [...root.querySelectorAll("#right-body .day-row")];
    const pairs = [];

    leftRows.forEach((leftRow, rowIndex) => {
      if (!isDataRow(dayRows[rowIndex], leftRow)) {
        return;
      }

      const startText = leftRow.querySelector('[data-column-key="startDate"]')?.textContent?.trim() || "";
      const endText = leftRow.querySelector('[data-column-key="endDate"]')?.textContent?.trim() || "";
      pairs.push(`${startText}→${endText}`);
    });

    return pairs.join("||");
  }

  function repaintAll(root) {
    markCalendarCells(root);
  }

  async function repaintUntilStable(root, { maxMs = 600 } = {}) {
    const runId = ++stableRepaintRunId;
    const startedAt = performance.now();
    let previousHash = null;
    let stableIterations = 0;
    let iteration = 0;

    while (performance.now() - startedAt <= maxMs) {
      if (runId !== stableRepaintRunId) {
        return;
      }

      iteration += 1;
      repaintAll(root);
      await waitPostRenderTick();

      const currentHash = getStartEndHash(root);
      const elapsedMs = Math.round(performance.now() - startedAt);
      if (DEBUG_PASTE) {
        console.log("[gantt][paste] repaint iter", iteration, "hash", currentHash, "ms", elapsedMs);
      }

      if (currentHash === previousHash) {
        stableIterations += 1;
      } else {
        stableIterations = 0;
      }

      if (stableIterations >= 2) {
        if (DEBUG_PASTE) {
          console.log("[gantt][paste] stable after", iteration, "iterations and", elapsedMs, "ms");
        }
        return;
      }

      previousHash = currentHash;
    }

    if (DEBUG_PASTE) {
      const elapsedMs = Math.round(performance.now() - startedAt);
      console.log("[gantt][paste] stop by maxMs after", iteration, "iterations and", elapsedMs, "ms");
    }
  }
  function parseDayLabel(value) {
    const normalized = (value || "").trim();
    if (!/^\d{1,2}$/.test(normalized)) {
      return null;
    }

    const day = Number.parseInt(normalized, 10);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      return null;
    }

    return day;
  }

  function parseDateDay(value) {
    const normalized = (value || "").trim();
    if (!normalized) {
      return null;
    }

    let day = null;

    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized)) {
      const parts = normalized.split("-");
      day = Number.parseInt(parts[2], 10);
    } else if (/^\d{1,2}(?:[\/.-]\d{1,2}){0,2}$/.test(normalized)) {
      const parts = normalized.split(/[\/.-]/);
      day = Number.parseInt(parts[0], 10);
    } else if (/^\d{6}$/.test(normalized) || /^\d{8}$/.test(normalized)) {
      day = Number.parseInt(normalized.slice(0, 2), 10);
    }

    if (!Number.isInteger(day) || day < 1 || day > 31) {
      return null;
    }

    return day;
  }
  
  function detectCalendarColumns(headerTrack) {
    const headerCells = [...headerTrack.children];
    return headerCells.reduce((acc, headerCell, columnIndex) => {
      const day = parseDayLabel(headerCell.textContent);
      if (day !== null) {
        acc.push({ columnIndex, day });
      }
      return acc;
    }, []);
  }

  function clearRangeCells(dayRow) {
    if (!dayRow) {
      return;
    }

    dayRow.querySelectorAll(`.day-cell.${RANGE_CELL_CLASS}`).forEach((cell) => {
      cell.classList.remove(RANGE_CELL_CLASS);
      cell.classList.remove(RANGE_START_CLASS);
      cell.classList.remove(RANGE_END_CLASS);
    });
  }

  function normalizeColor(value) {
    const normalized = (value || "").trim().toLowerCase();
    if (!normalized) {
      return "";
    }

    if (normalized.startsWith("#")) {
      if (normalized.length === 4) {
        const [r, g, b] = normalized.slice(1);
        return `#${r}${r}${g}${g}${b}${b}`;
      }

      return normalized;
    }

    const rgbMatch = normalized.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (rgbMatch) {
      const toHex = (part) => Number.parseInt(part, 10).toString(16).padStart(2, "0");
      return `#${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`;
    }

    return normalized;
  }

  function matchesColor(value, targetHex) {
    return normalizeColor(value) === normalizeColor(targetHex);
  }

  function findLastMatchingDescendant(root, selector) {
    if (!root) {
      return null;
    }

    for (let child = root.lastElementChild; child; child = child.previousElementSibling) {
      const matchInChild = findLastMatchingDescendant(child, selector);
      if (matchInChild) {
        return matchInChild;
      }
    }

    if (root.matches?.(selector)) {
      return root;
    }

    return null;
  }

  function findPreviousMatchingElementAcrossContainers(element, selector, stopContainer) {
    if (!element) {
      return null;
    }

    let current = element;
    while (current && current !== stopContainer) {
      for (let sibling = current.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
        const candidate = findLastMatchingDescendant(sibling, selector);
        if (candidate) {
          return candidate;
        }
      }

      const parent = current.parentElement;
      if (stopAtSelector && parent.matches(stopAtSelector)) {
        return null;
      }
    }

    return null;
  }

  function ensureBlockHeaderClass(headerRow) {
    if (!headerRow || !headerRow.classList.contains("group")) {
      return null;
    }

        headerRow.classList.add(GANTT_BLOCK_HEADER_CLASS);

    if (headerRow.classList.contains(GANTT_BLOCK_GREEN_CLASS)) {
      return BLOCK_HEADER_GREEN_CLASS;
    }

    if (headerRow.classList.contains(GANTT_BLOCK_YELLOW_CLASS)) {
      return BLOCK_HEADER_YELLOW_CLASS;
    }

    if (headerRow.classList.contains(BLOCK_HEADER_GREEN_CLASS)) {
      headerRow.classList.add(GANTT_BLOCK_GREEN_CLASS);
      return BLOCK_HEADER_GREEN_CLASS;
    }

    if (headerRow.classList.contains(BLOCK_HEADER_YELLOW_CLASS)) {
      headerRow.classList.add(GANTT_BLOCK_YELLOW_CLASS);
      return BLOCK_HEADER_YELLOW_CLASS;
    }

    const inlineGroupBg = headerRow.style.getPropertyValue("--group-bg");
    if (matchesColor(inlineGroupBg, HEADER_COLOR_GREEN)) {
      headerRow.classList.add(BLOCK_HEADER_GREEN_CLASS);
      headerRow.classList.add(GANTT_BLOCK_GREEN_CLASS);
      return BLOCK_HEADER_GREEN_CLASS;
    }

    if (matchesColor(inlineGroupBg, HEADER_COLOR_YELLOW)) {
      headerRow.classList.add(BLOCK_HEADER_YELLOW_CLASS);
      headerRow.classList.add(GANTT_BLOCK_YELLOW_CLASS);
      return BLOCK_HEADER_YELLOW_CLASS;
    }

    const rowBg = window.getComputedStyle(headerRow).backgroundColor;
    const headerCell = headerRow.querySelector(".day-cell, div");
    const cellBg = headerCell ? window.getComputedStyle(headerCell).backgroundColor : "";

    if (matchesColor(rowBg, HEADER_COLOR_GREEN) || matchesColor(cellBg, HEADER_COLOR_GREEN)) {
      headerRow.classList.add(BLOCK_HEADER_GREEN_CLASS);
      headerRow.classList.add(GANTT_BLOCK_GREEN_CLASS);
      return BLOCK_HEADER_GREEN_CLASS;
    }

    if (matchesColor(rowBg, HEADER_COLOR_YELLOW) || matchesColor(cellBg, HEADER_COLOR_YELLOW)) {
      headerRow.classList.add(BLOCK_HEADER_YELLOW_CLASS);
      headerRow.classList.add(GANTT_BLOCK_YELLOW_CLASS);
      return BLOCK_HEADER_YELLOW_CLASS;
    }

    return null;
  }

  function findNearestBlockHeader(row) {
    const rightBody = row?.closest("#right-body");
    if (!rightBody) {
      return null;
    }

    let cursor = row;
    while (cursor) {
      cursor = findPreviousMatchingElementAcrossContainers(cursor, ".day-row", rightBody);
      if (!cursor) {
        return null;
      }

      if (cursor.classList?.contains("group")) {
        return cursor;
      }
    }

    return null;
  }

  function getBlockBandColor(row) {
    const headerRow = findNearestBlockHeader(row);
    const headerClass = ensureBlockHeaderClass(headerRow);
    if (headerClass === BLOCK_HEADER_YELLOW_CLASS) {
      return BAND_COLOR_YELLOW;
    }

    if (headerClass === BLOCK_HEADER_GREEN_CLASS) {
      return BAND_COLOR_GREEN;
    }

    return null;
  }

  function paintRangeForRow(dayRow, leftRow) {
    clearRangeCells(dayRow);

    const bandColor = getBlockBandColor(dayRow);
    if (bandColor) {
      dayRow.style.setProperty("--ganttBarColor", bandColor);
      dayRow.style.setProperty("--gantt-band-color", bandColor);
    } else {
      dayRow.style.removeProperty("--ganttBarColor");
      dayRow.style.removeProperty("--gantt-band-color");
    }

    if (!isDataRow(dayRow, leftRow)) {
      return;
    }

    const startCell = leftRow.querySelector('[data-column-key="startDate"]');
    const endCell = leftRow.querySelector('[data-column-key="endDate"]');
    if (!startCell || !endCell) {
      return;
    }

    const startDay = parseDateDay(startCell.textContent);
    const endDay = parseDateDay(endCell.textContent);
    if (startDay === null || endDay === null || startDay > endDay) {
      return;
    }

    const rangeCells = [];
    dayRow.querySelectorAll(`.day-cell[${DAY_ATTR}]`).forEach((cell) => {
      const day = Number.parseInt(cell.getAttribute(DAY_ATTR), 10);
      if (Number.isInteger(day) && day >= startDay && day <= endDay) {
        cell.classList.add(RANGE_CELL_CLASS);
        rangeCells.push(cell);
      }
    });

    if (!rangeCells.length) {
      return;
    }

    rangeCells[0].classList.add(RANGE_START_CLASS);
    rangeCells[rangeCells.length - 1].classList.add(RANGE_END_CLASS);
  }

  function updateHeaderDayCountCell(cell, count) {
    if (!cell) {
      return;
    }

    let countNode = cell.querySelector(`.${BLOCK_DAY_COUNT_CLASS}`);
    if (!countNode) {
      countNode = document.createElement("span");
      countNode.className = BLOCK_DAY_COUNT_CLASS;
      cell.appendChild(countNode);
    }

    countNode.textContent = count > 0 ? String(count) : "";
  }

  function renderBlockDailyCounts(dayRows, leftRows) {
    const blockEntries = [];
    let activeBlock = null;

    dayRows.forEach((dayRow, rowIndex) => {
      const leftRow = leftRows[rowIndex] || null;

      if (dayRow.classList.contains("group")) {
        const headerClass = ensureBlockHeaderClass(dayRow);
        if (!headerClass) {
          activeBlock = null;
          return;
        }

        activeBlock = {
          headerRow: dayRow,
          counts: new Array(32).fill(0),
        };
        blockEntries.push(activeBlock);
        return;
      }

      if (!activeBlock || !isDataRow(dayRow, leftRow)) {
        return;
      }

      const startCell = leftRow.querySelector('[data-column-key="startDate"]');
      const endCell = leftRow.querySelector('[data-column-key="endDate"]');
      if (!startCell || !endCell) {
        return;
      }

      const startDay = parseDateDay(startCell.textContent);
      const endDay = parseDateDay(endCell.textContent);
      if (startDay === null || endDay === null || startDay > endDay) {
        return;
      }

      const fromDay = Math.max(1, startDay);
      const toDay = Math.min(31, endDay);
      for (let day = fromDay; day <= toDay; day += 1) {
        activeBlock.counts[day] += 1;
      }
    });

    blockEntries.forEach(({ headerRow, counts }) => {
      const calendarCells = headerRow.querySelectorAll(`.day-cell[${DAY_ATTR}]`);
      calendarCells.forEach((cell) => {
        const day = Number.parseInt(cell.getAttribute(DAY_ATTR), 10);
        const count = Number.isInteger(day) ? counts[day] : 0;
        updateHeaderDayCountCell(cell, count);
      });
    });
  }

  function markCalendarCells(root) {
    const headerTrack = root.querySelector("#right-header-track");
    if (!headerTrack) {
      return;
    }

    const calendarColumns = detectCalendarColumns(headerTrack);
    if (!calendarColumns.length) {
      return;
    }

    const allDayCells = root.querySelectorAll("#right-body .day-row .day-cell");
    allDayCells.forEach((cell) => {
      cell.classList.remove(RANGE_CELL_CLASS);
      cell.classList.remove(RANGE_START_CLASS);
      cell.classList.remove(RANGE_END_CLASS);
      cell.removeAttribute(DAY_ATTR);
    });

    const dayRows = [...root.querySelectorAll("#right-body .day-row")];
    const leftRows = [...root.querySelectorAll("#left-body .left-row")];
    dayRows.forEach((row, rowIndex) => {
      const rowCells = [...row.children];
      calendarColumns.forEach(({ columnIndex, day }) => {
        const targetCell = rowCells[columnIndex];
        if (!targetCell) {
          return;
        }

        targetCell.setAttribute(DAY_ATTR, String(day));
      });

      if (!isDataRow(row, leftRows[rowIndex])) {
        return;
      }

      paintRangeForRow(row, leftRows[rowIndex]);
    });

    renderBlockDailyCounts(dayRows, leftRows);
  }

  function paintSingleRowByLeftRow(root, leftRow) {
    if (!leftRow) {
      return;
    }

    const leftRows = [...root.querySelectorAll("#left-body .left-row")];
    const rowIndex = leftRows.indexOf(leftRow);
    if (rowIndex < 0) {
      return;
    }

    const dayRows = root.querySelectorAll("#right-body .day-row");
    const dayRow = dayRows[rowIndex];
    if (!dayRow) {
      return;
    }

    paintRangeForRow(dayRow, leftRow);
  }

  function paintAllRows(root) {
    const dayRows = [...root.querySelectorAll("#right-body .day-row")];
    const leftRows = [...root.querySelectorAll("#left-body .left-row")];
    dayRows.forEach((dayRow, rowIndex) => {
      paintRangeForRow(dayRow, leftRows[rowIndex]);
    });
  }

  function isDataRow(dayRow, leftRow) {
    if (!dayRow || dayRow.classList.contains("group")) {
      return false;
    }

    if (!leftRow || leftRow.classList.contains("group")) {
      return false;
    }

    const hasListoCheckbox = leftRow.querySelector('input[type="checkbox"].listo-checkbox');
    const hasEditableTitleCell = leftRow.querySelector('.title-cell[data-column-key="title"], .title-cell__input, .title-cell__text');
    return Boolean(hasListoCheckbox || hasEditableTitleCell);
  }

  function scheduleMark(root) {
    if (rafId !== null) {
      return;
    }

    rafId = window.requestAnimationFrame(() => {
      rafId = null;
      markCalendarCells(root);
    });
  }

  function startCalendarMarkObserver(root) {
    const targetNode = root.querySelector(OBSERVER_TARGET_SELECTOR) || root.querySelector("#right-body");
    if (!targetNode) {
      return;
    }

    if (observer) {
      observer.disconnect();
    }

    observer = new MutationObserver((mutationList) => {
      const hasStructuralChange = mutationList.some((mutation) => mutation.type === "childList");
      if (!hasStructuralChange) {
        return;
      }

      scheduleMark(root);
    });

    observer.observe(targetNode, {
      childList: true,
      subtree: true,
    });
  }

  function attachDateEditRepaintListeners(root) {
    const flushPendingRepaint = () => {
      repaintRafId = null;
      repaintRafId2 = null;
      repaintTimeoutId = null;

      if (pendingFullRepaint) {
        pendingRowsToRepaint.clear();
        pendingFullRepaint = false;
        markCalendarCells(root);
        return;
      }

      const rowsToRepaint = [...pendingRowsToRepaint];
      pendingRowsToRepaint.clear();
      rowsToRepaint.forEach((leftRow) => {
        paintSingleRowByLeftRow(root, leftRow);
      });
    };

    const schedulePostUpdateRepaint = ({ leftRow = null, full = false } = {}) => {
      if (full) {
        pendingFullRepaint = true;
      } else if (leftRow) {
        pendingRowsToRepaint.add(leftRow);
      } else {
        pendingFullRepaint = true;
      }

      if (repaintRafId !== null || repaintRafId2 !== null || repaintTimeoutId !== null) {
        return;
      }

      repaintRafId = window.requestAnimationFrame(() => {
        repaintRafId2 = window.requestAnimationFrame(() => {
          repaintTimeoutId = window.setTimeout(flushPendingRepaint, 0);
        });
      });
    };

    const isDateColumnEvent = (event) => {
      const targetCell = event.target?.closest?.(DATE_COLUMN_SELECTOR);
      return targetCell || null;
    };

    const repaintFromEvent = (event) => {
      const targetCell = isDateColumnEvent(event);
      if (!targetCell) {
        return;
      }

      const leftRow = targetCell.closest(".left-row");
      if (!leftRow) {
        return;
      }

      schedulePostUpdateRepaint({ leftRow });
    };

    root.addEventListener("input", repaintFromEvent, true);
    root.addEventListener("change", repaintFromEvent, true);
    root.addEventListener("focusout", repaintFromEvent, true);
    root.addEventListener("paste", (event) => {
      const eventTarget = event.target instanceof Element ? event.target : null;
      const pastedInsideGantt = eventTarget?.closest?.(GANTT_BODY_SELECTOR);
      if (!pastedInsideGantt) {
        return;
      }

      schedulePostUpdateRepaint({ full: true });
    }, true);

    const handleDocumentPaste = (event) => {
      const eventTarget = event.target instanceof Element ? event.target : null;
      const targetInsideMonthBlock = eventTarget?.closest?.(".month-block") || root.contains(eventTarget);
      if (!targetInsideMonthBlock) {
        return;
      }

      if (DEBUG_PASTE) {
        console.log("[gantt][paste] detected", event.type, "on", event.target);
      }

      repaintUntilStable(root, { maxMs: 600 });
    };

    document.addEventListener("paste", handleDocumentPaste, true);
    document.addEventListener("beforeinput", (event) => {
      if (event.inputType !== "insertFromPaste") {
        return;
      }

      handleDocumentPaste(event);
    }, true);

    root.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") {
        return;
      }
      
      repaintFromEvent(event);
    }, true);
  }

  function run() {
    const monthBlock = document.querySelector(".month-block");
    if (!monthBlock) {
      return;
    }

    markCalendarCells(monthBlock);
    startCalendarMarkObserver(monthBlock);
    attachDateEditRepaintListeners(monthBlock);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
})();
