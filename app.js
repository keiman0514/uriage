const APP_ASSET_VERSION = "20260611-month-review-15";
const APP_BASE_URL = new URL(".", document.currentScript?.src || location.href).href;
let pdfjsLib = globalThis.pdfjsLib || null;
if (pdfjsLib?.getDocument) {
  configurePdfJs(pdfjsLib);
}

const STORAGE_KEY = "nishiogi-sales-dashboard-v1";
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const WEEKDAY_ORDER = ["月", "火", "水", "木", "金", "土", "日"];
const CHART_COLORS = ["#0f7a68", "#b86b00", "#355f7c", "#9a4f17", "#52796f", "#6d5c3f"];
const PDF_SECTION_SPLIT_PATTERN = /(?=売\s*上\s*Ａ|月\s*内\s*仕\s*入|原\s*価|売\s*上\s*利\s*益|経費合計|人件費|水道光熱費|消耗品費|その他\s*4|利\s*益\s*H)/g;
const DEFAULT_STORE_NAME = "ちょもらんま西荻";
const DEFAULT_STORE_KEY = normalizeStoreKey(DEFAULT_STORE_NAME);

let usedEmbeddedSample = false;
let activeMonthKey = "";
let activeStoreKey = "";
let pendingMonthYear = null;
let floatingTable = null;
let floatingTableFrame = 0;
const state = loadState();
if (!state.daily.length && !state.financials.length && window.SALES_DASHBOARD_SAMPLE?.daily?.length) {
  state.daily = window.SALES_DASHBOARD_SAMPLE.daily || [];
  state.financials = window.SALES_DASHBOARD_SAMPLE.financials || [];
  state.events = window.SALES_DASHBOARD_SAMPLE.events || [];
  state.files = window.SALES_DASHBOARD_SAMPLE.files || [];
  usedEmbeddedSample = true;
}
Object.assign(state, normalizeState(state));

const els = {
  dropZone: document.querySelector("#dropZone"),
  fileInput: document.querySelector("#fileInput"),
  restoreInput: document.querySelector("#restoreInput"),
  message: document.querySelector("#message"),
  backupButton: document.querySelector("#backupButton"),
  clearButton: document.querySelector("#clearButton"),
  storeSelect: document.querySelector("#storeSelect"),
  currentStoreBadge: document.querySelector("#currentStoreBadge"),
  yearSelect: document.querySelector("#yearSelect"),
  monthSelect: document.querySelector("#monthSelect"),
  monthApplyButton: document.querySelector("#monthApplyButton"),
  weekendMode: document.querySelector("#weekendMode"),
  holidayAsWeekend: document.querySelector("#holidayAsWeekend"),
  analysisNav: document.querySelector("#analysisNav"),
  viewPanels: document.querySelectorAll("[data-view-panel]"),
  overviewTable: document.querySelector("#overviewTable"),
  monthReviewSelect: document.querySelector("#monthReviewSelect"),
  monthReviewSummary: document.querySelector("#monthReviewSummary"),
  monthReviewYears: document.querySelector("#monthReviewYears"),
  monthReviewRanking: document.querySelector("#monthReviewRanking"),
  monthReviewInsight: document.querySelector("#monthReviewInsight"),
  weekdayMetricSelect: document.querySelector("#weekdayMetricSelect"),
  monthlyChart: document.querySelector("#monthlyChart"),
  monthDetailTitle: document.querySelector("#monthDetailTitle"),
  monthDetailKpis: document.querySelector("#monthDetailKpis"),
  monthDiagnosis: document.querySelector("#monthDiagnosis"),
  monthDetailCompare: document.querySelector("#monthDetailCompare"),
  monthDetailWeekday: document.querySelector("#monthDetailWeekday"),
  monthDetailSegments: document.querySelector("#monthDetailSegments"),
  monthDetailExpenses: document.querySelector("#monthDetailExpenses"),
  monthDetailDaily: document.querySelector("#monthDetailDaily"),
  laborChart: document.querySelector("#laborChart"),
  laborTable: document.querySelector("#laborTable"),
  drinkChart: document.querySelector("#drinkChart"),
  drinkTable: document.querySelector("#drinkTable"),
  lunchDinnerChart: document.querySelector("#lunchDinnerChart"),
  lunchDinnerTable: document.querySelector("#lunchDinnerTable"),
  weekdayChart: document.querySelector("#weekdayChart"),
  weekdayTable: document.querySelector("#weekdayTable"),
  profitChart: document.querySelector("#profitChart"),
  profitTable: document.querySelector("#profitTable"),
  monthlyTable: document.querySelector("#monthlyTable"),
  periodAStart: document.querySelector("#periodAStart"),
  periodAEnd: document.querySelector("#periodAEnd"),
  periodBStart: document.querySelector("#periodBStart"),
  periodBEnd: document.querySelector("#periodBEnd"),
  periodCompare: document.querySelector("#periodCompare"),
  eventForm: document.querySelector("#eventForm"),
  eventName: document.querySelector("#eventName"),
  eventType: document.querySelector("#eventType"),
  eventStart: document.querySelector("#eventStart"),
  eventEnd: document.querySelector("#eventEnd"),
  eventMemo: document.querySelector("#eventMemo"),
  eventImpact: document.querySelector("#eventImpact"),
  insights: document.querySelector("#insights"),
  fileList: document.querySelector("#fileList"),
};

wireEvents();
renderAll();
if (usedEmbeddedSample) {
  setMessage("サンプルデータを表示しています。実データを入れる前の見た目確認用です。");
}

function wireEvents() {
  ["dragenter", "dragover"].forEach((eventName) => {
    els.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      els.dropZone.classList.add("dragging");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    els.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      els.dropZone.classList.remove("dragging");
    });
  });

  els.dropZone.addEventListener("drop", (event) => {
    handleFiles([...event.dataTransfer.files]);
  });

  els.fileInput.addEventListener("change", (event) => {
    handleFiles([...event.target.files]);
    event.target.value = "";
  });

  els.restoreInput.addEventListener("change", async (event) => {
    const [file] = [...event.target.files];
    if (!file) return;
    try {
      await restoreBackup(file);
    } catch (error) {
      console.error(error);
      setMessage(`バックアップを読み込めませんでした。${error.message}`, true);
    }
    event.target.value = "";
  });

  els.backupButton.addEventListener("click", downloadBackup);

  els.clearButton.addEventListener("click", () => {
    if (!confirm("登録済みデータをすべて削除しますか？")) return;
    state.daily = [];
    state.financials = [];
    state.events = [];
    state.files = [];
    saveState();
    renderAll();
    setMessage("すべて削除しました。");
  });

  els.storeSelect?.addEventListener("change", () => {
    activeStoreKey = els.storeSelect.value;
    activeMonthKey = "";
    pendingMonthYear = null;
    renderAll();
    setActiveView("month");
  });

  els.analysisNav.addEventListener("click", (event) => {
    const button = event.target.closest("[data-view]");
    if (!button) return;
    setActiveView(button.dataset.view);
  });

  window.addEventListener("scroll", requestFloatingTableUpdate, { passive: true });
  window.addEventListener("resize", requestFloatingTableUpdate, { passive: true });
  document.addEventListener("scroll", (event) => {
    if (event.target?.classList?.contains("table-wrap")) requestFloatingTableUpdate();
  }, true);

  els.yearSelect.addEventListener("change", () => {
    pendingMonthYear = Number(els.yearSelect.value);
    activeMonthKey = "";
    renderAll();
    setActiveView("month");
  });

  els.monthApplyButton.addEventListener("click", () => {
    activeMonthKey = els.monthSelect.value;
    renderAll();
    setActiveView("month");
  });

  [
    els.weekendMode,
    els.holidayAsWeekend,
    els.monthReviewSelect,
    els.weekdayMetricSelect,
    els.periodAStart,
    els.periodAEnd,
    els.periodBStart,
    els.periodBEnd,
  ]
    .filter(Boolean)
    .forEach((element) => {
      element.addEventListener("change", renderAll);
    });

  els.eventForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const item = {
      id: crypto.randomUUID(),
      storeKey: getActiveStoreKey(),
      storeName: getActiveStoreName(),
      name: els.eventName.value.trim(),
      type: els.eventType.value,
      start: els.eventStart.value,
      end: els.eventEnd.value,
      memo: els.eventMemo.value.trim(),
      createdAt: new Date().toISOString(),
    };
    if (!item.name || !item.start || !item.end) return;
    if (item.start > item.end) {
      setMessage("キャンペーンの終了日は開始日以降にしてください。", true);
      return;
    }
    state.events.push(item);
    saveState();
    els.eventForm.reset();
    renderAll();
    setMessage("キャンペーンを追加しました。");
  });
}

function setActiveView(viewName) {
  els.analysisNav.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });
  els.viewPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.viewPanel === viewName);
  });
  requestFloatingTableUpdate();
}

async function handleFiles(files) {
  if (!files.length) return;
  const result = { excel: 0, pdf: 0, json: 0, errors: [] };
  setMessage(`${files.length}件を読み込み中です...`);

  for (const file of files) {
    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".json")) {
        await restoreBackup(file);
        result.json += 1;
      } else if (lower.endsWith(".xlsm") || lower.endsWith(".xlsx")) {
        const rows = await parseSalesWorkbook(file);
        replaceSource(file.name, "excel", { daily: rows });
        result.excel += 1;
      } else if (lower.endsWith(".pdf")) {
        const financial = await parseFinancialPdf(file);
        replaceSource(file.name, "pdf", { financials: [financial] });
        result.pdf += 1;
      } else {
        result.errors.push(`${file.name}: 未対応の形式です`);
      }
    } catch (error) {
      console.error(error);
      result.errors.push(`${file.name}: ${error.message}`);
    }
  }

  saveState();
  renderAll();

  const ok = [
    result.excel ? `Excel ${result.excel}件` : "",
    result.pdf ? `PDF ${result.pdf}件` : "",
    result.json ? `バックアップ ${result.json}件` : "",
  ].filter(Boolean);
  const message = ok.length ? `${ok.join("、")}を読み込みました。` : "読み込めるファイルがありませんでした。";
  setMessage(result.errors.length ? `${message} ${result.errors.join(" / ")}` : message, result.errors.length > 0);
}

function replaceSource(sourceName, type, payload) {
  state.daily = state.daily.filter((row) => row.sourceName !== sourceName);
  state.financials = state.financials.filter((row) => row.sourceName !== sourceName);
  state.files = state.files.filter((row) => row.name !== sourceName);

  const daily = payload.daily || [];
  const financials = payload.financials || [];
  const store = daily[0] || financials[0] || parseStoreFromName(sourceName);
  state.daily.push(...daily);
  state.financials.push(...financials);
  state.files.push({
    name: sourceName,
    type,
    storeKey: store.storeKey,
    storeName: store.storeName,
    importedAt: new Date().toISOString(),
    dailyRows: daily.length,
    financialRows: financials.length,
  });
}

async function parseSalesWorkbook(file) {
  const monthInfo = parseMonthFromName(file.name, "excel");
  const store = parseStoreFromName(file.name);
  const zip = await window.JSZip.loadAsync(file);
  const workbookXml = await readZipText(zip, "xl/workbook.xml");
  const relsXml = await readZipText(zip, "xl/_rels/workbook.xml.rels");
  const sharedStrings = await readSharedStrings(zip);
  const sheetPath = findSheetPath(workbookXml, relsXml, "入力");
  if (!sheetPath) throw new Error("入力シートが見つかりません");
  const sheetXml = await readZipText(zip, sheetPath);
  const rows = parseSheetRows(sheetXml, sharedStrings);
  const daily = [];

  for (const [rowNumber, cells] of rows.entries()) {
    if (rowNumber < 5) continue;
    const day = toNumber(cells.get("E"));
    if (!Number.isInteger(day) || day < 1 || day > 31) continue;

    const date = makeDate(monthInfo.year, monthInfo.month, day);
    if (!date || date.getMonth() !== monthInfo.month - 1) continue;

    const sales = toNumber(cells.get("P")) || toNumber(cells.get("K"));
    const customers = toNumber(cells.get("Q")) || toNumber(cells.get("L"));
    const lunch = toNumber(cells.get("H"));
    const lunchCustomers = toNumber(cells.get("I"));
    const dinner = toNumber(cells.get("J"));
    const dinnerCustomers = toNumber(cells.get("M"));
    const midnight = toNumber(cells.get("N"));
    const midnightCustomers = toNumber(cells.get("O"));
    const drink = toNumber(cells.get("R"));
    const uber = toNumber(cells.get("S"));
    if (!sales && !customers && !lunch && !drink && !uber) continue;

    const holiday = getJapanHoliday(date);
    const actualWeekday = WEEKDAYS[date.getDay()];
    daily.push({
      id: `${file.name}:${formatDate(date)}`,
      sourceName: file.name,
      sourceType: "excel",
      storeKey: store.storeKey,
      storeName: store.storeName,
      date: formatDate(date),
      key: `${monthInfo.year}-${pad2(monthInfo.month)}`,
      year: monthInfo.year,
      month: monthInfo.month,
      day,
      weekday: actualWeekday,
      fileWeekday: text(cells.get("F")),
      weather: text(cells.get("G")),
      isHoliday: Boolean(holiday),
      holidayName: holiday || "",
      dayClass: classifyDay(date, holiday),
      sales,
      customers,
      lunch,
      lunchCustomers,
      dinner,
      dinnerCustomers,
      midnight,
      midnightCustomers,
      drink,
      uber,
    });
  }

  if (!daily.length) throw new Error("日別データを読み取れませんでした");
  return daily;
}

