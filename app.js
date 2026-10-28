// ---- Configuration: edit before deploying. Public values only, never passwords or API keys. ----
const CONFIG = {
  API_BASE_URL: "https://your-api.onrender.com",
  MAX_MB: 20,
};

const ALLOWED = [".csv", ".xlsx", ".xls", ".json"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EXAMPLES = [
  "What are the total sales by region?",
  "What percentage of sales comes from each region?",
  "Show monthly revenue trends.",
  "Which products generate the highest profit?",
  "Identify missing values and duplicate records.",
  "Compare revenue by product category.",
];

const $ = (id) => document.getElementById(id);
const state = { file: null, controller: null, lastResult: null, charts: [] };

function el(tag, text, cls) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = String(text);
  if (cls) node.className = cls;
  return node;
}

function fmt(v) {
  if (typeof v === "number") return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return v === null || v === undefined ? "" : String(v);
}

function showAlert(msg) {
  $("alert").textContent = msg;
  $("alert").hidden = !msg;
}

function setBusy(busy, text = "") {
  $("analyze-btn").disabled = busy;
  $("cancel-btn").hidden = !busy;
  $("progress").hidden = !busy;
  $("progress").textContent = text;
}

function validateFile(f) {
  const dot = f.name.lastIndexOf(".");
  const ext = dot < 0 ? "" : f.name.slice(dot).toLowerCase();
  if (!ALLOWED.includes(ext)) return `"${ext || "no extension"}" is not supported. Use CSV, XLSX, XLS, or JSON.`;
  if (f.size === 0) return "That file is empty.";
  if (f.size > CONFIG.MAX_MB * 1024 * 1024) return `That file is larger than ${CONFIG.MAX_MB} MB.`;
  return "";
}

function renderTable(title, columns, rows) {
  const wrap = el("div", null, "table-wrap");
  wrap.append(el("h3", title));
  const table = el("table");
  const thead = el("thead");
  const headRow = el("tr");
  columns.forEach((c) => headRow.append(el("th", c)));
  thead.append(headRow);
  const tbody = el("tbody");
  rows.forEach((r) => {
    const tr = el("tr");
    columns.forEach((c) => tr.append(el("td", fmt(r[c]))));
    tbody.append(tr);
  });
  table.append(thead, tbody);
  wrap.append(table);
  return wrap;
}

function renderCharts(charts) {
  state.charts.forEach((c) => c.destroy());
  state.charts = [];
  // The first two charts are drawn here; every table is still shown below.
  ["chart-main", "chart-second"].forEach((id, i) => {
    const canvas = $(id);
    const spec = charts[i];
    canvas.hidden = !spec;
    if (!spec) return;
    if (typeof Chart === "undefined") {
      showAlert("Charts could not load. Check your connection and reload the page.");
      return;
    }
    state.charts.push(new Chart(canvas, {
      type: spec.type === "line" ? "line" : "bar",
      data: {
        labels: spec.labels,
        datasets: [{ label: spec.title, data: spec.values, backgroundColor: "#1f5f5b", borderColor: "#1f5f5b" }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false }, title: { display: true, text: spec.title } },
      },
    }));
  });
}

