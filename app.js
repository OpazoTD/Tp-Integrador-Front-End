/*********************************************************************************************************
 *
 *  Estado e inicialización de variables y constantes.
 *
 **********************************************************************************************************/
const state = {
  factors: [],                        // Arreglo para cargar los factores de emisión, desde JSON.
  factorMap: new Map(),               // Mapa para buscar el factor de emisión.
  factorMapNorm: new Map(),           // Mapa para buscar el factor de emisión pero por nombre normalizado (minúsculas sin esp.)
  cats: {},                           // catálogo por categorías
  
  // Valores por defecto para anualizar consumos diarios
  defaults: {
    laborales: 20,
    invierno: 90,
    verano: 90,
    diasArtefactos: 351,
    diasIluminacion: 351,
  },

  // Equivalencias (kgCO2eq a otra unidad)
  equivalences: {},
  horas: { artefactos: {}, invierno: {}, verano: {} },
  km: { commute: { ida: {}, vuelta: {} }, business: {} },
  ilum: [],
  foods: [],
  subtotals: {
    artefactos: 0,
    clima: 0,
    transporte: 0,
    iluminacion: 0,
    alimentos: 0,
  },
};

const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
const number = (v, f = 0) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : f;
};
const fmt = (n) => (Math.round(n * 100) / 100).toLocaleString("es-AR");

async function loadData() {
  const [factors, cats, defaults, eq, foods] = await Promise.all([
    fetch("emission_factors.json").then((r) => r.json()),
    fetch("categories.json").then((r) => r.json()),
    fetch("defaults.json").then((r) => r.json()),
    fetch("equivalences.json").then((r) => r.json()),
    fetch("foods.json").then((r) => r.json()),
  ]);
  state.factors = factors;
  state.factorMap = new Map(factors.map((f) => [f.name, f.factor]));
  state.factorMapNorm = new Map(
    factors.map((f) => [f.name.trim().toLowerCase(), f.factor])
  );
  state.cats = cats;
  state.defaults = { ...state.defaults, ...defaults };
  state.equivalences = eq;
  state.foods = foods;
}

function factorFor(name) {
  if (!name) return 0;
  const f = state.factorMap.get(name);
  if (typeof f === "number") return f;
  return state.factorMapNorm.get(name.trim().toLowerCase()) ?? 0;
}

function rowCounter({ label, unit = "h", value = 0, onChange }) {
  const wrap = document.createElement("div");
  wrap.className = "card item";
  wrap.innerHTML = `
    <div>
      <div class="name text-gray-900 dark:text-gray-100">${label}</div>
      <div class="meta text-xs text-gray-500 dark:text-gray-300"><span class="factor text-xs" data-label="${label}"></span></div>
    </div>
    <div class="right">
      <button class="btn minus inline-flex items-center justify-center rounded-md border border-gray-300 dark:border-zinc-700 w-8 h-8 text-[15px] hover:bg-gray-100 dark:hover:bg-zinc-800 transition" aria-label="Restar">−</button>
      <input class="input val w-full rounded-md border border-gray-300 dark:border-zinc-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 focus:outline-none focus:ring focus:ring-emerald-500/30" type="number" inputmode="decimal" min="0" step="${
        unit === "km" ? 0.1 : 0.5
      }" value="${value}">
      <button class="btn plus inline-flex items-center justify-center rounded-md border border-gray-300 dark:border-zinc-700 w-8 h-8 text-[15px] hover:bg-gray-100 dark:hover:bg-zinc-800 transition" aria-label="Sumar">+</button>
    </div>
    <div class="emi">0</div>
  `;
  const val = $(".val", wrap),
    minus = $(".minus", wrap),
    plus = $(".plus", wrap);
  minus.addEventListener("click", () => {
    val.value = Math.max(0, number(val.value) - 1);
    onChange(number(val.value));
  });
  plus.addEventListener("click", () => {
    val.value = number(val.value) + 1;
    onChange(number(val.value));
  });
  val.addEventListener("input", () => onChange(number(val.value)));
  return wrap;
}