async function parseFinancialPdf(file) {
  const pdfModule = await ensurePdfJs();
  const monthInfo = parseMonthFromName(file.name, "pdf");
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfModule.getDocument({
    data: arrayBuffer,
    disableWorker: location.protocol === "file:",
  }).promise;
  const lines = [];
  const pageTexts = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const text = textContent.items.map((item) => item.str).join(" ").replace(/\s+/g, " ").trim();
    pageTexts.push(text);
    lines.push(...text.split(PDF_SECTION_SPLIT_PATTERN));
  }
  const store = parseStoreFromText(`${file.name} ${pageTexts.join(" ")}`);

  const compactLines = lines.map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const pick = (pattern) => {
    const line = compactLines.find((item) => pattern.test(item));
    return line ? extractAmounts(line) : [];
  };

  const sales = pick(/^売\s*上\s*Ａ/);
  const purchase = pick(/^月\s*内\s*仕\s*入/);
  const cost = pick(/^原\s*価/);
  const grossProfit = pick(/^売\s*上\s*利\s*益/);
  const expenses = pick(/^経費合計/);
  const laborCost = pick(/^人件費/);
  const utilities = pick(/^水道光熱費/);
  const supplies = pick(/^消耗品費/);
  const otherExpenses = pick(/^その他\s*4/);
  const profit = pick(/^利\s*益\s*H/);

  if (!sales.length || !profit.length) throw new Error("PDFの売上・利益を読み取れませんでした");

  return {
    id: `${file.name}:${monthInfo.year}-${pad2(monthInfo.month)}`,
    sourceName: file.name,
    sourceType: "pdf",
    storeKey: store.storeKey,
    storeName: store.storeName,
    key: `${monthInfo.year}-${pad2(monthInfo.month)}`,
    year: monthInfo.year,
    month: monthInfo.month,
    sales: sales[0] ?? null,
    salesPreviousMonth: sales[1] ?? null,
    salesCumulative: sales[2] ?? null,
    salesPriorYear: sales[3] ?? null,
    purchase: purchase[0] ?? null,
    cost: cost[0] ?? null,
    grossProfit: grossProfit[0] ?? null,
    expenses: expenses[0] ?? null,
    laborCost: laborCost[0] ?? null,
    utilities: utilities[0] ?? null,
    supplies: supplies[0] ?? null,
    otherExpenses: otherExpenses[0] ?? null,
    profit: profit[0] ?? null,
    profitPreviousMonth: profit[1] ?? null,
    profitCumulative: profit[2] ?? null,
    profitPriorYear: profit[3] ?? null,
  };
}

async function ensurePdfJs() {
  if (pdfjsLib?.getDocument) {
    configurePdfJs(pdfjsLib);
    return pdfjsLib;
  }

  try {
    const pdfUrl = new URL(`vendor/pdf.min.mjs?v=${APP_ASSET_VERSION}`, APP_BASE_URL).href;
    pdfjsLib = await import(pdfUrl);
    globalThis.pdfjsLib = pdfjsLib;
    configurePdfJs(pdfjsLib);
    return pdfjsLib;
  } catch (error) {
    console.error(error);
    throw new Error(`PDF読み込み部品を読み込めません: ${error.message}`);
  }
}

function configurePdfJs(pdfModule) {
  if (pdfModule?.GlobalWorkerOptions) {
    pdfModule.GlobalWorkerOptions.workerSrc = new URL(`vendor/pdf.worker.min.mjs?v=${APP_ASSET_VERSION}`, APP_BASE_URL).href;
  }
}

function parseStoreFromName(name) {
  return parseStoreFromText(name);
}

function parseStoreFromText(value) {
  const normalized = String(value || "").normalize("NFKC").replace(/\s+/g, " ").trim();
  const compact = normalizeName(normalized);
  if (compact.includes("西荻")) return makeStoreInfo(DEFAULT_STORE_NAME);

  const excelMatch = normalized.match(/([^\s\d年月._\-\/]+?)\s*営業日報/);
  if (excelMatch) {
    const location = cleanStoreLocation(excelMatch[1]);
    if (location) return makeStoreInfo(`ちょもらんま${location}`);
  }

  const brandMatch = normalized.match(/ちょもらんま(?:酒場)?\s*([^\s\d年月._\-\/]{1,16})?/);
  if (brandMatch) {
    const location = cleanStoreLocation(brandMatch[1] || "");
    if (location) return makeStoreInfo(`ちょもらんま${location}`);
    return makeStoreInfo("ちょもらんま");
  }

  return makeStoreInfo(DEFAULT_STORE_NAME);
}

function cleanStoreLocation(value) {
  return normalizeName(value)
    .replace(/^ちょもらんま/, "")
    .replace(/^酒場/, "")
    .replace(/営業.*$/, "")
    .replace(/報告.*$/, "")
    .replace(/日報.*$/, "")
    .replace(/店$/, "");
}

function makeStoreInfo(value) {
  const compact = normalizeName(value || DEFAULT_STORE_NAME).replace(/^ちょもらんま酒場/, "ちょもらんま");
  const storeName = compact.includes("西荻") ? DEFAULT_STORE_NAME : compact || DEFAULT_STORE_NAME;
  return {
    storeKey: normalizeStoreKey(storeName),
    storeName,
  };
}

function normalizeStoreKey(value) {
  return normalizeName(value || DEFAULT_STORE_NAME).replace(/酒場/g, "").toLowerCase();
}

function normalizeFileNameForMonth(value) {
  return String(value)
    .normalize("NFKC")
    .replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xff10))
    .replace(/[．。]/g, ".")
    .replace(/[／]/g, "/")
    .replace(/[＿]/g, "_")
    .replace(/[‐‑‒–—―－ー−]/g, "-")
    .replace(/[　]/g, " ");
}

function parseMonthFromName(name, type) {
  const normalized = normalizeFileNameForMonth(name);
  const patterns = [
    /(20\d{2})\s*年\s*(?:度\s*)?(\d{1,2})\s*月/,
    /(20\d{2})\s*[._\-\/\s]\s*(\d{1,2})(?!\d)/,
    /(20\d{2})\D{1,20}(0?[1-9]|1[0-2])(?=\D|$)/,
    /(20\d{2})(0[1-9]|1[0-2])/,
    /(20\d{2})([1-9])(?=\D|$)/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month >= 1 && month <= 12) return { year, month };
  }

  throw new Error(`${type === "pdf" ? "PDF" : "Excel"}のファイル名から年月を読めません`);
}

async function readZipText(zip, path) {
  const file = zip.file(path);
  if (!file) throw new Error(`${path} が見つかりません`);
  return file.async("string");
}

async function readSharedStrings(zip) {
  const file = zip.file("xl/sharedStrings.xml");
  if (!file) return [];
  const doc = parseXml(await file.async("string"));
  return [...doc.getElementsByTagName("si")].map((node) => node.textContent || "");
}

function findSheetPath(workbookXml, relsXml, sheetName) {
  const workbook = parseXml(workbookXml);
  const rels = parseXml(relsXml);
  const relMap = new Map();
  for (const rel of rels.getElementsByTagName("Relationship")) {
    const id = rel.getAttribute("Id");
    const target = rel.getAttribute("Target");
    if (!id || !target) continue;
    relMap.set(id, target.startsWith("/") ? target.slice(1) : target.startsWith("xl/") ? target : `xl/${target}`);
  }

  const sheets = [...workbook.getElementsByTagName("sheet")];
  const sheet = sheets.find((item) => normalizeName(item.getAttribute("name")) === normalizeName(sheetName));
  if (!sheet) return null;
  const relId = sheet.getAttribute("r:id") || sheet.getAttribute("id");
  return relMap.get(relId) || null;
}

function parseSheetRows(sheetXml, sharedStrings) {
  const doc = parseXml(sheetXml);
  const rows = new Map();
  for (const cell of doc.getElementsByTagName("c")) {
    const ref = cell.getAttribute("r");
    if (!ref) continue;
    const match = ref.match(/^([A-Z]+)(\d+)$/);
    if (!match) continue;
    const [, column, rowString] = match;
    const rowNumber = Number(rowString);
    if (!rows.has(rowNumber)) rows.set(rowNumber, new Map());
    rows.get(rowNumber).set(column, parseCellValue(cell, sharedStrings));
  }
  return rows;
}

function parseCellValue(cell, sharedStrings) {
  const type = cell.getAttribute("t");
  if (type === "inlineStr") return cell.textContent || "";
  const valueNode = cell.getElementsByTagName("v")[0];
  const raw = valueNode ? valueNode.textContent : "";
  if (type === "s") return sharedStrings[Number(raw)] || "";
  if (type === "b") return raw === "1";
  if (type === "str") return raw;
  if (raw === "") return "";
  const number = Number(raw);
  return Number.isFinite(number) ? number : raw;
}

function parseXml(xml) {
  return new DOMParser().parseFromString(xml, "application/xml");
}

function extractAmounts(line) {
  const matches = line.match(/△\s*\d{1,3}(?:,\d{3})+|\d{1,3}(?:,\d{3})+/g) || [];
  return matches.map((item) => {
    const negative = item.includes("△");
    const value = Number(item.replace(/[△,\s]/g, ""));
    return negative ? -value : value;
  });
}

function getStoreOptions() {
  const map = new Map();
  for (const item of [...state.daily, ...state.financials, ...state.files]) {
    const store = item.storeName || item.storeKey ? makeStoreInfo(item.storeName || item.storeKey) : parseStoreFromName(item.sourceName || item.name || "");
    map.set(store.storeKey, store.storeName);
  }
  if (!map.size) map.set(DEFAULT_STORE_KEY, DEFAULT_STORE_NAME);
  return [...map.entries()]
    .map(([storeKey, storeName]) => ({ storeKey, storeName }))
    .sort((a, b) => a.storeName.localeCompare(b.storeName, "ja"));
}

function renderStoreOptions() {
  const stores = getStoreOptions();
  if (!stores.some((store) => store.storeKey === activeStoreKey)) {
    activeStoreKey = stores[0]?.storeKey || DEFAULT_STORE_KEY;
  }
  if (els.storeSelect) {
    els.storeSelect.innerHTML = stores.map((store) => `<option value="${escapeHtml(store.storeKey)}">${escapeHtml(store.storeName)}</option>`).join("");
    els.storeSelect.value = activeStoreKey;
  }
  if (els.currentStoreBadge) {
    els.currentStoreBadge.textContent = `表示店舗: ${getActiveStoreName()}`;
  }
}

function getActiveStoreKey() {
  return activeStoreKey || els.storeSelect?.value || DEFAULT_STORE_KEY;
}

function getActiveStoreName() {
  const key = getActiveStoreKey();
  return getStoreOptions().find((store) => store.storeKey === key)?.storeName || DEFAULT_STORE_NAME;
}

function isActiveStoreItem(item) {
  return (item.storeKey || DEFAULT_STORE_KEY) === getActiveStoreKey();
}

