const $ = id => document.getElementById(id);
const fmtARS = n => "$ " + Math.round(n).toLocaleString("es-AR");
const fmtUSD = n => "USD " + n.toFixed(2);
const fmtUSDLong = n => "USD " + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const livePrices = { g24Usd: 0, g18Usd: 0, g24Ars: 0, g18Ars: 0 };
let lastUpdateAt = null;
let timestampInterval = null;

function getSpanishDayLabel(date = new Date()) {
  return ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"][date.getDay()];
}
function formatSpanishDate(date = new Date()) {
  return `${getSpanishDayLabel(date)} ${String(date.getDate()).padStart(2,"0")}`;
}

// --- Animación de conteo ---
function animateValue(el, targetNum, formatter) {
  if (!el) return;
  const prevNum = parseFloat(el.dataset.lastValue) || 0;
  el.dataset.lastValue = targetNum;
  el.classList.remove("loading-skeleton", "skeleton-dark");
  const duration = 650;
  const start = performance.now();
  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = formatter(prevNum + (targetNum - prevNum) * eased);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// --- Skeleton ---
const PRICE_IDS = ["hero_ars_18", "hero_usd_18", "hero_ars_24", "hero_usd_24"];
function showSkeletons() {
  PRICE_IDS.forEach(id => {
    const el = $(id);
    if (!el) return;
    el.textContent = "        ";
    el.classList.add("loading-skeleton");
  });
}
function hideSkeletons() {
  PRICE_IDS.forEach(id => {
    const el = $(id);
    if (el) {
      el.classList.remove("loading-skeleton");
      if (!el.textContent.trim()) el.textContent = "-";
    }
  });
}

// --- Timestamp ---
function updateTimestamp() {
  if (!lastUpdateAt) return;
  const secs = Math.floor((Date.now() - lastUpdateAt) / 1000);
  const text = secs < 60 ? "Actualizado ahora" : `Hace ${Math.floor(secs / 60)} min`;
  ["update_time", "update_time_24"].forEach(id => {
    const el = $(id); if (el) el.textContent = text;
  });
}
function setStatusDot(color) {
  ["status_dot", "status_dot_24"].forEach(id => {
    const dot = $(id); if (dot) dot.style.backgroundColor = color;
  });
}

// --- WhatsApp ---
function buildWhatsappMessage() {
  const today = new Date();
  return [
    "Soy *Matias* de Finanzas La Plata 😊","",
    `La cotización del oro hoy *${getSpanishDayLabel(today)} ${today.getDate()}* para la compra es:`, "",
    "*En Pesos Argentinos:*","",
    `➤ ORO 24k: *${livePrices.g24Ars ? fmtARS(livePrices.g24Ars) : "-"}* por gramo`,"",
    `➤ ORO 18k: *${livePrices.g18Ars ? fmtARS(livePrices.g18Ars) : "-"}* por gramo`,"",
    "🏢 *DIRECCIÓN EN LA PLATA*",
    "*(OFICINA CON SEGURIDAD)*","",
    "📍 Calle 17 e/ 32 y 33 N° 24, Piso 2.",
    "⚠️ *Únicamente con cita previa.*","",
    "Te dejo la página de la cotización oficial en vivo: https://www.oroargentina.com","",
    "*¿QUE TENÉS PARA VENDER?*",
    "*¿CUANTO PESA?*"
  ].join("\n");
}
function buildShortMessage() {
  return [
    "SOMOS LOS QUE MÁS PAGAMOS EN LA PLATA.",
    "",
    `➤ ORO 24k: *${livePrices.g24Ars ? fmtARS(livePrices.g24Ars) : "-"}* por gramo`,
    `➤ ORO 18k: *${livePrices.g18Ars ? fmtARS(livePrices.g18Ars) : "-"}* por gramo`,
    "",
    "✅ A partir de 10 gramos mejoramos el precio."
  ].join("\n");
}
async function copyShortMessage() {
  const msg = buildShortMessage();
  try { await navigator.clipboard.writeText(msg); }
  catch {
    const t = document.createElement("textarea");
    t.value = msg; t.setAttribute("readonly",""); t.style.cssText="position:absolute;left:-9999px";
    document.body.appendChild(t); t.select(); document.execCommand("copy"); document.body.removeChild(t);
  }
}
async function copyWhatsappMessage() {
  const msg = buildWhatsappMessage();
  try { await navigator.clipboard.writeText(msg); }
  catch {
    const t = document.createElement("textarea");
    t.value = msg; t.setAttribute("readonly",""); t.style.cssText="position:absolute;left:-9999px";
    document.body.appendChild(t); t.select(); document.execCommand("copy"); document.body.removeChild(t);
  }
}

// --- Hero cards (18K y 24K simultáneas) ---
function updateHeroCard() {
  const dateStr = `Fecha: ${formatSpanishDate(new Date())}`;
  ["hero_date", "hero_date_24"].forEach(id => { const el = $(id); if (el) el.textContent = dateStr; });
  if (livePrices.g18Ars) {
    animateValue($("hero_ars_18"), livePrices.g18Ars, fmtARS);
    animateValue($("hero_usd_18"), livePrices.g18Usd, fmtUSD);
    const n18 = $("news_price_18"); if (n18) n18.textContent = fmtARS(livePrices.g18Ars);
  }
  if (livePrices.g24Ars) {
    animateValue($("hero_ars_24"), livePrices.g24Ars, fmtARS);
    animateValue($("hero_usd_24"), livePrices.g24Usd, fmtUSD);
    const n24 = $("news_price_24"); if (n24) n24.textContent = fmtARS(livePrices.g24Ars);
  }
}

function updateMiniCalc(karat) {
  const gramsEl = $(`mini_grams_${karat}`);
  const arsEl   = $(`mini_result_ars_${karat}`);
  if (!gramsEl || !arsEl) return;
  const grams = parseFloat(gramsEl.value) || 1;
  if (grams <= 0) { arsEl.textContent = "-"; return; }
  gramsEl.value = grams;
  const unitArs = karat === 18 ? livePrices.g18Ars : livePrices.g24Ars;
  if (!unitArs) { arsEl.textContent = "-"; return; }
  arsEl.textContent = fmtARS(unitArs * grams);
}

function recalculateQuote() {
  const gramsEl = $("grams");
  const karatEl = $("karat");
  if (!gramsEl || !karatEl) return;
  const grams = parseFloat(gramsEl.value);
  if (!Number.isFinite(grams) || grams <= 0) {
    $("calc_ars").textContent = "-"; $("calc_usd").textContent = "-"; return;
  }
  const karat = karatEl.value;
  const unitArs = karat === "24" ? livePrices.g24Ars : livePrices.g18Ars;
  const unitUsd = karat === "24" ? livePrices.g24Usd : livePrices.g18Usd;
  if (!unitArs || !unitUsd) {
    $("calc_ars").textContent = "-"; $("calc_usd").textContent = "-"; return;
  }
  $("calc_ars").textContent = fmtARS(unitArs * grams);
  $("calc_usd").textContent = fmtUSD(unitUsd * grams);
}

// --- API ---
async function fetchJSON(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error("Error en " + url);
  return r.json();
}
async function fetchGoldQuote() {
  const urls = ["/api/gold-quote", "/.netlify/functions/gold-quote"];
  let lastError = null;
  for (const url of urls) {
    try { return await fetchJSON(url); } catch (err) { lastError = err; }
  }
  throw lastError || new Error("Error de API");
}

// --- Update principal ---
async function update() {
  showSkeletons();
  setStatusDot("rgba(120,80,0,0.3)");
  const updateTimeEl = $("update_time");
  ["update_time", "update_time_24"].forEach(id => { const el = $(id); if (el) el.textContent = "Cargando..."; });
  const errorWrap = $("error_wrap");
  if (errorWrap) errorWrap.classList.add("hidden");
  const btnRetry = $("btn_retry");
  if (btnRetry) btnRetry.disabled = true;
  try {
    const payload = await fetchGoldQuote();
    if (!payload.ok) throw new Error(payload.error || "Error de API");
    livePrices.g24Usd = payload.prices.g24_usd;
    livePrices.g18Usd = payload.prices.g18_usd;
    livePrices.g24Ars = payload.prices.g24_ars;
    livePrices.g18Ars = payload.prices.g18_ars;
    if ($("xau")) $("xau").textContent = `Cotización internacional del oro (24K): ${fmtUSDLong(payload.reference.xau_usd_oz)} / oz`;
    if ($("blue")) $("blue").textContent = `Dólar blue COMPRA: $ ${payload.reference.blue_compra_ars}`;
    if ($("ts")) $("ts").textContent = `Actualización: ${payload.reference.updated_at || "-"}`;
    updateHeroCard();
    recalculateQuote();
    updateMiniCalc(18);
    updateMiniCalc(24);
    if (payload.stale) {
      const h = Math.round((payload.stale_age_seconds || 0) / 3600);
      setStatusDot("#f59e0b");
      ["update_time", "update_time_24"].forEach(id => { const el = $(id); if (el) el.textContent = h > 0 ? `Datos de hace ${h}h` : "Sin actualizar"; });
    } else {
      lastUpdateAt = Date.now();
      setStatusDot("#22c55e");
      updateTimestamp();
      if (!timestampInterval) timestampInterval = setInterval(updateTimestamp, 60000);
    }
  } catch (e) {
    hideSkeletons();
    setStatusDot("#ef4444");
    ["update_time", "update_time_24"].forEach(id => { const el = $(id); if (el) el.textContent = "Error al cargar"; });
    if (!livePrices.g18Ars && errorWrap) {
      errorWrap.classList.remove("hidden");
      const errorMsg = $("error_msg");
      if (errorMsg) errorMsg.textContent = window.location.protocol === "file:"
        ? "Abrí el sitio con Vercel o Netlify para que funcione /api."
        : e.message;
    }
  } finally {
    if (btnRetry) btnRetry.disabled = false;
  }
}

// --- TradingView lazy load ---
let tvLoaded = false;
function initTradingView() {
  if (tvLoaded) return; tvLoaded = true;
  const script = document.createElement("script");
  script.src = "https://s3.tradingview.com/tv.js";
  script.onload = () => {
    if (!window.TradingView || typeof window.TradingView.widget !== "function") return;
    const ph = $("tv_placeholder"); if (ph) ph.remove();
    new TradingView.widget({
      autosize: true, symbol: "OANDA:XAUUSD", interval: "15",
      timezone: "America/Argentina/Buenos_Aires", theme: "dark", style: "3",
      hide_top_toolbar: true, hide_legend: true, hide_side_toolbar: true,
      hidevolume: true, allow_symbol_change: false, save_image: false,
      container_id: "tv_gold_min",
      overrides: {
        "scalesProperties.showLeftScale": false, "scalesProperties.showRightScale": false,
        "paneProperties.vertGridProperties.color": "#00000000",
        "paneProperties.horzGridProperties.color": "#00000000",
        "paneProperties.background": "#0f0f0f", "paneProperties.backgroundType": "solid"
      }
    });
  };
  document.head.appendChild(script);
}
const tvContainer = $("tv_gold_min");
if (tvContainer) {
  const tvObs = new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting)) { initTradingView(); tvObs.disconnect(); }
  }, { rootMargin: "200px 0px" });
  tvObs.observe(tvContainer);
}