/*********************************************************************************************************
 *
 *  Funciones que calculan la huella de carbono para cada sección.
 *
 **********************************************************************************************************/

function renderArtefactos() {
  $("#diasArtefactos").value = state.defaults.diasArtefactos;
  const list = $("#list-artefactos");
  list.innerHTML = "";
  state.cats.artefactos.forEach((name) => {
    const factor = factorFor(name);
    const row = rowCounter({
      label: name,
      unit: "h",
      value: state.horas.artefactos[name] ?? 0,
      onChange: (h) => {
        state.horas.artefactos[name] = h;
        const emi = factor * h * number($("#diasArtefactos").value, 0);
        $(".emi", row).textContent = fmt(emi);
        updateSubtotals();
        persist();
      },
    });
    $(".factor", row).textContent = `factor: ${fmt(factor)} kg CO₂e/h`;
    const h = state.horas.artefactos[name] ?? 0;
    $(".emi", row).textContent = fmt(
      factor * h * number($("#diasArtefactos").value, 0)
    );
    list.appendChild(row);
  });
  $("#diasArtefactos").addEventListener("input", () => {
    updateSubtotals();
    persist();
    $$("#list-artefactos .card.item").forEach((row) => {
      const label = $(".name", row).textContent.trim();
      const f = factorFor(label);
      const h = number($(".val", row).value, 0);
      $(".emi", row).textContent = fmt(
        f * h * number($("#diasArtefactos").value, 0)
      );
    });
  });
}

function renderClima() {
  $("#diasInvierno").value = state.defaults.invierno;
  $("#diasVerano").value = state.defaults.verano;
  const li = $("#list-invierno");
  li.innerHTML = "";
  state.cats.invierno.forEach((name) => {
    const factor = factorFor(name);
    const row = rowCounter({
      label: name,
      unit: "h",
      value: state.horas.invierno[name] ?? 0,
      onChange: (h) => {
        state.horas.invierno[name] = h;
        const emi = factor * h * number($("#diasInvierno").value, 0);
        $(".emi", row).textContent = fmt(emi);
        updateSubtotals();
        persist();
      },
    });
    $(".factor", row).textContent = `factor: ${fmt(factor)} kg CO₂e/h`;
    const h = state.horas.invierno[name] ?? 0;
    $(".emi", row).textContent = fmt(
      factor * h * number($("#diasInvierno").value, 0)
    );
    li.appendChild(row);
  });
  const lv = $("#list-verano");
  lv.innerHTML = "";
  state.cats.verano.forEach((name) => {
    const factor = factorFor(name);
    const row = rowCounter({
      label: name,
      unit: "h",
      value: state.horas.verano[name] ?? 0,
      onChange: (h) => {
        state.horas.verano[name] = h;
        const emi = factor * h * number($("#diasVerano").value, 0);
        $(".emi", row).textContent = fmt(emi);
        updateSubtotals();
        persist();
      },
    });
    $(".factor", row).textContent = `factor: ${fmt(factor)} kg CO₂e/h`;
    const h = state.horas.verano[name] ?? 0;
    $(".emi", row).textContent = fmt(
      factor * h * number($("#diasVerano").value, 0)
    );
    lv.appendChild(row);
  });
  $("#diasInvierno").addEventListener("input", () => {
    updateSubtotals();
    persist();
  });
  $("#diasVerano").addEventListener("input", () => {
    updateSubtotals();
    persist();
  });
}