function activeDailyRows() {
  return state.daily.filter(isActiveStoreItem);
}

function activeFinancialRows() {
  return state.financials.filter(isActiveStoreItem);
}

function renderAll() {
  renderStoreOptions();
  const monthly = buildMonthly();
  renderYearOptions(monthly);
  renderMonthOptions(monthly);
  setDefaultPeriods(monthly);
  renderOverviewTable(monthly);
  renderMonthDetail(monthly);
  renderMonthReview(monthly);
  renderMonthlyChart(monthly);
  renderLaborView(monthly);
  renderDrinkView(monthly);
  renderLunchDinnerView(monthly);
  renderWeekdayChart();
  renderWeekdayTable();
  renderProfitView(monthly);
  renderPeriodCompare();
  renderEventImpact();
  renderInsights(monthly);
  renderFileList();
  renderMonthlyTable(monthly);
  requestFloatingTableUpdate();
}

function buildMonthly() {
  const dailyRows = activeDailyRows();
  const financialRows = activeFinancialRows();
  const dailyByMonth = groupBy(dailyRows, (row) => row.key);
  const financialByMonth = new Map(financialRows.map((item) => [item.key, item]));
  const keys = [...new Set([...dailyByMonth.keys(), ...financialByMonth.keys()])].sort();
  const monthly = keys.map((key) => {
    const rows = dailyByMonth.get(key) || [];
    const daily = aggregateDaily(rows);
    const financial = financialByMonth.get(key) || {};
    const [year, month] = key.split("-").map(Number);
    const sales = financial.sales ?? daily.sales;
    const customers = daily.customers;
    return {
      key,
      year,
      month,
      label: `${year}/${pad2(month)}`,
      days: daily.days,
      sales,
      dailySales: daily.sales,
      customers,
      unit: customers ? sales / customers : null,
      lunch: daily.lunch,
      lunchCustomers: daily.lunchCustomers,
      dinner: daily.dinner,
      dinnerCustomers: daily.dinnerCustomers,
      drink: daily.drink,
      drinkRatio: sales ? daily.drink / sales : null,
      uber: daily.uber,
      uberRatio: sales ? daily.uber / sales : null,
      holidayDays: daily.holidayDays,
      weekendDays: daily.weekendDays,
      businessDays: daily.businessDays,
      profit: financial.profit ?? null,
      cost: financial.cost ?? null,
      expenses: financial.expenses ?? null,
      laborCost: financial.laborCost ?? null,
      grossProfit: financial.grossProfit ?? null,
      financial,
    };
  });

  const byKey = new Map(monthly.map((item) => [item.key, item]));
  for (const item of monthly) {
    const previousYear = byKey.get(`${item.year - 1}-${pad2(item.month)}`);
    item.yoy = {
      sales: pctChange(item.sales, previousYear?.sales),
      customers: pctChange(item.customers, previousYear?.customers),
      unit: pctChange(item.unit, previousYear?.unit),
      drink: pctChange(item.drink, previousYear?.drink),
      profit: pctChange(item.profit, previousYear?.profit),
    };
  }
  return monthly;
}

function aggregateDaily(rows) {
  const base = {
    days: rows.length,
    sales: 0,
    customers: 0,
    lunch: 0,
    lunchCustomers: 0,
    dinner: 0,
    dinnerCustomers: 0,
    midnight: 0,
    midnightCustomers: 0,
    drink: 0,
    uber: 0,
    holidayDays: 0,
    weekendDays: 0,
    businessDays: 0,
  };
  for (const row of rows) {
    base.sales += row.sales || 0;
    base.customers += row.customers || 0;
    base.lunch += row.lunch || 0;
    base.lunchCustomers += row.lunchCustomers || 0;
    base.dinner += row.dinner || 0;
    base.dinnerCustomers += row.dinnerCustomers || 0;
    base.midnight += row.midnight || 0;
    base.midnightCustomers += row.midnightCustomers || 0;
    base.drink += row.drink || 0;
    base.uber += row.uber || 0;
    if (row.isHoliday) base.holidayDays += 1;
    if (isWeekendLike(row)) base.weekendDays += 1;
    else base.businessDays += 1;
  }
  return base;
}

function renderYearOptions(monthly) {
  const years = [...new Set([...monthly.map((item) => item.year), ...activeDailyRows().map((item) => item.year)])].sort((a, b) => b - a);
  const current = Number(els.yearSelect.value) || years[0] || new Date().getFullYear();
  els.yearSelect.innerHTML = years.map((year) => `<option value="${year}">${year}年</option>`).join("");
  if (years.includes(current)) els.yearSelect.value = String(current);
}

function renderMonthOptions(monthly) {
  const months = monthly
    .filter((item) => item.sales || item.customers || item.profit !== null)
    .slice()
    .sort((a, b) => b.key.localeCompare(a.key));
  els.monthSelect.innerHTML = months.map((item) => `<option value="${item.key}">${item.year}年${item.month}月</option>`).join("");
  let nextKey = activeMonthKey || els.monthSelect.value;
  if (pendingMonthYear) {
    const newestForYear = months.find((item) => item.year === pendingMonthYear);
    if (newestForYear) nextKey = newestForYear.key;
    pendingMonthYear = null;
  }
  if (!months.some((item) => item.key === nextKey)) {
    nextKey = months[0]?.key || "";
  }
  els.monthSelect.value = nextKey;
  activeMonthKey = nextKey;
}

function renderOverviewTable(allMonthlyRows) {
  const rows = allMonthlyRows
    .filter((item) => item.sales || item.laborCost || item.cost || item.profit !== null)
    .slice()
    .sort((a, b) => a.key.localeCompare(b.key));
  if (!rows.length) {
    els.overviewTable.innerHTML = empty("一覧表示できるデータがありません。");
    return;
  }

  els.overviewTable.innerHTML = table(
    ["月", "売上", "前月比", "前年比", "人件費", "人件費率", "前月比", "前年比", "原価", "原価率", "前月比", "前年比", "利益", "前月差", "前年差"],
    rows.map((item) => {
      const previousMonth = allMonthlyRows.find((target) => target.key === previousMonthKey(item.key));
      const previousYear = allMonthlyRows.find((target) => target.year === item.year - 1 && target.month === item.month);
      const laborRatio = div(item.laborCost, item.sales);
      const previousMonthLaborRatio = div(previousMonth?.laborCost, previousMonth?.sales);
      const previousYearLaborRatio = div(previousYear?.laborCost, previousYear?.sales);
      const costRatio = div(item.cost, item.sales);
      const previousMonthCostRatio = div(previousMonth?.cost, previousMonth?.sales);
      const previousYearCostRatio = div(previousYear?.cost, previousYear?.sales);
      return [
        item.label,
        yen(item.sales),
        marker(pctChange(item.sales, previousMonth?.sales)),
        marker(pctChange(item.sales, previousYear?.sales)),
        yen(item.laborCost),
        percent(laborRatio),
        markerPoint(diffNumber(laborRatio, previousMonthLaborRatio), true),
        markerPoint(diffNumber(laborRatio, previousYearLaborRatio), true),
        yen(item.cost),
        percent(costRatio),
        markerPoint(diffNumber(costRatio, previousMonthCostRatio), true),
        markerPoint(diffNumber(costRatio, previousYearCostRatio), true),
        profitYen(item.profit),
        markerYen(diffNumber(item.profit, previousMonth?.profit)),
        markerYen(diffNumber(item.profit, previousYear?.profit)),
      ];
    }),
  );
}

function renderMonthDetail(monthly) {
  const selectedKey = activeMonthKey || els.monthSelect.value;
  const item = monthly.find((row) => row.key === selectedKey);
  if (!item) {
    els.monthDetailTitle.textContent = "月別詳細";
    els.monthDetailKpis.innerHTML = empty("対象月を選んでください。");
    els.monthDiagnosis.innerHTML = empty("対象月を選ぶと、具体的な打ち手が表示されます。");
    els.monthDetailCompare.innerHTML = empty("対象月のデータがありません。");
    els.monthDetailWeekday.innerHTML = empty("対象月のデータがありません。");
    els.monthDetailSegments.innerHTML = empty("対象月のデータがありません。");
    els.monthDetailExpenses.innerHTML = empty("対象月のデータがありません。");
    els.monthDetailDaily.innerHTML = empty("対象月のデータがありません。");
    return;
  }

  const storeDaily = activeDailyRows();
  const rows = storeDaily.filter((row) => row.key === item.key).sort((a, b) => a.date.localeCompare(b.date));
  const previous = monthly.find((row) => row.year === item.year - 1 && row.month === item.month);
  const previousMonth = monthly.find((row) => row.key === previousMonthKey(item.key));
  const currentMetrics = monthMetricSet(item, rows);
  const previousMetrics = previous ? monthMetricSet(previous, storeDaily.filter((row) => row.key === previous.key)) : {};
  const previousMonthMetrics = previousMonth ? monthMetricSet(previousMonth, storeDaily.filter((row) => row.key === previousMonth.key)) : {};
  const hasDailyExcel = rows.length > 0;
  els.monthDetailTitle.textContent = `${getActiveStoreName()} ${item.year}年${item.month}月の状態`;
  els.monthDetailKpis.innerHTML = [
    ["売上", yen(item.sales), marker(item.yoy.sales, "前年比"), tone(item.yoy.sales)],
    ["客数", hasDailyExcel ? `${integer(item.customers)}人` : "-", hasDailyExcel ? marker(item.yoy.customers, "前年比") : "営業日報Excel未登録", hasDailyExcel ? tone(item.yoy.customers) : "warn"],
    ["客単価", hasDailyExcel ? yen(item.unit) : "-", hasDailyExcel ? marker(item.yoy.unit, "前年比") : "営業日報Excel未登録", hasDailyExcel ? tone(item.yoy.unit) : "warn"],
    ["ドリンク率", hasDailyExcel ? percent(item.drinkRatio) : "-", hasDailyExcel ? `ドリンク ${yen(item.drink)}` : "営業日報Excel未登録", hasDailyExcel ? "" : "warn"],
    ["人件費率", percent(currentMetrics.laborRatio), `人件費 ${yen(item.laborCost)}`, ""],
    ["原価率", percent(currentMetrics.costRatio), `原価 ${yen(item.cost)}`, ""],
    ["利益", profitYen(item.profit), item.profit === null ? "PDF未登録" : item.profit >= 0 ? "黒字" : "赤字", item.profit === null ? "warn" : item.profit >= 0 ? "good" : "bad"],
  ]
    .map(
      ([label, value, sub, className]) => `
        <article class="kpi-card">
          <p class="kpi-label">${label}</p>
          <p class="kpi-value ${className || ""}">${value}</p>
          <p class="kpi-sub">${sub}</p>
        </article>
      `,
    )
    .join("");

  renderMonthDiagnosis(item, rows, previous, previousMonth);

  els.monthDetailCompare.innerHTML = table(
    ["指標", `${item.year}年${item.month}月`, "前年比", "前月比"],
    [
      metricCompareRow("売上", currentMetrics.sales, previousMetrics.sales, previousMonthMetrics.sales, "yen"),
      metricCompareRow("1日平均", currentMetrics.avgDailySales, previousMetrics.avgDailySales, previousMonthMetrics.avgDailySales, "yen", !hasDailyExcel),
      metricCompareRow("平日ランチ平均", currentMetrics.weekdayLunchAverage, previousMetrics.weekdayLunchAverage, previousMonthMetrics.weekdayLunchAverage, "yen", !hasDailyExcel),
      metricCompareRow("ディナー平均", currentMetrics.dinnerAverage, previousMetrics.dinnerAverage, previousMonthMetrics.dinnerAverage, "yen", !hasDailyExcel),
      metricCompareRow("週末平均", currentMetrics.weekendAverage, previousMetrics.weekendAverage, previousMonthMetrics.weekendAverage, "yen", !hasDailyExcel),
      metricCompareRow("ドリンク比率", currentMetrics.drinkRatio, previousMetrics.drinkRatio, previousMonthMetrics.drinkRatio, "ratio", !hasDailyExcel),
      metricCompareRow("人件費率", currentMetrics.laborRatio, previousMetrics.laborRatio, previousMonthMetrics.laborRatio, "ratio", false, true),
      metricCompareRow("原価率", currentMetrics.costRatio, previousMetrics.costRatio, previousMonthMetrics.costRatio, "ratio", false, true),
      metricCompareRow("利益", currentMetrics.profit, previousMetrics.profit, previousMonthMetrics.profit, "yenDiff"),
    ],
  );

  if (!hasDailyExcel) {
    const message = empty(`${item.year}年${item.month}月はPDFだけ登録されています。客数・客単価・ドリンク・ランチ/ディナーを見るには、この月の営業日報Excelを追加してください。`);
    els.monthDetailWeekday.innerHTML = message;
    els.monthDetailSegments.innerHTML = message;
    renderMonthExpenseBreakdown(item);
    els.monthDetailDaily.innerHTML = message;
    return;
  }

  const weekdayGrouped = groupBy(rows, (row) => row.weekday);
  els.monthDetailWeekday.innerHTML = table(
    ["曜日", "日数", "1日平均売上", "ランチ平均", "ディナー平均", "平均客数", "客単価", "ドリンク率"],
    WEEKDAY_ORDER.map((weekday) => {
      const agg = aggregateDaily(weekdayGrouped.get(weekday) || []);
      return [
        weekday,
        integer(agg.days),
        yen(div(agg.sales, agg.days)),
        yen(div(agg.lunch, agg.days)),
        yen(div(agg.dinner, agg.days)),
        `${integer(div(agg.customers, agg.days))}人`,
        yen(div(agg.sales, agg.customers)),
        percent(div(agg.drink, agg.sales)),
      ];
    }),
  );

  const segmentRows = [
    ["平日", rows.filter((row) => !isWeekendLike(row) && !row.isHoliday)],
    ["週末扱い", rows.filter((row) => isWeekendLike(row))],
    ["祝日", rows.filter((row) => row.isHoliday)],
    ["金土日", rows.filter((row) => ["金", "土", "日"].includes(row.weekday))],
  ];
  els.monthDetailSegments.innerHTML = table(
    ["区分", "日数", "1日平均売上", "ランチ平均", "ディナー平均", "平均客数", "客単価", "ドリンク率"],
    segmentRows.map(([label, segment]) => {
      const agg = aggregateDaily(segment);
      return [
        label,
        integer(agg.days),
        yen(div(agg.sales, agg.days)),
        yen(div(agg.lunch, agg.days)),
        yen(div(agg.dinner, agg.days)),
        `${integer(div(agg.customers, agg.days))}人`,
        yen(div(agg.sales, agg.customers)),
        percent(div(agg.drink, agg.sales)),
      ];
    }),
  );

  renderMonthExpenseBreakdown(item);

  els.monthDetailDaily.innerHTML = table(
    ["日付", "曜日", "天気", "売上", "客数", "客単価", "ランチ", "ディナー", "ドリンク率"],
    rows.map((row) => [
      row.date,
      `${row.weekday}${row.isHoliday ? `・${escapeHtml(row.holidayName)}` : ""}`,
      escapeHtml(row.weather || "-"),
      yen(row.sales),
      `${integer(row.customers)}人`,
      yen(div(row.sales, row.customers)),
      yen(row.lunch),
      yen(row.dinner),
      percent(div(row.drink, row.sales)),
    ]),
  );
}