// --- Tilt (aplica a todas las gold cards) ---
if (window.matchMedia("(pointer:fine)").matches) {
  document.querySelectorAll(".tilt-card").forEach(card => {
    card.addEventListener("mousemove", e => {
      const r = card.getBoundingClientRect();
      const rx = ((e.clientY - r.top) / r.height - 0.5) * -8;
      const ry = ((e.clientX - r.left) / r.width - 0.5) * 10;
      card.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg)`;
    });
    card.addEventListener("mouseleave", () => {
      card.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg)";
    });
  });
}

// --- Scroll reveal ---
const obs = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("is-visible"); obs.unobserve(e.target); } });
}, { threshold: 0.2 });
document.querySelectorAll(".soft-fade").forEach(el => obs.observe(el));

// --- Init y eventos ---
const karatSelect = $("karat");
if (karatSelect) karatSelect.onchange = recalculateQuote;
const gramsInput = $("grams");
if (gramsInput) gramsInput.oninput = recalculateQuote;
const mini18 = $("mini_grams_18");
if (mini18) mini18.oninput = () => updateMiniCalc(18);
const mini24 = $("mini_grams_24");
if (mini24) mini24.oninput = () => updateMiniCalc(24);
const flagCopy = $("flag_copy");
if (flagCopy) flagCopy.onclick = copyWhatsappMessage;
const flagCopy2 = $("flag_copy_2");
if (flagCopy2) flagCopy2.onclick = copyShortMessage;
const footerFlag = $("footer_flag_toggle");
if (footerFlag) {
  footerFlag.onclick = () => {
    const ref = $("ref_section");
    if (!ref) return;
    ref.classList.toggle("hidden");
    if (!ref.classList.contains("hidden")) ref.scrollIntoView({ behavior: "smooth", block: "start" });
  };
}
const btnRetry = $("btn_retry");
if (btnRetry) btnRetry.onclick = update;
const _bannerWrap = document.getElementById("loc_banner_wrap");
const _whereSell = $("where_sell_section");
if (_bannerWrap && _whereSell) _bannerWrap.after(_whereSell);

const btnWhereSell = $("btn_where_sell");
if (btnWhereSell) {
  btnWhereSell.onclick = () => {
    const section = $("where_sell_section");
    const chevron = $("btn_where_sell_chevron");
    if (!section) return;
    section.classList.toggle("hidden");
    if (chevron) chevron.style.transform = section.classList.contains("hidden") ? "" : "rotate(180deg)";
    if (!section.classList.contains("hidden")) section.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
}

update();