// Transporte
function renderTransporte() {
  $("#diasLaboralesT").value = state.defaults.laborales;
  const lc = $("#list-commute");
  lc.innerHTML = "";
  state.cats.commute.forEach((mode) => {
    const factor = factorFor(mode);
    const row = document.createElement("div");
    row.className = "card item";
    row.innerHTML = `
      <div>
        <div class="name text-gray-900 dark:text-gray-100">${mode}</div>
        <div class="meta text-xs text-gray-500 dark:text-gray-300"><span class="factor text-xs">factor: ${fmt(
          factor
        )} kg CO₂e/km</span></div>
      </div>
      <div class="right">
        <div class="row" style="gap:6px">
          <input class="input ida w-full rounded-md border border-gray-300 dark:border-zinc-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 focus:outline-none focus:ring focus:ring-emerald-500/30" type="number" inputmode="decimal" min="0" step="0.1" value="${
            state.km.commute.ida[mode] ?? 0
          }" aria-label="Km ida">
          <input class="input vuelta w-full rounded-md border border-gray-300 dark:border-zinc-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 focus:outline-none focus:ring focus:ring-emerald-500/30" type="number" inputmode="decimal" min="0" step="0.1" value="${
            state.km.commute.vuelta[mode] ?? 0
          }" aria-label="Km vuelta">
        </div>
      </div>
      <div class="emi">0</div>
    `;
    const ida = $(".ida", row),
      vuelta = $(".vuelta", row);
    function compute() {
      const e =
        factor *
        (number(ida.value, 0) + number(vuelta.value, 0)) *
        number($("#diasLaboralesT").value, 0);
      $(".emi", row).textContent = fmt(e);
      state.km.commute.ida[mode] = number(ida.value, 0);
      state.km.commute.vuelta[mode] = number(vuelta.value, 0);
      updateSubtotals();
      persist();
    }
    ida.addEventListener("input", compute);
    vuelta.addEventListener("input", compute);
    compute();
    lc.appendChild(row);
  });
  $("#diasLaboralesT").addEventListener("input", () => {
    updateSubtotals();
    persist();
  });

  const lb = $("#list-business");
  lb.innerHTML = "";
  state.cats.business.forEach((mode) => {
    const factor = factorFor(mode);
    const row = document.createElement("div");
    row.className = "card item";
    row.innerHTML = `
      <div>
        <div class="name text-gray-900 dark:text-gray-100">${mode}</div>
        <div class="meta text-xs text-gray-500 dark:text-gray-300"><span class="factor text-xs">factor: ${fmt(
          factor
        )} kg CO₂e/km</span></div>
      </div>
      <div class="right">
        <input class="input kms w-full rounded-md border border-gray-300 dark:border-zinc-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 focus:outline-none focus:ring focus:ring-emerald-500/30" type="number" inputmode="decimal" min="0" step="0.1" value="${
          state.km.business[mode] ?? 0
        }" aria-label="Km totales">
      </div>
      <div class="emi">0</div>
    `;
    const kms = $(".kms", row);
    function compute() {
      const e = factor * number(kms.value, 0);
      $(".emi", row).textContent = fmt(e);
      state.km.business[mode] = number(kms.value, 0);
      updateSubtotals();
      persist();
    }
    kms.addEventListener("input", compute);
    compute();
    lb.appendChild(row);
  });
}

