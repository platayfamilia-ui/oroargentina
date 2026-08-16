const { getQuote, JSON_HEADERS, PREFLIGHT_HEADERS } = require("../lib/gold-quote-core");

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