function compareRow(label, current, previous, type) {
  const diff = type === "ratio" ? diffNumber(current, previous) : pctChange(current, previous);
  return [
    label,
    formatByType(current, type),
    formatByType(previous, type),
    type === "ratio" ? markerPoint(diff) : marker(diff),
  ];
}

function metricCompareRow(label, current, previousYear, previousMonth, type, missing = false, invert = false) {
  if (missing) {
    return [label, "営業日報Excel未登録", "-", "-"];
  }
  if (type === "yenDiff") {
    return [
      label,
      yen(current),
      markerYen(diffNumber(current, previousYear)),
      markerYen(diffNumber(current, previousMonth)),
    ];
  }
  return [
    label,
    formatByType(current, type),
    type === "ratio" ? markerPoint(diffNumber(current, previousYear), invert) : marker(pctChange(current, previousYear)),
    type === "ratio" ? markerPoint(diffNumber(current, previousMonth), invert) : marker(pctChange(current, previousMonth)),
  ];
}

function monthMetricSet(item, rows = []) {
  const agg = aggregateDaily(rows);
  const businessRows = rows.filter((row) => !isWeekendLike(row) && !row.isHoliday);
  const weekendRows = rows.filter((row) => isWeekendLike(row));
  const business = aggregateDaily(businessRows);
  const weekend = aggregateDaily(weekendRows);
  return {
    sales: item.sales,
    avgDailySales: agg.days ? item.sales / agg.days : null,
    weekdayLunchAverage: business.days ? business.lunch / business.days : null,
    dinnerAverage: agg.days ? agg.dinner / agg.days : null,
    weekendAverage: weekend.days ? weekend.sales / weekend.days : null,
    drinkRatio: item.drinkRatio,
    laborRatio: div(item.laborCost, item.sales),
    costRatio: div(item.cost, item.sales),
    profit: item.profit,
  };
}

function previousMonthKey(key) {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(year, month - 2, 1);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

function renderMonthReview(monthly) {
  if (!els.monthReviewSelect) return;
  renderMonthReviewSelect(monthly);
  if (!monthly.length) {
    els.monthReviewSummary.innerHTML = empty("月別比較できるデータがありません。");
    els.monthReviewYears.innerHTML = empty("データを読み込むと、選んだ月の過去年比較が出ます。");
    els.monthReviewRanking.innerHTML = empty("データを読み込むと、12か月の強弱が出ます。");
    els.monthReviewInsight.innerHTML = empty("データを読み込むと、月別の見立てが出ます。");
    return;
  }

  const selectedMonth = Number(els.monthReviewSelect.value) || new Date().getMonth() + 1;
  const selectedRows = monthly
    .filter((item) => item.month === selectedMonth && (Number.isFinite(item.sales) || Number.isFinite(item.profit)))
    .sort((a, b) => a.year - b.year);
  const ranking = buildMonthSeasonality(monthly);
  const selectedRank = ranking.findIndex((item) => item.month === selectedMonth);

  if (!selectedRows.length) {
    els.monthReviewSummary.innerHTML = empty(`${selectedMonth}月のデータがありません。`);
    els.monthReviewYears.innerHTML = empty(`${selectedMonth}月の過去年データがありません。`);
    els.monthReviewRanking.innerHTML = renderMonthRankingTable(ranking);
    els.monthReviewInsight.innerHTML = empty("対象月のデータが増えると、見立てが出ます。");
    return;
  }

  const salesRows = selectedRows.filter((item) => Number.isFinite(item.sales));
  const profitRows = selectedRows.filter((item) => Number.isFinite(item.profit));
  const latest = selectedRows[selectedRows.length - 1];
  const previous = selectedRows[selectedRows.length - 2];
  const bestSales = salesRows.length ? maxBy(salesRows, (item) => item.sales) : null;
  const worstSales = salesRows.length ? minBy(salesRows, (item) => item.sales) : null;
  const bestProfit = profitRows.length ? maxBy(profitRows, (item) => item.profit) : null;
  const averageSales = averageNumber(selectedRows.map((item) => item.sales));
  const averageProfit = averageNumber(selectedRows.map((item) => item.profit));

  els.monthReviewSummary.innerHTML = [
    ["対象月", `${selectedMonth}月`, `${selectedRows.length}年分のデータ`, ""],
    ["平均売上", yen(averageSales), bestSales ? `最高 ${bestSales.year}年 ${yen(bestSales.sales)}` : "-", ""],
    ["平均利益", profitYen(averageProfit), bestProfit ? `最高 ${bestProfit.year}年 ${yen(bestProfit.profit)}` : "-", Number.isFinite(averageProfit) ? (averageProfit >= 0 ? "good" : "bad") : "warn"],
    ["最新年", `${latest.year}年`, `${yen(latest.sales)} / 利益 ${profitYen(latest.profit)}`, tone(pctChange(latest.sales, previous?.sales))],
    ["月別順位", selectedRank >= 0 ? `${selectedRank + 1}位` : "-", ranking.length ? `${ranking.length}か月中の平均売上順位` : "-", selectedRank === 0 ? "good" : selectedRank === ranking.length - 1 ? "bad" : ""],
  ]
    .map(
      ([label, value, sub, className]) => `
        <article class="kpi-card">
          <p class="kpi-label">${label}</p>
          <p class="kpi-value ${className || ""}">${value}</p>
          <p class="kpi-sub">${sub}</p>
        </article>
      `,
    )
    .join("");

  els.monthReviewYears.innerHTML = table(
    ["年", "売上", "前年比", "利益", "利益率", "客数", "客単価", "ドリンク率", "判定"],
    selectedRows
      .slice()
      .reverse()
      .map((item) => {
        const prev = selectedRows.find((target) => target.year === item.year - 1);
        return [
          `${item.year}年`,
          yen(item.sales),
          marker(pctChange(item.sales, prev?.sales)),
          profitYen(item.profit),
          percent(div(item.profit, item.sales)),
          integer(item.customers),
          yen(item.unit),
          percent(item.drinkRatio),
          item.profit === null ? "利益未登録" : profitBadge(item.profit),
        ];
      }),
  );
  els.monthReviewRanking.innerHTML = renderMonthRankingTable(ranking);

  const strongest = ranking[0];
  const weakest = ranking[ranking.length - 1];
  const latestDiff = diffNumber(latest.sales, averageSales);
  const insightRows = [
    strongest ? `平均売上が一番強い月は${strongest.label}で、平均${yen(strongest.avgSales)}です。` : "",
    weakest && strongest !== weakest ? `弱めの月は${weakest.label}で、平均${yen(weakest.avgSales)}です。` : "",
    bestSales && worstSales ? `${selectedMonth}月の過去最高売上は${bestSales.year}年、弱かった年は${worstSales.year}年です。` : "",
    Number.isFinite(latestDiff) ? `最新の${latest.year}年${selectedMonth}月は、過去平均より${latestDiff >= 0 ? "上" : "下"}に${yen(Math.abs(latestDiff))}ずれています。` : "",
  ].filter(Boolean);

  els.monthReviewInsight.innerHTML = insightRows.length
    ? insightRows.map((textValue) => `<div class="insight">${escapeHtml(textValue)}</div>`).join("")
    : empty("月別の見立てを出すには、同じ月の複数年データが必要です。");
}

function renderMonthReviewSelect(monthly) {
  const current = Number(els.monthReviewSelect.value);
  const activeSelected = Number((activeMonthKey || els.monthSelect?.value || "").split("-")[1]);
  const fallback = activeSelected || monthly[monthly.length - 1]?.month || new Date().getMonth() + 1;
  const nextMonth = current || fallback;
  els.monthReviewSelect.innerHTML = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    return `<option value="${month}">${month}月</option>`;
  }).join("");
  els.monthReviewSelect.value = String(nextMonth);
}

function buildMonthSeasonality(monthly) {
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const rows = monthly.filter((item) => item.month === month && Number.isFinite(item.sales));
    const profitRows = rows.filter((item) => Number.isFinite(item.profit));
    const bestSales = rows.length ? maxBy(rows, (item) => item.sales) : null;
    return {
      month,
      label: `${month}月`,
      count: rows.length,
      avgSales: averageNumber(rows.map((item) => item.sales)),
      avgProfit: averageNumber(rows.map((item) => item.profit)),
      avgCustomers: averageNumber(rows.map((item) => item.customers)),
      avgUnit: averageNumber(rows.map((item) => item.unit)),
      blackRatio: div(profitRows.filter((item) => item.profit >= 0).length, profitRows.length),
      bestSales,
    };
  })
    .filter((item) => item.count)
    .sort((a, b) => (b.avgSales || 0) - (a.avgSales || 0));
}

function renderMonthRankingTable(ranking) {
  if (!ranking.length) return empty("月別ランキングを作れるデータがありません。");
  return table(
    ["順位", "月", "年数", "平均売上", "平均利益", "黒字率", "平均客単価", "最高売上", "判定"],
    ranking.map((item, index) => [
      `${index + 1}位`,
      item.label,
      `${item.count}年`,
      yen(item.avgSales),
      profitYen(item.avgProfit),
      percent(item.blackRatio),
      yen(item.avgUnit),
      item.bestSales ? `${item.bestSales.year}年 ${yen(item.bestSales.sales)}` : "-",
      index === 0 ? "強い月" : index === ranking.length - 1 ? "弱め" : index <= 2 ? "強め" : "標準",
    ]),
  );
}

