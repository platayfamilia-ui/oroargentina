const { getQuote, JSON_HEADERS, PREFLIGHT_HEADERS } = require("../../lib/gold-quote-core");

exports.handler = async function handler(event) {
  if (event && event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: PREFLIGHT_HEADERS,
      body: ""
    };
  }

  const { statusCode, payload } = await getQuote();

  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload)
  };
};
