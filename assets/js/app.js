const headers = ["LISTO", "TIPO", "TÍTULO", "INICIO VIG", "FIN VIG", "GÉNERO", "ID"];

let rowId = 0;

function newRow() {
  rowId += 1;
  return { id: `row-${Date.now()}-${rowId}` };
}

let rows = [newRow()];

function createLeftRow({ group = false, cells = [] } = {}) {
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
          rows = [...rows, newRow()];
          renderRows();
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

  leftBody.appendChild(
    createLeftRow({
      group: true,
      cells: ["", "", "PROMO 20", "MÁXIMO 5 SIMULTÁNEAS", "", "", "", ""],
    }),
  );
  rightBody.appendChild(createDayRow(true));

  rows.forEach(() => {
    leftBody.appendChild(createLeftRow());
    rightBody.appendChild(createDayRow());
  });
}

renderMonthBlockGrid(document.getElementById("app"));