function renderMonthExpenseBreakdown(item) {
  const rows = [
    ["人件費", item.laborCost, div(item.laborCost, item.sales), "最重要"],
    ["原価", item.cost, div(item.cost, item.sales), "最重要"],
    ["水道光熱費", item.financial?.utilities, div(item.financial?.utilities, item.sales), ""],
    ["消耗品費", item.financial?.supplies, div(item.financial?.supplies, item.sales), ""],
    ["その他経費", item.financial?.otherExpenses, div(item.financial?.otherExpenses, item.sales), ""],
    ["経費合計", item.expenses, div(item.expenses, item.sales), ""],
  ];
  els.monthDetailExpenses.innerHTML = table(
    ["項目", "金額", "売上比", "メモ"],
    rows.map(([label, amount, ratio, memo]) => [
      label,
      yen(amount),
      percent(ratio),
      memo ? `<span class="pill">${memo}</span>` : "",
    ]),
  );
}

function renderMonthDiagnosis(item, rows, previousYear, previousMonth) {
  const diagnosis = buildMonthDiagnosis(item, rows, previousYear, previousMonth);
  els.monthDiagnosis.innerHTML = `
    <div class="diagnosis-summary ${diagnosis.status}">
      <div>
        <p class="eyebrow">Priority</p>
        <h3>${escapeHtml(diagnosis.title)}</h3>
        <p>${escapeHtml(diagnosis.summary)}</p>
      </div>
      <span class="diagnosis-status">${escapeHtml(diagnosis.badge)}</span>
    </div>
    <div class="diagnosis-grid">
      ${diagnosis.cards
        .map(
          (card) => `
            <article class="diagnosis-card ${card.status}">
              <p class="diagnosis-card-label">${escapeHtml(card.label)}</p>
              <h4>${escapeHtml(card.title)}</h4>
              <p>${escapeHtml(card.reason)}</p>
              <strong>${escapeHtml(card.todo)}</strong>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function buildMonthDiagnosis(item, rows, previousYear, previousMonth) {
  const cards = [];
  const comparison = previousYear || previousMonth;
  const comparisonRows = comparison ? activeDailyRows().filter((row) => row.key === comparison.key) : [];
  const comparisonLabel = previousYear ? "前年同月" : previousMonth ? "前月" : "比較月";
  const currentAgg = aggregateDaily(rows);
  const comparisonAgg = aggregateDaily(comparisonRows);
  const salesChange = pctChange(item.sales, comparison?.sales);
  const profitDiff = diffNumber(item.profit, comparison?.profit);
  const laborPoint = diffNumber(div(item.laborCost, item.sales), div(comparison?.laborCost, comparison?.sales));
  const costPoint = diffNumber(div(item.cost, item.sales), div(comparison?.cost, comparison?.sales));
  const drinkPoint = diffNumber(item.drinkRatio, comparison?.drinkRatio);
  const addCard = (priority, status, label, title, reason, todo) => {
    cards.push({ priority, status, label, title, reason, todo });
  };

  if (Number.isFinite(item.profit) && item.profit < 0) {
    addCard(
      100,
      "bad",
      "最優先",
      "赤字を止める",
      `利益が${yen(item.profit)}です。まず利益が残らない原因を経費率から切り分けます。`,
      "原価率、人件費率、その他経費を売上比で確認し、発注量・ロス・ピーク外シフトを1週間単位で締める。",
    );
  } else if (Number.isFinite(profitDiff) && profitDiff < -100000) {
    addCard(
      82,
      "warn",
      "利益注意",
      "黒字でも利益の減り方を見る",
      `${comparisonLabel}より利益が${yen(Math.abs(profitDiff))}減っています。売上だけでなく経費率の悪化も確認したい月です。`,
      "前年差が大きい順に、人件費率・原価率・その他経費を見て、利益を削った項目から対策する。",
    );
  }

  if (Number.isFinite(salesChange) && salesChange < -0.03) {
    const customerChange = pctChange(currentAgg.customers, comparisonAgg.customers);
    const currentUnit = div(currentAgg.sales, currentAgg.customers);
    const comparisonUnit = div(comparisonAgg.sales, comparisonAgg.customers);
    const unitChange = pctChange(currentUnit, comparisonUnit);
    if (Number.isFinite(customerChange) && customerChange < -0.03) {
      addCard(
        76,
        "bad",
        "売上原因",
        "客数回復を優先する",
        `売上が${signedPct(salesChange)}、客数が${signedPct(customerChange)}です。来店数の落ち込みが売上を押し下げています。`,
        "落ち込みが大きい曜日に、予約導線・SNS告知・限定メニュー・近隣向け再来店施策を集中させる。",
      );
    }
    if (Number.isFinite(unitChange) && unitChange < -0.03) {
      addCard(
        72,
        "warn",
        "単価原因",
        "客単価を底上げする",
        `客単価が${signedPct(unitChange)}です。人が来ていても、追加注文や高単価商品の入り方が弱い可能性があります。`,
        "おすすめドリンク、追加一品、セット提案をスタッフ共通の声かけにして、会計単価を上げる。",
      );
    }
    if (!rows.length) {
      addCard(
        68,
        "warn",
        "売上原因",
        "営業日報Excelを追加して原因を分ける",
        `売上が${signedPct(salesChange)}ですが、この月は客数・客単価・曜日の内訳が未登録です。`,
        "この月の営業日報Excelを入れて、客数減なのか単価減なのかを分けて確認する。",
      );
    }
  }

  if (Number.isFinite(laborPoint) && laborPoint > 0.01) {
    addCard(
      70,
      "bad",
      "人件費",
      "人件費率を締める",
      `人件費率が${signedPoint(laborPoint)}悪化しています。売上に対して人件費が重くなっています。`,
      "曜日別の1日平均売上を見て、弱い曜日の入り時間・上がり時間・仕込み人数を調整する。",
    );
  }

  if (Number.isFinite(costPoint) && costPoint > 0.01) {
    addCard(
      68,
      "bad",
      "原価",
      "原価率を先に締める",
      `原価率が${signedPoint(costPoint)}悪化しています。売上増よりも粗利が残りにくい状態です。`,
      "高原価メニュー、廃棄、仕込み過多、発注単位を確認し、売れ筋以外のロスを減らす。",
    );
  }

  if (rows.length && comparisonRows.length) {
    const lunchChange = pctChange(div(currentAgg.lunch, currentAgg.days), div(comparisonAgg.lunch, comparisonAgg.days));
    const dinnerChange = pctChange(div(currentAgg.dinner, currentAgg.days), div(comparisonAgg.dinner, comparisonAgg.days));
    const weakDinner = weakestWeekday(rows, comparisonRows, "dinner");
    const weakLunch = weakestWeekday(rows, comparisonRows, "lunch");
    if (Number.isFinite(dinnerChange) && dinnerChange < -0.05 && (!Number.isFinite(lunchChange) || dinnerChange < lunchChange)) {
      addCard(
        62,
        "warn",
        "時間帯",
        "ディナー平均を戻す",
        `ディナー平均が${signedPct(dinnerChange)}です。ランチよりディナー側の落ち込みが大きく見えます。`,
        `${weakDinner ? `${weakDinner.label}曜` : "弱い曜日"}に、ドリンク・追加一品・滞在単価を上げる提案を集中する。`,
      );
    } else if (Number.isFinite(lunchChange) && lunchChange < -0.05) {
      addCard(
        58,
        "warn",
        "時間帯",
        "ランチ平均を戻す",
        `ランチ平均が${signedPct(lunchChange)}です。昼の客数か単価が弱くなっています。`,
        `${weakLunch ? `${weakLunch.label}曜` : "弱い曜日"}のランチ内容、提供速度、セット訴求を見直す。`,
      );
    }
  }

  if (Number.isFinite(drinkPoint) && drinkPoint < -0.01) {
    addCard(
      54,
      "warn",
      "ドリンク",
      "ドリンク率を戻す",
      `ドリンク率が${signedPoint(drinkPoint)}下がっています。利益に効きやすい追加注文が弱い可能性があります。`,
      "最初の一杯、食後、追加注文の声かけを決めて、曜日別にドリンク率を追う。",
    );
  }

  if (!cards.length) {
    addCard(
      20,
      "good",
      "維持",
      "大きな異常は少ない",
      "売上・利益・経費率に強い悪化サインは少なめです。",
      "良かった曜日とメニューを残し、次月も同じ条件で再現できるかを見る。",
    );
  }

  const sorted = cards.sort((a, b) => b.priority - a.priority).slice(0, 4);
  const top = sorted[0];
  const status = top.status === "bad" ? "bad" : top.status === "warn" ? "warn" : "good";
  const title = status === "bad" ? "今月は改善優先" : status === "warn" ? "注意して見る月" : "良い流れを維持";
  const badge = status === "bad" ? "優先度 高" : status === "warn" ? "優先度 中" : "優先度 低";
  const summary =
    status === "good"
      ? `${item.label}は大きな悪化サインが少ないので、良かった条件を再現する月です。`
      : `${item.label}は「${top.title}」から見ると判断しやすいです。`;
  return { status, title, badge, summary, cards: sorted };
}

function weakestWeekday(rows, comparisonRows, metric) {
  const grouped = groupBy(rows, (row) => row.weekday);
  const previousGrouped = groupBy(comparisonRows, (row) => row.weekday);
  const values = WEEKDAY_ORDER.map((weekday) => {
    const current = aggregateDaily(grouped.get(weekday) || []);
    const previous = aggregateDaily(previousGrouped.get(weekday) || []);
    const currentAverage = div(current[metric], current.days);
    const previousAverage = div(previous[metric], previous.days);
    return { label: weekday, change: pctChange(currentAverage, previousAverage) };
  }).filter((weekday) => Number.isFinite(weekday.change));
  if (!values.length) return null;
  return minBy(values, (weekday) => weekday.change);
}

function renderMonthlyChart(monthly) {
  if (!monthly.length) {
    els.monthlyChart.innerHTML = empty("月別データはまだありません。");
    return;
  }
  els.monthlyChart.innerHTML = table(
    ["月", "売上", "前年比", "客数", "前年比", "客単価", "前年比", "ドリンク率", "利益", "判定"],
    monthly
      .slice()
      .reverse()
      .map((item) => [
        item.label,
        yen(item.sales),
        marker(item.yoy.sales),
        `${integer(item.customers)}人`,
        marker(item.yoy.customers),
        yen(item.unit),
        marker(item.yoy.unit),
        percent(item.drinkRatio),
        profitYen(item.profit),
        profitBadge(item.profit),
      ]),
  );
}

function renderLaborView(monthly) {
  const year = Number(els.yearSelect.value);
  const rows = monthly.filter((item) => item.year === year && (item.laborCost || item.expenses || item.profit !== null));
  if (!rows.length) {
    els.laborChart.innerHTML = empty("人件費・経費はPDFを読み込むと表示されます。");
    els.laborTable.innerHTML = empty("表示できる人件費データがありません。");
    return;
  }

  els.laborChart.innerHTML = table(
    ["月", "人件費", "人件費率", "前年比", "前月比", "原価率", "前年比", "前月比", "利益"],
    rows.map((item) => {
      const previousYear = monthly.find((target) => target.year === item.year - 1 && target.month === item.month);
      const previousMonth = monthly.find((target) => target.key === previousMonthKey(item.key));
      const laborRatio = div(item.laborCost, item.sales);
      const priorLaborRatio = div(previousYear?.laborCost, previousYear?.sales);
      const prevMonthLaborRatio = div(previousMonth?.laborCost, previousMonth?.sales);
      const costRatio = div(item.cost, item.sales);
      const priorCostRatio = div(previousYear?.cost, previousYear?.sales);
      const prevMonthCostRatio = div(previousMonth?.cost, previousMonth?.sales);
      return [
        item.label,
        yen(item.laborCost),
        percent(laborRatio),
        markerPoint(diffNumber(laborRatio, priorLaborRatio), true),
        markerPoint(diffNumber(laborRatio, prevMonthLaborRatio), true),
        percent(costRatio),
        markerPoint(diffNumber(costRatio, priorCostRatio), true),
        markerPoint(diffNumber(costRatio, prevMonthCostRatio), true),
        profitYen(item.profit),
      ];
    }),
  );

  const totalSales = rows.reduce((sum, item) => sum + (item.sales || 0), 0);
  const sum = (key) => rows.reduce((total, item) => total + (item.financial?.[key] || item[key] || 0), 0);
  const costRows = [
    ["人件費", sum("laborCost"), "最重要"],
    ["原価", sum("cost"), "最重要"],
    ["水道光熱費", sum("utilities"), ""],
    ["消耗品費", sum("supplies"), ""],
    ["その他経費", sum("otherExpenses"), ""],
    ["経費合計", sum("expenses"), ""],
  ];
  els.laborTable.innerHTML = table(
    ["項目", `${year}年 合計`, "売上比", "メモ"],
    costRows.map(([label, amount, memo]) => [
      label,
      yen(amount),
      percent(div(amount, totalSales)),
      memo ? `<span class="pill">${memo}</span>` : "",
    ]),
  );
}

function renderDrinkView(monthly) {
  const rows = monthly.filter((item) => item.drink || item.drinkRatio);
  if (!rows.length) {
    els.drinkChart.innerHTML = empty("ドリンク売上はExcelを読み込むと表示されます。");
    els.drinkTable.innerHTML = empty("表示できるドリンクデータがありません。");
    return;
  }
  const years = [...new Set(rows.map((item) => item.year))].sort();
  const labels = Array.from({ length: 12 }, (_, index) => `${index + 1}月`);
  const series = years.map((year, index) => ({
    label: `${year}年`,
    color: CHART_COLORS[index % CHART_COLORS.length],
    values: labels.map((_, monthIndex) => {
      const item = rows.find((target) => target.year === year && target.month === monthIndex + 1);
      return { label: item?.label || `${year}/${pad2(monthIndex + 1)}`, value: item?.drink ?? null };
    }),
  }));
  els.drinkChart.innerHTML = categoryBarChart(labels, series, { formatter: compactYen });
  els.drinkTable.innerHTML = table(
    ["月", "ドリンク売上", "ドリンク率", "総売上", "ドリンク前年比", "ドリンク率前年比"],
    rows
      .slice()
      .reverse()
      .map((item) => {
        const previous = monthly.find((target) => target.year === item.year - 1 && target.month === item.month);
        return [
          item.label,
          yen(item.drink),
          percent(item.drinkRatio),
          yen(item.sales),
          signedPct(item.yoy.drink),
          signedPoint(diffNumber(item.drinkRatio, previous?.drinkRatio)),
        ];
      }),
  );
}

function renderLunchDinnerView(monthly) {
  const year = Number(els.yearSelect.value);
  const rows = monthly.filter((item) => item.year === year && (item.lunch || item.dinner));
  if (!rows.length) {
    els.lunchDinnerChart.innerHTML = empty("ランチ/ディナーはExcelを読み込むと表示されます。");
    els.lunchDinnerTable.innerHTML = empty("表示できるランチ/ディナーデータがありません。");
    return;
  }

  const labels = rows.map((item) => `${item.month}月`);
  els.lunchDinnerChart.innerHTML = categoryBarChart(labels, [
    { label: "ランチ売上", color: "#0f7a68", values: rows.map((item) => ({ label: item.label, value: item.lunch })) },
    { label: "ディナー売上", color: "#b86b00", values: rows.map((item) => ({ label: item.label, value: item.dinner })) },
  ], { formatter: compactYen });
  els.lunchDinnerTable.innerHTML = table(
    ["月", "ランチ売上", "L客数", "L客単価", "ディナー売上", "D客数", "D客単価", "ランチ比率"],
    rows.map((item) => [
      item.label,
      yen(item.lunch),
      integer(item.lunchCustomers),
      yen(div(item.lunch, item.lunchCustomers)),
      yen(item.dinner),
      integer(item.dinnerCustomers),
      yen(div(item.dinner, item.dinnerCustomers)),
      percent(div(item.lunch, item.lunch + item.dinner)),
    ]),
  );
}

function renderWeekdayChart() {
  const year = Number(els.yearSelect.value);
  const metric = els.weekdayMetricSelect.value;
  const storeDaily = activeDailyRows();
  const rows = storeDaily.filter((row) => row.year === year);
  const prevRows = storeDaily.filter((row) => row.year === year - 1);
  const current = weekdayMetricRows(rows, metric);
  const previous = weekdayMetricRows(prevRows, metric);
  els.weekdayChart.innerHTML = groupedBarChart(
    [
      { label: `${year}年`, color: "#0f7a68", values: current },
      { label: `${year - 1}年`, color: "#b86b00", values: previous },
    ],
    { formatter: axisFormatter(metric === "drinkRatio" ? "ratio" : metric) },
  );
}

function renderWeekdayTable() {
  const year = Number(els.yearSelect.value);
  const metric = els.weekdayMetricSelect.value;
  const storeDaily = activeDailyRows();
  const current = weekdayMetricRows(storeDaily.filter((row) => row.year === year), metric);
  const previous = weekdayMetricRows(storeDaily.filter((row) => row.year === year - 1), metric);
  const type = metric === "drinkRatio" ? "ratio" : metric === "unit" || metric === "sales" || metric === "lunch" || metric === "dinner" ? "yen" : "count";
  els.weekdayTable.innerHTML = table(
    ["曜日", `${year}年`, `${year - 1}年`, "前年差", "日数", "祝日"],
    current.map((item, index) => {
      const prev = previous[index];
      const diff = type === "ratio" ? diffNumber(item.value, prev?.value) : pctChange(item.value, prev?.value);
      return [
        item.label,
        formatByType(item.value, type),
        formatByType(prev?.value, type),
        type === "ratio" ? signedPoint(diff) : signedPct(diff),
        integer(item.days),
        integer(item.holidays),
      ];
    }),
  );
}

function renderProfitView(monthly) {
  const rows = monthly.filter((item) => item.profit !== null);
  if (!rows.length) {
    els.profitChart.innerHTML = empty("利益はPDFを読み込むと表示されます。");
    els.profitTable.innerHTML = empty("表示できる利益データがありません。");
    return;
  }
  const years = [...new Set(rows.map((item) => item.year))].sort();
  const labels = Array.from({ length: 12 }, (_, index) => `${index + 1}月`);
  const series = years.map((year, index) => ({
    label: `${year}年`,
    color: CHART_COLORS[index % CHART_COLORS.length],
    values: labels.map((_, monthIndex) => {
      const item = rows.find((target) => target.year === year && target.month === monthIndex + 1);
      return { label: item?.label || `${year}/${pad2(monthIndex + 1)}`, value: item?.profit ?? null };
    }),
  }));
  els.profitChart.innerHTML = categoryBarChart(labels, series, { formatter: compactYen });
  els.profitTable.innerHTML = table(
    ["月", "判定", "利益", "利益率", "売上", "原価", "経費合計", "前年差"],
    rows
      .slice()
      .reverse()
      .map((item) => [
        item.label,
        profitBadge(item.profit),
        profitYen(item.profit),
        percent(div(item.profit, item.sales)),
        yen(item.sales),
        yen(item.cost),
        yen(item.expenses),
        signedPct(item.yoy.profit),
      ]),
  );
}

function weekdayMetricRows(rows, metric) {
  const grouped = groupBy(rows, (row) => row.weekday);
  return WEEKDAY_ORDER.map((weekday) => {
    const agg = aggregateDaily(grouped.get(weekday) || []);
    const value =
      metric === "lunch"
        ? agg.days
          ? agg.lunch / agg.days
          : null
        : metric === "sales"
          ? agg.days
            ? agg.sales / agg.days
            : null
          : metric === "unit"
            ? agg.customers
              ? agg.sales / agg.customers
              : null
            : metric === "dinner"
              ? agg.days
                ? agg.dinner / agg.days
                : null
            : agg.sales
              ? agg.drink / agg.sales
              : null;
    return { label: weekday, value, days: agg.days, holidays: agg.holidayDays };
  });
}

function renderPeriodCompare() {
  const a = aggregatePeriod(els.periodAStart.value, els.periodAEnd.value);
  const b = aggregatePeriod(els.periodBStart.value, els.periodBEnd.value);
  if (!a || !b) {
    els.periodCompare.innerHTML = empty("比較したい期間を選んでください。");
    return;
  }

  const rows = [
    ["営業日数", a.days, b.days, diffNumber(b.days, a.days), "count"],
    ["売上", a.sales, b.sales, pctChange(b.sales, a.sales), "yen"],
    ["1日平均売上", avg(a.sales, a.days), avg(b.sales, b.days), pctChange(avg(b.sales, b.days), avg(a.sales, a.days)), "yen"],
    ["客数", a.customers, b.customers, pctChange(b.customers, a.customers), "count"],
    ["客単価", div(a.sales, a.customers), div(b.sales, b.customers), pctChange(div(b.sales, b.customers), div(a.sales, a.customers)), "yen"],
    ["ランチ売上", a.lunch, b.lunch, pctChange(b.lunch, a.lunch), "yen"],
    ["ドリンク売上", a.drink, b.drink, pctChange(b.drink, a.drink), "yen"],
    ["ドリンク率", div(a.drink, a.sales), div(b.drink, b.sales), diffNumber(div(b.drink, b.sales), div(a.drink, a.sales)), "ratio"],
    ["利益", a.profit, b.profit, pctChange(b.profit, a.profit), "yen"],
  ];

  els.periodCompare.innerHTML = table(
    ["指標", "期間A", "期間B", "差"],
    rows.map(([label, av, bv, diff, type]) => [
      label,
      formatByType(av, type),
      formatByType(bv, type),
      type === "ratio" ? signedPoint(diff) : type === "count" && label === "営業日数" ? signedNumber(diff) : signedPct(diff),
    ]),
  );
}

function aggregatePeriod(startMonth, endMonth) {
  if (!startMonth || !endMonth || startMonth > endMonth) return null;
  const start = new Date(`${startMonth}-01T00:00:00`);
  const end = endOfMonth(endMonth);
  const dailyRows = activeDailyRows().filter((row) => {
    const date = new Date(`${row.date}T00:00:00`);
    return date >= start && date <= end;
  });
  const agg = aggregateDaily(dailyRows);
  const profit = activeFinancialRows()
    .filter((item) => item.key >= startMonth && item.key <= endMonth)
    .reduce((sum, item) => sum + (item.profit || 0), 0);
  return { ...agg, profit: profit || null };
}

function renderEventImpact() {
  const events = state.events.filter((event) => !event.storeKey || event.storeKey === getActiveStoreKey());
  if (!events.length) {
    els.eventImpact.innerHTML = empty("キャンペーンや出来事を登録すると、前期間との比較が出ます。");
    return;
  }
  const rows = events
    .slice()
    .sort((a, b) => b.start.localeCompare(a.start))
    .map((event) => {
      const during = aggregateDateRange(event.start, event.end);
      const previous = aggregateDateRange(...previousRange(event.start, event.end));
      const salesDiff = pctChange(during.sales, previous.sales);
      const unitDiff = pctChange(div(during.sales, during.customers), div(previous.sales, previous.customers));
      const drinkDiff = pctChange(during.drink, previous.drink);
      return [
        `<span class="pill">${escapeHtml(event.type)}</span> ${escapeHtml(event.name)}`,
        `${event.start}〜${event.end}`,
        yen(during.sales),
        signedPct(salesDiff),
        signedPct(unitDiff),
        signedPct(drinkDiff),
        `<button class="mini-button" data-delete-event="${event.id}">削除</button>`,
      ];
    });

  els.eventImpact.innerHTML = table(["内容", "期間", "売上", "前期間比", "客単価", "ドリンク"], rows);
  els.eventImpact.querySelectorAll("[data-delete-event]").forEach((button) => {
    button.addEventListener("click", () => {
      state.events = state.events.filter((event) => event.id !== button.dataset.deleteEvent);
      saveState();
      renderAll();
    });
  });
}

function aggregateDateRange(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T23:59:59`);
  return aggregateDaily(
    activeDailyRows().filter((row) => {
      const date = new Date(`${row.date}T00:00:00`);
      return date >= start && date <= end;
    }),
  );
}

function previousRange(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const days = Math.round((end - start) / 86400000) + 1;
  const previousEnd = new Date(start);
  previousEnd.setDate(previousEnd.getDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setDate(previousStart.getDate() - days + 1);
  return [formatDate(previousStart), formatDate(previousEnd)];
}

function renderInsights(monthly) {
  const insights = [];
  const latest = [...monthly].reverse().find((item) => item.sales);
  if (latest) {
    insights.push(
      `${latest.label}の売上は${yen(latest.sales)}、前年比は${signedPct(latest.yoy.sales)}です。客数は${signedPct(latest.yoy.customers)}、客単価は${signedPct(latest.yoy.unit)}でした。`,
    );
    if (latest.profit !== null) {
      insights.push(`${latest.label}の利益は${yen(latest.profit)}で、${latest.profit >= 0 ? "黒字" : "赤字"}です。`);
    }
  }

  const selectedYear = Number(els.yearSelect.value);
  const yearMonths = monthly.filter((item) => item.year === selectedYear && item.sales);
  if (yearMonths.length) {
    const best = maxBy(yearMonths, (item) => item.sales);
    const worst = minBy(yearMonths, (item) => item.sales);
    insights.push(`${selectedYear}年で売上が強い月は${best.label}、弱い月は${worst.label}です。`);
  }

  const weekdayRows = weekdayMetricRows(activeDailyRows().filter((row) => row.year === selectedYear), "lunch").filter((item) => item.value);
  if (weekdayRows.length) {
    const bestWeekday = maxBy(weekdayRows, (item) => item.value);
    insights.push(`${selectedYear}年のランチ平均が高い曜日は${bestWeekday.label}曜で、1日平均${yen(bestWeekday.value)}です。`);
  }

  const redMonths = monthly.filter((item) => item.profit !== null && item.profit < 0);
  if (redMonths.length) {
    insights.push(`赤字判定の月は ${redMonths.map((item) => item.label).join("、")} です。`);
  }

  els.insights.innerHTML = insights.length
    ? insights.map((textValue) => `<div class="insight">${escapeHtml(textValue)}</div>`).join("")
    : empty("データを入れると、自動コメントが表示されます。");
}

function renderFileList() {
  if (!state.files.length) {
    els.fileList.innerHTML = empty("まだファイルは登録されていません。");
    return;
  }
  els.fileList.innerHTML = state.files
    .slice()
    .sort((a, b) => b.importedAt.localeCompare(a.importedAt))
    .map(
      (file) => `
        <div class="file-row">
          <span title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
          <span class="pill">${escapeHtml(file.storeName || DEFAULT_STORE_NAME)}</span>
          <span class="pill">${file.type === "pdf" ? "PDF" : "Excel"} ${file.dailyRows || file.financialRows || 0}件</span>
          <button class="mini-button" data-delete-file="${escapeHtml(file.name)}">削除</button>
        </div>
      `,
    )
    .join("");
  els.fileList.querySelectorAll("[data-delete-file]").forEach((button) => {
    button.addEventListener("click", () => {
      const name = button.dataset.deleteFile;
      state.daily = state.daily.filter((row) => row.sourceName !== name);
      state.financials = state.financials.filter((row) => row.sourceName !== name);
      state.files = state.files.filter((file) => file.name !== name);
      saveState();
      renderAll();
      setMessage(`${name} を削除しました。`);
    });
  });
}

function renderMonthlyTable(monthly) {
  if (!monthly.length) {
    els.monthlyTable.innerHTML = empty("月別データはまだありません。");
    return;
  }
  const rows = monthly
    .slice()
    .reverse()
    .map((item) => [
      item.label,
      yen(item.sales),
      integer(item.customers),
      yen(item.unit),
      yen(item.lunch),
      yen(item.drink),
      percent(item.drinkRatio),
      profitYen(item.profit),
      profitBadge(item.profit),
      signedPct(item.yoy.sales),
      signedPct(item.yoy.customers),
      signedPct(item.yoy.unit),
    ]);
  els.monthlyTable.innerHTML = table(["月", "売上", "客数", "客単価", "ランチ", "ドリンク", "ドリンク率", "利益", "判定", "売上前年比", "客数前年比", "単価前年比"], rows);
}

function setDefaultPeriods(monthly) {
  if (els.periodAStart.value || !monthly.length) return;
  const withDaily = monthly.filter((item) => item.days > 0);
  const latest = withDaily.at(-1) || monthly.at(-1);
  if (!latest) return;
  const endMonth = `${latest.year}-${pad2(latest.month)}`;
  const startMonthNumber = Math.max(1, latest.month - 2);
  const startMonth = `${latest.year}-${pad2(startMonthNumber)}`;
  const previousStart = `${latest.year - 1}-${pad2(startMonthNumber)}`;
  const previousEnd = `${latest.year - 1}-${pad2(latest.month)}`;
  els.periodAStart.value = previousStart;
  els.periodAEnd.value = previousEnd;
  els.periodBStart.value = startMonth;
  els.periodBEnd.value = endMonth;
}

function lineChart(series, options = {}) {
  const allPoints = series.flatMap((item) => item.points);
  if (!allPoints.length) return empty("グラフにできるデータがありません。");
  const width = 720;
  const height = 300;
  const pad = { top: 22, right: 20, bottom: 42, left: 70 };
  const yValues = allPoints.map((point) => point.y);
  const minY = Math.min(0, Math.min(...yValues));
  const maxY = Math.max(...yValues);
  const span = maxY - minY || 1;
  const x = (month) => pad.left + ((month - 1) / 11) * (width - pad.left - pad.right);
  const y = (value) => pad.top + (1 - (value - minY) / span) * (height - pad.top - pad.bottom);
  const formatter = options.formatter || compactNumber;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => minY + span * ratio);

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(options.title || "推移グラフ")}">
      ${yTicks
        .map(
          (tick) => `
            <line x1="${pad.left}" x2="${width - pad.right}" y1="${y(tick)}" y2="${y(tick)}" stroke="#dce6e2" />
            <text x="${pad.left - 10}" y="${y(tick) + 4}" text-anchor="end" font-size="11" fill="#687775">${formatter(tick)}</text>
          `,
        )
        .join("")}
      ${Array.from({ length: 12 }, (_, index) => {
        const month = index + 1;
        return `<text x="${x(month)}" y="${height - 16}" text-anchor="middle" font-size="11" fill="#687775">${month}</text>`;
      }).join("")}
      ${series
        .map((item) => {
          const points = item.points.map((point) => `${x(point.x)},${y(point.y)}`).join(" ");
          return `
            <polyline points="${points}" fill="none" stroke="${item.color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />
            ${item.points.map((point) => `<circle cx="${x(point.x)}" cy="${y(point.y)}" r="4" fill="${item.color}"><title>${point.label}: ${formatter(point.y)}</title></circle>`).join("")}
          `;
        })
        .join("")}
      ${series
        .map((item, index) => `
          <g transform="translate(${pad.left + index * 92}, 14)">
            <rect width="12" height="12" rx="2" fill="${item.color}" />
            <text x="18" y="10" font-size="12" fill="#13211f">${escapeHtml(item.label)}</text>
          </g>
        `)
        .join("")}
    </svg>
  `;
}

function groupedBarChart(series, options = {}) {
  const labels = WEEKDAY_ORDER;
  return categoryBarChart(labels, series, options);
}

function categoryBarChart(labels, series, options = {}) {
  const values = series.flatMap((item) => item.values.map((value) => value.value)).filter((value) => Number.isFinite(value));
  if (!values.length) return empty(options.emptyMessage || "グラフにできるデータがありません。");
  const width = 720;
  const height = 300;
  const pad = { top: 24, right: 20, bottom: 48, left: 70 };
  const minY = Math.min(0, ...values);
  const maxY = Math.max(0, ...values);
  const spanY = maxY - minY || 1;
  const formatter = options.formatter || compactNumber;
  const innerWidth = width - pad.left - pad.right;
  const groupWidth = innerWidth / labels.length;
  const barWidth = Math.min(28, (groupWidth - 18) / series.length);
  const plotHeight = height - pad.top - pad.bottom;
  const y = (value) => pad.top + (1 - (value - minY) / spanY) * plotHeight;
  const zeroY = y(0);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => minY + spanY * ratio);

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="比較グラフ">
      ${yTicks
        .map(
          (tick) => `
            <line x1="${pad.left}" x2="${width - pad.right}" y1="${y(tick)}" y2="${y(tick)}" stroke="#dce6e2" />
            <text x="${pad.left - 10}" y="${y(tick) + 4}" text-anchor="end" font-size="11" fill="#687775">${formatter(tick)}</text>
          `,
        )
        .join("")}
      <line x1="${pad.left}" x2="${width - pad.right}" y1="${zeroY}" y2="${zeroY}" stroke="#9aa8a5" stroke-width="1.3" />
      ${labels
        .map((label, labelIndex) => {
          const x0 = pad.left + labelIndex * groupWidth + groupWidth / 2;
          return `
            <text x="${x0}" y="${height - 18}" text-anchor="middle" font-size="12" fill="#687775">${label}</text>
            ${series
              .map((item, seriesIndex) => {
                const point = item.values[labelIndex];
                const value = point?.value || 0;
                const barX = x0 - (barWidth * series.length) / 2 + seriesIndex * barWidth;
                const barY = value >= 0 ? y(value) : zeroY;
                const barHeight = Math.abs(zeroY - y(value));
                const opacity = Number.isFinite(point?.value) ? 1 : 0.12;
                return `<rect x="${barX}" y="${barY}" width="${barWidth - 2}" height="${Math.max(0, barHeight)}" rx="3" fill="${item.color}" opacity="${opacity}"><title>${item.label} ${label}: ${Number.isFinite(point?.value) ? formatter(value) : "-"}</title></rect>`;
              })
              .join("")}
          `;
        })
        .join("")}
      ${series
        .map((item, index) => `
          <g transform="translate(${pad.left + index * 92}, 14)">
            <rect width="12" height="12" rx="2" fill="${item.color}" />
            <text x="18" y="10" font-size="12" fill="#13211f">${escapeHtml(item.label)}</text>
          </g>
        `)
        .join("")}
    </svg>
  `;
}

function metricValue(item, metric) {
  if (metric === "sales") return item.sales;
  if (metric === "customers") return item.customers;
  if (metric === "unit") return item.unit;
  if (metric === "drink") return item.drink;
  if (metric === "profit") return item.profit;
  return null;
}

function axisFormatter(metric) {
  if (metric === "customers" || metric === "count") return (value) => `${Math.round(value).toLocaleString("ja-JP")}人`;
  if (metric === "unit" || metric === "sales" || metric === "drink" || metric === "profit" || metric === "lunch" || metric === "dinner") return compactYen;
  if (metric === "ratio") return (value) => percent(value);
  return compactNumber;
}

function table(headers, rows) {
  return `
    <table>
      <thead><tr>${headers.map((header, index) => `<th class="${index === 0 ? "text" : ""}">${escapeHtml(header)}</th>`).join("")}</tr></thead>
      <tbody>${rows
        .map(
          (row) => `
            <tr>${row.map((cell, index) => `<td class="${index === 0 ? "text" : ""}" data-label="${escapeHtml(headers[index] || "")}">${cell ?? "-"}</td>`).join("")}</tr>
          `,
        )
        .join("")}</tbody>
    </table>
  `;
}

function requestFloatingTableUpdate() {
  if (floatingTableFrame) cancelAnimationFrame(floatingTableFrame);
  floatingTableFrame = requestAnimationFrame(updateFloatingTableHeader);
}

function ensureFloatingTable() {
  if (floatingTable) return floatingTable;
  const root = document.createElement("div");
  root.className = "floating-table-head";
  root.innerHTML = `
    <div class="floating-table-window">
      <table></table>
    </div>
    <div class="floating-table-corner"></div>
  `;
  document.body.appendChild(root);
  floatingTable = {
    root,
    window: root.querySelector(".floating-table-window"),
    table: root.querySelector("table"),
    corner: root.querySelector(".floating-table-corner"),
    source: null,
  };
  return floatingTable;
}

function hideFloatingTable() {
  if (!floatingTable) return;
  floatingTable.root.classList.remove("visible");
  floatingTable.source = null;
}

function getFloatingTableTop() {
  const navRect = els.analysisNav?.getBoundingClientRect();
  if (navRect && navRect.top <= 1 && navRect.bottom > 0) return Math.ceil(navRect.bottom + 6);
  return 0;
}

function findFloatingTableSource(top) {
  const wrappers = [...document.querySelectorAll(".view-panel.active .table-wrap")];
  for (const wrapper of wrappers) {
    const tableElement = wrapper.querySelector("table");
    const head = tableElement?.tHead;
    if (!tableElement || !head) continue;
    const rect = wrapper.getBoundingClientRect();
    const headHeight = head.getBoundingClientRect().height || 36;
    if (rect.top < top && rect.bottom > top + headHeight + 8) {
      return { wrapper, tableElement, head, rect, headHeight };
    }
  }
  return null;
}

function updateFloatingTableHeader() {
  floatingTableFrame = 0;
  const top = getFloatingTableTop();
  const source = findFloatingTableSource(top);
  if (!source) {
    hideFloatingTable();
    return;
  }

  const view = ensureFloatingTable();
  const tableRect = source.tableElement.getBoundingClientRect();
  const visibleLeft = Math.max(source.rect.left, 0);
  const visibleRight = Math.min(source.rect.right, window.innerWidth);
  const visibleWidth = Math.max(0, visibleRight - visibleLeft);
  if (!visibleWidth) {
    hideFloatingTable();
    return;
  }

  if (view.source !== source.tableElement) {
    view.table.innerHTML = "";
    view.table.appendChild(source.head.cloneNode(true));
    view.source = source.tableElement;
  }

  const originalCells = [...source.head.rows[0].cells];
  const clonedCells = [...view.table.tHead.rows[0].cells];
  originalCells.forEach((cell, index) => {
    const width = cell.getBoundingClientRect().width;
    if (clonedCells[index]) {
      clonedCells[index].style.width = `${width}px`;
      clonedCells[index].style.minWidth = `${width}px`;
      clonedCells[index].style.maxWidth = `${width}px`;
    }
  });

  const firstWidth = originalCells[0]?.getBoundingClientRect().width || 0;
  const firstHeight = source.head.getBoundingClientRect().height || source.headHeight;
  view.root.style.top = `${top}px`;
  view.root.style.left = `${visibleLeft}px`;
  view.root.style.width = `${visibleWidth}px`;
  view.table.style.width = `${tableRect.width}px`;
  view.table.style.transform = `translateX(${-source.wrapper.scrollLeft}px)`;
  view.corner.textContent = originalCells[0]?.textContent || "";
  view.corner.style.width = `${firstWidth}px`;
  view.corner.style.height = `${firstHeight}px`;
  view.root.classList.add("visible");
}

function empty(textValue) {
  return `<div class="empty">${escapeHtml(textValue)}</div>`;
}

function isWeekendLike(row) {
  const mode = els.weekendMode?.value || "satSun";
  const base = mode === "friSatSun" ? ["金", "土", "日"] : ["土", "日"];
  if (base.includes(row.weekday)) return true;
  return Boolean(els.holidayAsWeekend?.checked && row.isHoliday);
}

function classifyDay(date, holidayName) {
  const weekday = WEEKDAYS[date.getDay()];
  if (holidayName && !["土", "日"].includes(weekday)) return "平日祝日";
  if (["土", "日"].includes(weekday)) return holidayName ? "土日祝" : "土日";
  return "平日";
}

function getJapanHoliday(date) {
  const holidays = japanHolidays(date.getFullYear());
  return holidays.get(formatDate(date)) || "";
}

const holidayCache = new Map();

function japanHolidays(year) {
  if (holidayCache.has(year)) return holidayCache.get(year);
  const holidays = new Map();
  const add = (month, day, name) => {
    holidays.set(`${year}-${pad2(month)}-${pad2(day)}`, name);
  };
  const addDate = (date, name) => holidays.set(formatDate(date), name);
  const nthMonday = (month, nth) => {
    const date = new Date(year, month - 1, 1);
    const offset = (8 - date.getDay()) % 7;
    return 1 + offset + (nth - 1) * 7;
  };

  add(1, 1, "元日");
  add(1, nthMonday(1, 2), "成人の日");
  add(2, 11, "建国記念の日");
  add(2, 23, "天皇誕生日");
  add(3, vernalEquinoxDay(year), "春分の日");
  add(4, 29, "昭和の日");
  add(5, 3, "憲法記念日");
  add(5, 4, "みどりの日");
  add(5, 5, "こどもの日");
  add(7, nthMonday(7, 3), "海の日");
  add(8, 11, "山の日");
  add(9, nthMonday(9, 3), "敬老の日");
  add(9, autumnEquinoxDay(year), "秋分の日");
  add(10, nthMonday(10, 2), "スポーツの日");
  add(11, 3, "文化の日");
  add(11, 23, "勤労感謝の日");

  const original = [...holidays.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [dateString, name] of original) {
    const date = new Date(`${dateString}T00:00:00`);
    if (date.getDay() !== 0) continue;
    let substitute = new Date(date);
    do {
      substitute.setDate(substitute.getDate() + 1);
    } while (holidays.has(formatDate(substitute)));
    addDate(substitute, `${name} 振替休日`);
  }

  for (let month = 1; month <= 12; month += 1) {
    for (let day = 2; day <= 30; day += 1) {
      const date = makeDate(year, month, day);
      if (!date || date.getFullYear() !== year) continue;
      const key = formatDate(date);
      if (holidays.has(key)) continue;
      const previous = new Date(date);
      previous.setDate(previous.getDate() - 1);
      const next = new Date(date);
      next.setDate(next.getDate() + 1);
      if (holidays.has(formatDate(previous)) && holidays.has(formatDate(next))) {
        holidays.set(key, "国民の休日");
      }
    }
  }

  holidayCache.set(year, holidays);
  return holidays;
}

function vernalEquinoxDay(year) {
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

function autumnEquinoxDay(year) {
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return normalizeState(parsed);
  } catch {
    return { daily: [], financials: [], events: [], files: [] };
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)));
    return true;
  } catch (error) {
    console.error(error);
    setMessage("ブラウザ内に保存できませんでした。バックアップ保存をしてから、古いデータの整理をしてください。", true);
    return false;
  }
}

function downloadBackup() {
  const backup = {
    app: "nishiogi-sales-dashboard",
    version: APP_ASSET_VERSION,
    exportedAt: new Date().toISOString(),
    ...normalizeState(state),
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `sales-dashboard-backup-${formatDate(new Date())}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  setMessage(`${anchor.download} をダウンロードしました。`);
}

