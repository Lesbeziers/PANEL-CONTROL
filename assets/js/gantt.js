(function initCalendarColumnDebugModule() {
  const CALENDAR_CELL_CLASS = "isCalendarCell";
  const DAY_ATTR = "data-day";
  const OBSERVER_TARGET_SELECTOR = ".month-block #right-body";

  let observer = null;
  let rafId = null;
  
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

  function markCalendarCells(root) {
    const headerTrack = root.querySelector("#right-header-track");
    if (!headerTrack) {
      return;
    }

    const calendarColumns = detectCalendarColumns(headerTrack);
    if (!calendarColumns.length) {
      return;
    }

    const dayRows = root.querySelectorAll("#right-body .day-row");
    dayRows.forEach((row) => {
      const rowCells = [...row.children];
      calendarColumns.forEach(({ columnIndex, day }) => {
        const targetCell = rowCells[columnIndex];
        if (!targetCell) {
          return;
        }

        targetCell.classList.add(CALENDAR_CELL_CLASS);
        targetCell.setAttribute(DAY_ATTR, String(day));
      });
    });
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

  function run() {
    const monthBlock = document.querySelector(".month-block");
    if (!monthBlock) {
      return;
    }

    markCalendarCells(monthBlock);
    startCalendarMarkObserver(monthBlock);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
})();