function render(d) {
  $("results").hidden = false;

  const kpis = $("kpis");
  kpis.replaceChildren();
  d.kpis.forEach((k) => {
    const box = el("div");
    box.append(el("span", k.label), el("strong", fmt(k.value)));
    kpis.append(box);
  });

  $("insights").replaceChildren(...d.insights.map((t) => el("li", t)));

  $("ai-card").hidden = !d.ai_insights;
  $("ai-text").textContent = d.ai_insights || "";

  const q = d.data_quality;
  const missing = Object.entries(q.missing_values)
    .map(([c, n]) => `${c}: ${n} (${q.missing_percent[c]}%)`)
    .join(", ") || "none";
  $("quality").textContent =
    `${q.rows} rows, ${q.columns} columns. Empty rows removed: ${q.empty_rows_removed}. ` +
    `Duplicate rows removed: ${q.duplicates_removed}. Text converted to numbers: ` +
    `${q.numeric_text_converted.join(", ") || "none"}. Missing values: ${missing}.`;

  const tables = $("tables");
  tables.replaceChildren();
  d.tables.forEach((t) => tables.append(renderTable(t.title, t.columns, t.rows)));
  if (d.summary_stats.length) {
    tables.append(renderTable("Summary statistics (numeric columns)",
      Object.keys(d.summary_stats[0]), d.summary_stats));
  }

  renderCharts(d.charts);
  $("warnings").replaceChildren(...d.warnings.map((t) => el("li", t)));
  $("mail-subject").value = `Analysis report: ${d.filename}`;
  setMailStatus("", "");
  $("results").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function analyze(e) {
  e.preventDefault();
  showAlert("");
  if (!state.file) return showAlert("Choose a file first.");
  const query = $("query").value.trim();
  if (!query) return showAlert("Enter a question about your data.");
  const err = validateFile(state.file);
  if (err) return showAlert(err);
  if (CONFIG.API_BASE_URL.includes("your-api")) {
    return showAlert("Set CONFIG.API_BASE_URL in app.js to your Render backend URL first.");
  }

  const form = new FormData();
  form.append("file", state.file, state.file.name);
  form.append("query", query);
  const sheet = $("sheet").value.trim();
  if (sheet) form.append("sheet", sheet);

  state.controller = new AbortController();
  setBusy(true, "Analysing. The free server can take up to a minute to wake up after inactivity.");
  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}/analyze`, {
      method: "POST",
      body: form,
      signal: state.controller.signal,
    });
    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error(`The server returned an unexpected response (HTTP ${res.status}).`);
    }
    if (!res.ok || data.status !== "ok") {
      throw new Error((data.errors && data.errors[0]) || `Analysis failed (HTTP ${res.status}).`);
    }
    state.lastResult = data;
    render(data);
  } catch (err) {
    if (err.name === "AbortError") showAlert("Analysis cancelled.");
    else if (err instanceof TypeError) {
      showAlert("Could not reach the server. It may be waking up, so try again in a minute.");
    } else showAlert(err.message);
  } finally {
    setBusy(false);
    state.controller = null;
  }
}

function setMailStatus(kind, text) {
  const p = $("mail-status");
  p.hidden = !text;
  p.textContent = text;
  p.className = kind === "ok" ? "ok" : kind === "error" ? "alert" : "muted";
}

async function sendReport(e) {
  e.preventDefault();
  if (!state.lastResult) return;
  const to = $("mail-to").value.trim();
  if (!EMAIL_RE.test(to)) return setMailStatus("error", "Enter a valid recipient email address.");

  $("mail-btn").disabled = true;
  setMailStatus("", "Sending...");
  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}/send-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        result: state.lastResult,
        recipient: to,
        subject: $("mail-subject").value.trim(),
        message: $("mail-message").value.trim(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.status === "sent") setMailStatus("ok", `Delivered to ${to}.`);
    else setMailStatus("error", (data.errors && data.errors[0]) || `Email failed (HTTP ${res.status}).`);
  } catch {
    setMailStatus("error", "Could not reach the server. Try again in a minute.");
  } finally {
    $("mail-btn").disabled = false;
  }
}

function csvEscape(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function download(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = el("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadCsv() {
  const d = state.lastResult;
  if (!d) return;
  const sections = d.tables.map((t) => [
    csvEscape(t.title),
    t.columns.map(csvEscape).join(","),
    ...t.rows.map((r) => t.columns.map((c) => csvEscape(r[c])).join(",")),
  ].join("\n"));
  download("analysis-tables.csv", new Blob([sections.join("\n\n")], { type: "text/csv;charset=utf-8" }));
}

function downloadJson() {
  if (!state.lastResult) return;
  download("analysis-report.json",
    new Blob([JSON.stringify(state.lastResult, null, 2)], { type: "application/json" }));
}

function resetAll() {
  $("analyze-form").reset();
  state.file = null;
  $("file-label").textContent = "Choose a file: CSV, XLSX, XLS, or JSON, up to 20 MB";
  $("results").hidden = true;
  state.charts.forEach((c) => c.destroy());
  state.charts = [];
  state.lastResult = null;
  showAlert("");
}

// ---- Wire up the page ----
$("examples").append(...EXAMPLES.map((text) => {
  const b = el("button", text, "chip");
  b.type = "button";
  b.addEventListener("click", () => { $("query").value = text; });
  return b;
}));

$("file-input").addEventListener("change", (e) => {
  const f = e.target.files[0];
  showAlert("");
  if (!f) return;
  const err = validateFile(f);
  if (err) {
    state.file = null;
    e.target.value = "";
    showAlert(err);
    return;
  }
  state.file = f;
  $("file-label").textContent = `${f.name} (${(f.size / 1024).toFixed(1)} KB). Click to change.`;
});

$("analyze-form").addEventListener("submit", analyze);
$("cancel-btn").addEventListener("click", () => state.controller?.abort());
$("clear-btn").addEventListener("click", resetAll);
$("dl-csv").addEventListener("click", downloadCsv);
$("dl-json").addEventListener("click", downloadJson);
$("mail-form").addEventListener("submit", sendReport);