function optionsHTML(arr, selected) {
  return arr
    .map(
      (v) =>
        `<option value="${v}" ${v === selected ? "selected" : ""}>${v}</option>`
    )
    .join("");
}
function factorForLamp(tipo, potencia) {
  if (!tipo || !potencia) return 0;
  const key = `${tipo} ${potencia}`.trim();
  return factorFor(key);
}
function lampRow(item, idx) {
  const tipos = state.cats.iluminacion?.tipos || [];
  const potenciasAll = state.cats.iluminacion?.potencias || {};
  const potencias = potenciasAll[item.tipo] || [];

  const row = document.createElement("div");
  row.className = "card item";
  row.innerHTML = `
    <div style="flex:1">
      <div class="row" style="gap:8px;align-items:flex-end;flex-wrap:wrap">
        <div>
          <label>Tipo</label><br>
          <select class="input tipo w-full rounded-md border border-gray-300 dark:border-zinc-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 focus:outline-none focus:ring focus:ring-emerald-500/30">${optionsHTML(
            tipos,
            item.tipo || tipos[0] || ""
          )}</select>
        </div>
        <div>
          <label>Potencia</label><br>
          <select class="input potencia w-full rounded-md border border-gray-300 dark:border-zinc-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 focus:outline-none focus:ring focus:ring-emerald-500/30">${optionsHTML(
            potencias,
            item.potencia || potencias[0] || ""
          )}</select>
        </div>
        <div>
          <label>Cantidad</label><br>
          <input class="input qty w-full rounded-md border border-gray-300 dark:border-zinc-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 focus:outline-none focus:ring focus:ring-emerald-500/30" type="number" inputmode="numeric" min="0" step="1" value="${
            item.qty ?? 0
          }">
        </div>
        <div>
          <label>Horas/día</label><br>
          <input class="input hrs w-full rounded-md border border-gray-300 dark:border-zinc-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 focus:outline-none focus:ring focus:ring-emerald-500/30" type="number" inputmode="decimal" min="0" step="0.5" value="${
            item.hrs ?? 0
          }">
        </div>
      </div>
    </div>
    <div class="right">
      <button class="btn icon del inline-flex items-center justify-center rounded-md border border-gray-300 dark:border-zinc-700 w-8 h-8 text-[15px] hover:bg-gray-100 dark:hover:bg-zinc-800 transition" title="Eliminar">✕</button>
    </div>
    <div class="emi">0</div>
  `;
  const tipoSel = row.querySelector(".tipo");
  const potenciaSel = row.querySelector(".potencia");
  const qtyInp = row.querySelector(".qty");
  const hrsInp = row.querySelector(".hrs");

  function refreshPotencias() {
    const t = tipoSel.value;
    const pots = (state.cats.iluminacion?.potencias || {})[t] || [];
    potenciaSel.innerHTML = optionsHTML(
      pots,
      pots.includes(item.potencia) ? item.potencia : pots[0] || ""
    );
    compute();
  }

  function compute() {
    const t = tipoSel.value;
    const p = potenciaSel.value;
    const f = factorForLamp(t, p);
    const emi =
      f *
      parseFloat(qtyInp.value || "0") *
      parseFloat(hrsInp.value || "0") *
      number($("#diasIluminacion")?.value ?? state.defaults.diasIluminacion, 0);
    row.querySelector(".emi").textContent = fmt(emi);
    state.ilum[idx] = {
      tipo: t,
      potencia: p,
      qty: parseFloat(qtyInp.value || "0"),
      hrs: parseFloat(hrsInp.value || "0"),
    };
    updateSubtotals();
    persist();
  }

  tipoSel.addEventListener("change", refreshPotencias);
  potenciaSel.addEventListener("change", compute);
  qtyInp.addEventListener("input", compute);
  hrsInp.addEventListener("input", compute);
  row.querySelector(".del").addEventListener("click", () => {
    state.ilum.splice(idx, 1);
    renderIluminacion();
    updateSubtotals();
    persist();
  });

  refreshPotencias();
  return row;
}

// Iluminacion

// Genera las opciones para los selectores en esta seccion
function optionsHTML(arr, selected) {
  return arr
    .map(
      (v) =>
        `<option value="${v}" ${v === selected ? "selected" : ""}>${v}</option>`
    )
    .join("");
}
//Devuelve el factor de una lámpara según tipo y potencia
function factorForLamp(tipo, potencia) {  
  if (!tipo || !potencia) return 0;
  const key = `${tipo} ${potencia}`.trim();
  return factorFor(key);
}

