const columns = [
  { key: "listo", label: "LISTO", type: "checkbox" },
  { key: "promoBlockType", label: "TIPO", type: "select" },
  { key: "title", label: "TÍTULO", type: "text" },
  { key: "startDate", label: "INICIO VIG", type: "text" },
  { key: "endDate", label: "FIN VIG", type: "text" },
  { key: "genre", label: "GÉNERO", type: "text" },
  { key: "id", label: "ID", type: "text" },
];

const headers = columns.map((column) => column.label);

const blockTypeOptions = [
  "Arranque",
  "Bumper",
  "Canales LaLiga",
  "Canales Golf",
  "Colas",
  "Combo",
  "Distribuidores",
  "ID",
  "Intruso",
  "Loop",
  "Otras duraciones",
  "Pasos a Publi",
  "Pre-Roll",
  "Promo 20",
  "Promo 40",
];

let rowId = 0;

function newRow() {
  rowId += 1;
  return { id: `row-${Date.now()}-${rowId}`, blockType: "", promoBlockType: "", listo: false };
}

function newRowForBlock(blockType) {
  const row = newRow();
  row.blockType = blockType;
  row.promoBlockType = blockTypeOptions.includes(blockType) ? blockType : "";
  return row;
}

let blocks = [
  { id: "block-1", blockType: "Promo 20", headerColor: "#70ad47", rows: [newRowForBlock("Promo 20")] },
  { id: "block-2", blockType: "Promo 20", headerColor: "#fcc000", rows: [newRowForBlock("Promo 20")] },
];
let contextMenu = { open: false, x: 0, y: 0, blockIndex: -1, rowIndex: -1 };
let menuElement = null;

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

  for (let i = 0; i < 8; i++) {
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
    } else {
      cell.textContent = cells[i] || "";
    }

    leftRow.appendChild(cell);
  }

  return leftRow;
}

function createBlockTypeSelect(row) {
  const select = document.createElement("select");
  select.className = "block-type-select";
  const selectedValue = blockTypeOptions.includes(row.promoBlockType) ? row.promoBlockType : "";

  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = "";
  select.appendChild(emptyOption);

  blockTypeOptions.forEach((optionValue) => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = optionValue;
    option.selected = optionValue === selectedValue;
    select.appendChild(option);
  });

  select.value = selectedValue;
  select.addEventListener("change", (event) => {
    row.promoBlockType = event.target.value;
  });

  return select;
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
    if (event.target === input) {
      return;
    }
    toggleListo();
  });

  cell.addEventListener("keydown", (event) => {
    if (event.key === " " || event.key === "Spacebar" || event.key === "Enter") {
      event.preventDefault();
      toggleListo();
    }
  });

  cell.appendChild(input);
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
        <div class="month-block__body-grid">
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
}

function renderRows() {
  const leftBody = document.getElementById("left-body");
  const rightBody = document.getElementById("right-body");

  leftBody.innerHTML = "";
  rightBody.innerHTML = "";

  blocks.forEach((block, blockIndex) => {
    const groupLeftRow = createLeftRow({
      group: true,
      cells: ["", "", block.blockType.toUpperCase(), "MÁXIMO 5 SIMULTÁNEAS", "", "", "", ""],
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

      const typeCell = leftRow.children[2];
      typeCell.textContent = "";
      typeCell.appendChild(createBlockTypeSelect(row));

      leftRow.addEventListener("contextmenu", (event) => openContextMenu(event, blockIndex, rowIndex));
      dayRow.addEventListener("contextmenu", (event) => openContextMenu(event, blockIndex, rowIndex));

      leftBody.appendChild(leftRow);
      rightBody.appendChild(dayRow);
    });
  });
}

renderMonthBlockGrid(document.getElementById("app"));
