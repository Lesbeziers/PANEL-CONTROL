(function initPanelDateUtils(globalScope) {
  function sanitizeDateInputText(value) {
    const raw = `${value ?? ""}`;
    if (!raw) {
      return "";
    }

    const normalizedSpaces = raw
      .replace(/\u00A0/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!normalizedSpaces) {
      return "";
    }

    const withoutTimeSuffix = normalizedSpaces
      .replace(/\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM|am|pm))?$/, "")
      .replace(/\s+\d{1,2}\.\d{2}(?::\d{2})?$/, "")
      .trim();

    return withoutTimeSuffix;
  }

  function parseDatePartsFromText(value, { defaultMonth, defaultYear } = {}) {
    const normalized = sanitizeDateInputText(value);
    if (!normalized) {
      return { ok: true, empty: true, normalized };
    }

    let day;
    let month;
    let year;
    let hasExplicitYear = false;

    const normalizedSeparators = normalized.replace(/[.-]/g, "/");

    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(normalized)) {
      const [y, m, d] = normalized.split("-").map((chunk) => Number.parseInt(chunk, 10));
      day = d;
      month = m;
      year = y;
      hasExplicitYear = true;
    } else if (/^\d{6}$/.test(normalized)) {
      day = Number.parseInt(normalized.slice(0, 2), 10);
      month = Number.parseInt(normalized.slice(2, 4), 10);
      year = Number.parseInt(normalized.slice(4, 6), 10) + 2000;
      hasExplicitYear = true;
    } else if (/^\d{1,2}([/.-]\d{1,2}){0,2}$/.test(normalized)) {
      const parts = normalizedSeparators.split("/");
      day = Number.parseInt(parts[0], 10);
      month = parts[1] ? Number.parseInt(parts[1], 10) : defaultMonth;
      if (parts[2]) {
        year = Number.parseInt(parts[2], 10);
        hasExplicitYear = true;
        if (parts[2].length === 2) {
          year += 2000;
        }
      } else {
        year = defaultYear;
      }
    } else if (/^\d{8}$/.test(normalized)) {
      day = Number.parseInt(normalized.slice(0, 2), 10);
      month = Number.parseInt(normalized.slice(2, 4), 10);
      year = Number.parseInt(normalized.slice(4, 8), 10);
      hasExplicitYear = true;
    } else {
      return { ok: false, error: "Fecha no válida (DD/MM/YY)", normalized };
    }

    if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) {
      return { ok: false, error: "Fecha no válida (DD/MM/YY)", normalized };
    }

    const maxDay = new Date(year, month, 0).getDate();
    if (month < 1 || month > 12 || day < 1 || day > maxDay) {
      return { ok: false, error: "Fecha no válida (DD/MM/YY)", normalized };
    }

    return {
      ok: true,
      empty: false,
      normalized,
      day,
      month,
      year,
      hasExplicitYear,
      date: new Date(year, month - 1, day),
    };
  }

  globalScope.PanelDateUtils = {
    sanitizeDateInputText,
    parseDatePartsFromText,
  };
}(window));