// Crea la el formulario de la seccion iluminacion con sus controles
function lampRow(item, idx) {
  const tipos = state.cats.iluminacion?.tipos || [];
  const potenciasAll = state.cats.iluminacion?.potencias || {};
  const potencias = potenciasAll[item.tipo] || [];

  const row = document.createElement("div");
  row.className = "card item";
  row.innerHTML = `
    <div style="flex:1">
      <div class="row" style="gap:8px;align-items:flex-end;flex-wrap:wrap">
        <div>
          <label>Tipo</label><br>
          <select class="input tipo w-full rounded-md border border-gray-300 dark:border-zinc-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 focus:outline-none focus:ring focus:ring-emerald-500/30">${optionsHTML(
            tipos,
            item.tipo || tipos[0] || ""
          )}</select>
        </div>
        <div>
          <label>Potencia</label><br>
          <select class="input potencia w-full rounded-md border border-gray-300 dark:border-zinc-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 focus:outline-none focus:ring focus:ring-emerald-500/30">${optionsHTML(
            potencias,
            item.potencia || potencias[0] || ""
          )}</select>
        </div>
        <div>
          <label>Cantidad</label><br>
          <input class="input qty w-full rounded-md border border-gray-300 dark:border-zinc-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 focus:outline-none focus:ring focus:ring-emerald-500/30" type="number" inputmode="numeric" min="0" step="1" value="${
            item.qty ?? 0
          }">
        </div>
        <div>
          <label>Horas/día</label><br>
          <input class="input hrs w-full rounded-md border border-gray-300 dark:border-zinc-700 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 focus:outline-none focus:ring focus:ring-emerald-500/30" type="number" inputmode="decimal" min="0" step="0.5" value="${
            item.hrs ?? 0
          }">
        </div>
      </div>
    </div>
    <div class="right">
      <button class="btn icon del inline-flex items-center justify-center rounded-md border border-gray-300 dark:border-zinc-700 w-8 h-8 text-[15px] hover:bg-gray-100 dark:hover:bg-zinc-800 transition" title="Eliminar">✕</button>
    </div>
    <div class="emi">0</div>
  `;
  const tipoSel = row.querySelector(".tipo");
  const potenciaSel = row.querySelector(".potencia");
  const qtyInp = row.querySelector(".qty");
  const hrsInp = row.querySelector(".hrs");

  // Actualiza las potencias disponibles al cambiar el tipo de lámpara
  function refreshPotencias() {
    const t = tipoSel.value;
    const pots = (state.cats.iluminacion?.potencias || {})[t] || [];
    potenciaSel.innerHTML = optionsHTML(
      pots,
      pots.includes(item.potencia) ? item.potencia : pots[0] || ""
    );
    compute();
  }

    // Calcula las emisiones de cada lámpara y actualiza la fila y el estado
  function compute() {
    const t = tipoSel.value;
    const p = potenciaSel.value;
    const f = factorForLamp(t, p);
    const emi =
      f *
      parseFloat(qtyInp.value || "0") *
      parseFloat(hrsInp.value || "0") *
      number($("#diasIluminacion")?.value ?? state.defaults.diasIluminacion, 0);
    row.querySelector(".emi").textContent = fmt(emi);
    state.ilum[idx] = {
      tipo: t,
      potencia: p,
      qty: parseFloat(qtyInp.value || "0"),
      hrs: parseFloat(hrsInp.value || "0"),
    };
    updateSubtotals();
    persist();
  }
// Eventos para refrescar o calcular según cambios del usuario
  tipoSel.addEventListener("change", refreshPotencias);
  potenciaSel.addEventListener("change", compute);
  qtyInp.addEventListener("input", compute);
  hrsInp.addEventListener("input", compute);

  // Botón para eliminar la fila de lámpara
  row.querySelector(".del").addEventListener("click", () => {
    state.ilum.splice(idx, 1);
    renderIluminacion();
    updateSubtotals();
    persist();
  });

  refreshPotencias();
  return row;
}