async function restoreBackup(file) {
  const textValue = await file.text();
  const parsed = JSON.parse(textValue);
  const restored = normalizeState(parsed);
  if (!restored.daily.length && !restored.financials.length && !restored.events.length && !restored.files.length) {
    throw new Error("登録データが入っていないバックアップです。");
  }
  state.daily = restored.daily;
  state.financials = restored.financials;
  state.events = restored.events;
  state.files = restored.files;
  saveState();
  renderAll();
  setMessage("バックアップを読み込みました。");
}

function normalizeState(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    daily: Array.isArray(source.daily) ? source.daily.map(normalizeStoredItem) : [],
    financials: Array.isArray(source.financials) ? source.financials.map(normalizeStoredItem) : [],
    events: Array.isArray(source.events) ? source.events.map(normalizeStoredItem) : [],
    files: Array.isArray(source.files) ? source.files.map(normalizeStoredItem) : [],
  };
}

function normalizeStoredItem(item) {
  const base = item && typeof item === "object" ? item : {};
  const store = base.storeName || base.storeKey
    ? makeStoreInfo(base.storeName || base.storeKey)
    : parseStoreFromName(base.sourceName || base.name || "");
  return {
    ...base,
    storeKey: store.storeKey,
    storeName: store.storeName,
  };
}

