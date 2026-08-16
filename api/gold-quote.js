const https = require("https");

const PROVIDER_FAILURE_THRESHOLD = 3;
const PROVIDER_COOLDOWN_MS = 5 * 60 * 1000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const RETRY_ATTEMPTS = 2;
const RETRY_DELAY_MS = 250;

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "Pragma": "no-cache"
};

const PREFLIGHT_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const runtimeState = {
  providerHealth: {},
  lastSuccess: null
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function fetchText(url, acceptHeader) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": "oroargentina-vercel-function/1.0",
          "Accept": acceptHeader || "application/json, text/plain, text/csv;q=0.9, */*;q=0.8"
        },
        timeout: 10000
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(buildError(`Error al consultar ${url}: ${res.statusCode}`, String(res.statusCode)));
          }
          resolve(raw);
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(buildError(`Timeout al consultar ${url}`, "TIMEOUT"));
    });
    req.on("error", reject);
  });
}

async function fetchJSON(url) {
  const raw = await fetchText(url, "application/json, text/plain, */*;q=0.8");
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Respuesta invalida en ${url}`);
  }
}

function parseStooqXauUsdClose(csvText) {
  const line = String(csvText || "").trim().split(/\r?\n/)[0] || "";
  const columns = line.split(",");
  if (columns.length < 7) {
    throw new Error("Respuesta invalida al leer cotizacion de oro");
  }

  const close = Number(columns[6]);
  if (!Number.isFinite(close) || close <= 0) {
    throw new Error("Cotizacion de oro invalida");
  }

  return close;
}

function isProviderCoolingDown(name) {
  const state = runtimeState.providerHealth[name];
  if (!state || !state.cooldownUntil) {
    return false;
  }
  return state.cooldownUntil > Date.now();
}

function markProviderSuccess(name) {
  runtimeState.providerHealth[name] = {
    fails: 0,
    cooldownUntil: 0
  };
}

function markProviderFailure(name) {
  const current = runtimeState.providerHealth[name] || { fails: 0, cooldownUntil: 0 };
  const fails = current.fails + 1;
  const cooldownUntil =
    fails >= PROVIDER_FAILURE_THRESHOLD ? Date.now() + PROVIDER_COOLDOWN_MS : current.cooldownUntil || 0;

  runtimeState.providerHealth[name] = {
    fails,
    cooldownUntil
  };
}

async function withRetry(fn) {
  let lastError = null;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < RETRY_ATTEMPTS) {
        await wait(RETRY_DELAY_MS * attempt);
      }
    }
  }
  throw lastError || new Error("Error desconocido");
}

async function getGoldPriceUsdOz() {
  const providers = [
    {
      name: "stooq",
      get: async () => {
        const text = await fetchText("https://stooq.com/q/l/?s=xauusd&i=d", "text/plain, text/csv, */*;q=0.8");
        return parseStooqXauUsdClose(text);
      }
    },
    {
      name: "gold-api",
      get: async () => {
        const data = await fetchJSON("https://api.gold-api.com/price/XAU");
        const price = Number(data && data.price);
        if (!Number.isFinite(price) || price <= 0) {
          throw new Error("Cotizacion de oro invalida");
        }
        return price;
      }
    }
  ];

  const errors = [];
  for (const provider of providers) {
    if (isProviderCoolingDown(provider.name)) {
      errors.push(`${provider.name}: en cooldown`);
      continue;
    }

    try {
      const value = await withRetry(provider.get);
      markProviderSuccess(provider.name);
      return {
        value,
        source: provider.name
      };
    } catch (error) {
      markProviderFailure(provider.name);
      errors.push(`${provider.name}: ${error.message}`);
    }
  }

  throw new Error(`No se pudo obtener el oro (${errors.join(" | ")})`);
}

async function getBlueRateArs() {
  const providers = [
    {
      name: "dolarapi",
      get: async () => {
        const data = await fetchJSON("https://dolarapi.com/v1/dolares/blue");
        const buy = Number(data && data.compra);
        if (!Number.isFinite(buy) || buy <= 0) {
          throw new Error("Cotizacion blue invalida");
        }
        return {
          value: buy,
          updatedAt: data.fechaActualizacion || null
        };
      }
    },
    {
      name: "bluelytics",
      get: async () => {
        const data = await fetchJSON("https://api.bluelytics.com.ar/v2/latest");
        const buy = Number(data && data.blue && data.blue.value_buy);
        if (!Number.isFinite(buy) || buy <= 0) {
          throw new Error("Cotizacion blue invalida");
        }
        return {
          value: buy,
          updatedAt: null
        };
      }
    }
  ];

  const errors = [];
  for (const provider of providers) {
    if (isProviderCoolingDown(provider.name)) {
      errors.push(`${provider.name}: en cooldown`);
      continue;
    }

    try {
      const result = await withRetry(provider.get);
      markProviderSuccess(provider.name);
      return {
        value: result.value,
        updatedAt: result.updatedAt,
        source: provider.name
      };
    } catch (error) {
      markProviderFailure(provider.name);
      errors.push(`${provider.name}: ${error.message}`);
    }
  }

  throw new Error(`No se pudo obtener dolar blue (${errors.join(" | ")})`);
}

function buildQuoteResponse(xauUsdOz, usdArs, updatedAt, sources, stale, staleAgeMs) {
  const troyOunceToGrams = 31.1034768;
  const discount = 0.7;
  const k18Purity = 0.75;

  const g24UsdCompra = (xauUsdOz / troyOunceToGrams) * discount;
  const g18UsdCompra = g24UsdCompra * k18Purity;
  const g24ArsCompra = g24UsdCompra * usdArs;
  const g18ArsCompra = g18UsdCompra * usdArs;

  return {
    ok: true,
    stale,
    stale_age_seconds: stale ? Math.floor(staleAgeMs / 1000) : 0,
    prices: {
      g24_ars: g24ArsCompra,
      g24_usd: g24UsdCompra,
      g18_ars: g18ArsCompra,
      g18_usd: g18UsdCompra
    },
    reference: {
      xau_usd_oz: xauUsdOz,
      blue_compra_ars: usdArs,
      updated_at: updatedAt || null,
      sources
    }
  };
}

async function getQuote() {
  try {
    const [gold, blue] = await Promise.all([getGoldPriceUsdOz(), getBlueRateArs()]);
    const payload = buildQuoteResponse(
      gold.value,
      blue.value,
      blue.updatedAt,
      { gold: gold.source, blue: blue.source },
      false,
      0
    );

    runtimeState.lastSuccess = {
      payload,
      createdAt: Date.now()
    };

    return { statusCode: 200, payload };
  } catch (error) {
    const hasCachedValue =
      runtimeState.lastSuccess &&
      runtimeState.lastSuccess.createdAt &&
      Date.now() - runtimeState.lastSuccess.createdAt <= CACHE_TTL_MS;

    if (hasCachedValue) {
      const staleAgeMs = Date.now() - runtimeState.lastSuccess.createdAt;
      return {
        statusCode: 200,
        payload: {
          ...runtimeState.lastSuccess.payload,
          stale: true,
          stale_age_seconds: Math.floor(staleAgeMs / 1000),
          fallback_reason: error.message || "Error externo"
        }
      };
    }

    return {
      statusCode: 503,
      payload: {
        ok: false,
        error: error.message || "Error interno"
      }
    };
  }
}

function applyHeaders(res, headers) {
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    applyHeaders(res, PREFLIGHT_HEADERS);
    res.statusCode = 204;
    return res.end();
  }

  const { statusCode, payload } = await getQuote();
  applyHeaders(res, JSON_HEADERS);
  res.statusCode = statusCode;
  res.end(JSON.stringify(payload));
};