// Renderiza toda la lista de lámparas
function renderIluminacion() {
  const cont = document.getElementById("list-ilum");
  cont.innerHTML = "";
  if (!Array.isArray(state.ilum) || state.ilum.length === 0) {
    const t0 = (state.cats.iluminacion?.tipos || [])[0] || "";
    const p0 = ((state.cats.iluminacion?.potencias || {})[t0] || [])[0] || "";
    state.ilum = [
      { tipo: t0, potencia: p0, qty: 0, hrs: 0 },
      { tipo: t0, potencia: p0, qty: 0, hrs: 0 },
      { tipo: t0, potencia: p0, qty: 0, hrs: 0 },
    ];
  }
  state.ilum.forEach((it, i) => cont.appendChild(lampRow(it, i)));

    // Botón para agregar una nueva lámpara
  const btnAdd = document.getElementById("btnAddLamp");
  btnAdd.onclick = () => {
    const t0 = (state.cats.iluminacion?.tipos || [])[0] || "";
    const p0 = ((state.cats.iluminacion?.potencias || {})[t0] || [])[0] || "";
    state.ilum.push({ tipo: t0, potencia: p0, qty: 0, hrs: 0 });
    renderIluminacion();
    updateSubtotals();
    persist();
  };

  // Botón para reiniciar las lámparas cargadas
  const btnClear = document.getElementById("btnClearLamp");
  if (btnClear) {
    btnClear.onclick = () => {
      if (!Array.isArray(state.ilum) || state.ilum.length === 0) {
        const t0 = (state.cats.iluminacion?.tipos || [])[0] || "";
        const p0 =
          ((state.cats.iluminacion?.potencias || {})[t0] || [])[0] || "";
        state.ilum = [
          { tipo: t0, potencia: p0, qty: 0, hrs: 0 },
          { tipo: t0, potencia: p0, qty: 0, hrs: 0 },
          { tipo: t0, potencia: p0, qty: 0, hrs: 0 },
        ];
      } else {
        state.ilum = state.ilum.map((it) => ({ ...it, qty: 0, hrs: 0 }));
      }
      renderIluminacion();
      updateSubtotals();
      persist();
    };
  }
  
// Recalcula todas las emisiones si cambian los días de uso
  const dIlu = document.getElementById("diasIluminacion");
  if (dIlu) {
    if (!dIlu.value) dIlu.value = state.defaults.diasIluminacion;
    dIlu.oninput = () => {
      document.querySelectorAll("#list-ilum .card.item").forEach((row) => {
        const tipoSel = row.querySelector(".tipo");
        const potenciaSel = row.querySelector(".potencia");
        const qty = parseFloat(row.querySelector(".qty").value || "0");
        const hrs = parseFloat(row.querySelector(".hrs").value || "0");
        const f = factorFor(`${tipoSel.value} ${potenciaSel.value}`);
        row.querySelector(".emi").textContent = fmt(
          f * qty * hrs * number(dIlu.value, 0)
        );
      });
      updateSubtotals();
      persist();
    };
  }
}


/*********************************************************************************************************
 *
 *  Funciones comunes a todas las secciones
 *
 **********************************************************************************************************/