function setMessage(textValue, isError = false) {
  if (!els.message) return;
  els.message.textContent = textValue;
  els.message.style.color = isError ? "var(--bad)" : "var(--muted)";
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const cleaned = String(value).replace(/[,\s円%]/g, "");
  if (!cleaned || cleaned.includes("#")) return 0;
  const negative = cleaned.includes("△");
  const number = Number(cleaned.replace("△", ""));
  return Number.isFinite(number) ? (negative ? -number : number) : 0;
}

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function normalizeName(name) {
  return String(name || "")
    .normalize("NFKC")
    .replace(/\s+/g, "");
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function makeDate(year, month, day) {
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function endOfMonth(monthValue) {
  const [year, month] = monthValue.split("-").map(Number);
  return new Date(year, month, 0, 23, 59, 59);
}

function pctChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return current / previous - 1;
}

function diffNumber(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  return current - previous;
}

function div(a, b) {
  return Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? a / b : null;
}

function avg(a, b) {
  return div(a, b);
}

function yen(value) {
  if (!Number.isFinite(value)) return "-";
  return `${Math.round(value).toLocaleString("ja-JP")}円`;
}

function compactYen(value) {
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(1)}百万`;
  if (Math.abs(value) >= 10000) return `${Math.round(value / 10000).toLocaleString("ja-JP")}万`;
  return `${Math.round(value).toLocaleString("ja-JP")}円`;
}

function integer(value) {
  if (!Number.isFinite(value)) return "-";
  return Math.round(value).toLocaleString("ja-JP");
}

function compactNumber(value) {
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 10000) return `${Math.round(value / 10000).toLocaleString("ja-JP")}万`;
  return Math.round(value).toLocaleString("ja-JP");
}

function percent(value) {
  if (!Number.isFinite(value)) return "-";
  return `${(value * 100).toFixed(1)}%`;
}

function signedPct(value) {
  if (!Number.isFinite(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(1)}%`;
}