function updateSubtotals() {
  // artefactos eléctricos
  const dA = number(
    $("#diasArtefactos")?.value ?? state.defaults.diasArtefactos,
    0
  );
  state.subtotals.artefactos = (state.cats.artefactos || []).reduce(
    (sum, name) =>
      sum + factorFor(name) * (state.horas.artefactos[name] ?? 0) * dA,
    0
  );
  // climatización
  const dI = number($("#diasInvierno")?.value ?? state.defaults.invierno, 0);
  const dV = number($("#diasVerano")?.value ?? state.defaults.verano, 0);
  const subInv = (state.cats.invierno || []).reduce(
    (sum, name) =>
      sum + factorFor(name) * (state.horas.invierno[name] ?? 0) * dI,
    0
  );
  const subVer = (state.cats.verano || []).reduce(
    (sum, name) => sum + factorFor(name) * (state.horas.verano[name] ?? 0) * dV,
    0
  );
  state.subtotals.clima = subInv + subVer;
  
    // Transporte
  const dLT = number(
    $("#diasLaboralesT")?.value ?? state.defaults.laborales,
    0
  );
  const subComm = (state.cats.commute || []).reduce(
    (sum, mode) =>
      sum +
      factorFor(mode) *
        ((state.km.commute.ida[mode] ?? 0) +
          (state.km.commute.vuelta[mode] ?? 0)) *
        dLT,
    0
  );
  const subBiz = (state.cats.business || []).reduce(
    (sum, mode) => sum + factorFor(mode) * (state.km.business[mode] ?? 0),
    0
  );
  state.subtotals.transporte = subComm + subBiz;
  
  // iluminacion
    const dIlu = number(
    $("#diasIluminacion")?.value ?? state.defaults.diasIluminacion,
    0
  );
  const subIlum = (state.ilum || []).reduce(
    (sum, it) =>
      sum +
      factorFor(`${it.tipo} ${it.potencia}`) *
        (it.qty || 0) *
        (it.hrs || 0) *
        dIlu,
    0
  );
  state.subtotals.iluminacion = subIlum;
  const subIlumEl = document.getElementById("subIlum");
  if (subIlumEl) subIlumEl.textContent = fmt(subIlum);

  updateFooter();
}

function updateFooter() {
  const total =
    state.subtotals.artefactos +
    state.subtotals.clima +
    state.subtotals.transporte +
    state.subtotals.iluminacion +
    (state.subtotals.alimentos || 0);
  $("#totalFooter").textContent = fmt(total);
}


function persist() {
  localStorage.setItem(
    "hc.mobile.full",
    JSON.stringify({
      horas: state.horas,
      km: state.km,
      ilum: state.ilum,
      diasArtefactos: number(
        $("#diasArtefactos")?.value ?? state.defaults.diasArtefactos,
        state.defaults.diasArtefactos
      ),
      diasInvierno: number(
        $("#diasInvierno")?.value ?? state.defaults.invierno,
        state.defaults.invierno
      ),
      diasVerano: number(
        $("#diasVerano")?.value ?? state.defaults.verano,
        state.defaults.verano
      ),
      diasLaboralesT: number(
        $("#diasLaboralesT")?.value ?? state.defaults.laborales,
        state.defaults.laborales
      ),
      diasIluminacion: number(
        $("#diasIluminacion")?.value ?? state.defaults.diasIluminacion,
        state.defaults.diasIluminacion
      ),
      foodPrefs: (function () {
        const prefs = {};
        const rows = Array.from(
          document.querySelectorAll("#list-foods .card.item")
        );
        rows.forEach((row, idx) => {
          const it = state.foods[idx];
          if (!it) return;
          prefs[it.id] = {
            pors: parseFloat(row.querySelector(".pors").value || "0"),
            grams: parseFloat(
              row.querySelector(".grams").value || String(it.portion_g)
            ),
          };
        });
        return prefs;
      })(),
    })
  );
}

function restore() {
  const raw = localStorage.getItem("hc.mobile.full");
  if (!raw) return;
  try {
    const d = JSON.parse(raw);
    state.horas = d.horas || state.horas;
    state.km = d.km || state.km;
    state.ilum = Array.isArray(d.ilum) ? d.ilum : state.ilum;
    if ($("#diasArtefactos"))
      $("#diasArtefactos").value =
        d.diasArtefactos ?? state.defaults.diasArtefactos;
    if ($("#diasInvierno"))
      $("#diasInvierno").value = d.diasInvierno ?? state.defaults.invierno;
    if ($("#diasVerano"))
      $("#diasVerano").value = d.diasVerano ?? state.defaults.verano;
    if ($("#diasLaboralesT"))
      $("#diasLaboralesT").value = d.diasLaboralesT ?? state.defaults.laborales;
    if ($("#diasIluminacion"))
      $("#diasIluminacion").value =
        d.diasIluminacion ?? state.defaults.diasIluminacion;
  } catch (e) {}
}

function resetAll() {
  state.horas = { artefactos: {}, invierno: {}, verano: {} };
  state.km = { commute: { ida: {}, vuelta: {} }, business: {} };
  state.ilum = [];
  localStorage.removeItem("hc.mobile.full");
  renderAll();
}

function renderAll() {
  renderArtefactos();
  renderClima();
  updateSubtotals();
  renderIluminacion();
  renderTransporte();
  // updateResumen();
}

// --- Wizard (paso a paso) ---
const WIZARD_STEPS = [
  { key: "artefactos", label: "Artefactos" },
  { key: "clima", label: "Climatización" },
  { key: "iluminacion", label: "Iluminación" },
  { key: "transporte", label: "Transporte" },
  { key: "alimentos", label: "Alimentación" },
  { key: "resumen", label: "Resumen" },
];
let currentStep = 0;

function renderWizardHeader() {
  const ol = document.getElementById("wizard-steps");
  if (!ol) return;

  ol.innerHTML = "";

  WIZARD_STEPS.forEach((s, idx) => {
    const isActive = idx === currentStep;

    const li = document.createElement("li");
    li.className =
      "step-item flex flex-col items-center justify-center text-center gap-1 select-none";
    li.setAttribute("role", "tab");
    li.setAttribute("aria-selected", isActive ? "true" : "false");
    li.setAttribute("aria-controls", `page-${s.key}`);

    // Clases para Tailwind
    const dotClsBase =
      "inline-flex items-center justify-center w-8 h-8 rounded-full border text-sm font-semibold transition";
    const dotClsOn =
      "bg-emerald-600 text-white border-emerald-600 shadow-sm dark:bg-lime-600 dark:border-lime-600";
    const dotClsOff =
      "bg-gray-200 text-gray-700 border-gray-300 dark:bg-zinc-700 dark:text-gray-100 dark:border-zinc-600";

    const labelClsBase = "text-[11px] sm:text-xs font-medium transition";
    const labelClsOn = "text-emerald-700 dark:text-lime-400";
    const labelClsOff = "text-gray-600 dark:text-gray-300";

    li.innerHTML = `
      <button type="button" class="group focus:outline-none focus:ring-2 focus:ring-emerald-400/60 dark:focus:ring-emerald-300/50 rounded-full">
        <span class="step-dot ${dotClsBase} ${
      isActive ? dotClsOn : dotClsOff
    }">${idx + 1}</span>
        <span class="step-label block mt-1 ${labelClsBase} ${
      isActive ? labelClsOn : labelClsOff
    }">${s.label}</span>
      </button>
    `;

    li.addEventListener("click", () => goToStep(idx));
    ol.appendChild(li);
  });
}

function goToStep(idx) {
  currentStep = Math.max(0, Math.min(idx, WIZARD_STEPS.length - 1));
  const activeKey = WIZARD_STEPS[currentStep].key;
  document
    .querySelectorAll(".page")
    .forEach((pg) =>
      pg.classList.toggle("active", pg.id === "page-" + activeKey)
    );
  renderWizardHeader();
  const prev = document.getElementById("btnPrev");
  const next = document.getElementById("btnNext");
  if (prev) prev.disabled = currentStep === 0;
  if (next)
    next.textContent =
      currentStep === WIZARD_STEPS.length - 1 ? "Finalizar" : "Siguiente →";
  if (activeKey === "resumen") updateResumen();
  updateFooter();
}
function nextStep() {
  goToStep(currentStep + 1);
}
function prevStep() {
  goToStep(currentStep - 1);
}

async function main() {
  await loadData();
  restore();
  renderAll();
  renderWizardHeader();
  goToStep(0);
  $("#btnResetAll").addEventListener("click", resetAll);
  document.getElementById("btnNext").addEventListener("click", nextStep);
  document.getElementById("btnPrev").addEventListener("click", prevStep);
}
main();