function marker(value, prefix = "", invert = false) {
  if (!Number.isFinite(value)) return "-";
  const favorable = invert ? value < 0 : value > 0;
  const unfavorable = invert ? value > 0 : value < 0;
  const className = favorable ? "trend-up" : unfavorable ? "trend-down" : "trend-flat";
  const symbol = favorable ? "▲" : unfavorable ? "▼" : "→";
  const label = `${prefix ? `${prefix} ` : ""}${symbol} ${signedPct(value)}`;
  return `<span class="trend-marker ${className}">${label}</span>`;
}

function markerPoint(value, invert = false) {
  if (!Number.isFinite(value)) return "-";
  const favorable = invert ? value < 0 : value > 0;
  const unfavorable = invert ? value > 0 : value < 0;
  const className = favorable ? "trend-up" : unfavorable ? "trend-down" : "trend-flat";
  const symbol = favorable ? "▲" : unfavorable ? "▼" : "→";
  return `<span class="trend-marker ${className}">${symbol} ${signedPoint(value)}</span>`;
}

function markerYen(value, invert = false) {
  if (!Number.isFinite(value)) return "-";
  const favorable = invert ? value < 0 : value > 0;
  const unfavorable = invert ? value > 0 : value < 0;
  const className = favorable ? "trend-up" : unfavorable ? "trend-down" : "trend-flat";
  const symbol = favorable ? "▲" : unfavorable ? "▼" : "→";
  const sign = value > 0 ? "+" : "";
  return `<span class="trend-marker ${className}">${symbol} ${sign}${yen(value)}</span>`;
}

function profitYen(value) {
  const textValue = yen(value);
  return Number.isFinite(value) && value < 0 ? `<span class="bad">${textValue}</span>` : textValue;
}

function profitBadge(value) {
  if (!Number.isFinite(value)) return "-";
  return value >= 0 ? '<span class="pill">黒字</span>' : '<span class="pill danger-pill">赤字</span>';
}

function signedPoint(value) {
  if (!Number.isFinite(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(1)}pt`;
}

function signedNumber(value) {
  if (!Number.isFinite(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${Math.round(value).toLocaleString("ja-JP")}`;
}

function formatByType(value, type) {
  if (type === "yen") return yen(value);
  if (type === "ratio") return percent(value);
  return integer(value);
}

function tone(value) {
  if (!Number.isFinite(value)) return "";
  return value >= 0 ? "good" : "bad";
}

function averageNumber(values) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function maxBy(items, fn) {
  return items.reduce((best, item) => (fn(item) > fn(best) ? item : best), items[0]);
}

function minBy(items, fn) {
  return items.reduce((best, item) => (fn(item) < fn(best) ? item : best), items[0]);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
