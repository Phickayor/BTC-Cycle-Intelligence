const axios = require("axios");

const BASE_URL = "https://community-api.coinmetrics.io/v4";

const cache = {
  data: null,
  timestamp: null,
  TTL: 24 * 60 * 60 * 1000,
};

async function fetchBTCMetrics() {
  const now = Date.now();

  if (cache.data && cache.timestamp && now - cache.timestamp < cache.TTL) {
    console.log("Returning cached CoinMetrics data");
    return cache.data;
  }

  try {
    const response = await axios.get(`${BASE_URL}/timeseries/asset-metrics`, {
      params: {
        assets: "btc",
        metrics: "CapMVRVCur,NUPLCur,SoprCur",
        frequency: "1d",
        limit_per_asset: 2,
      },
      timeout: 15000,
    });

    const data = response.data?.data;

    if (!data || data.length === 0) {
      throw new Error("No data returned from CoinMetrics");
    }

    const latest = data[data.length - 1];

    const metrics = {
      mvrv: parseFloat(latest.CapMVRVCur) || null,
      nupl: parseFloat(latest.NUPLCur) || null,
      sopr: parseFloat(latest.SoprCur) || null,
      asOf: latest.time ? latest.time.split("T")[0] : new Date().toISOString().split("T")[0],
    };

    cache.data = metrics;
    cache.timestamp = now;

    return metrics;
  } catch (error) {
    console.error("CoinMetrics API error:", error.message);

    if (cache.data) {
      console.log("Returning stale cache due to API error");
      return { ...cache.data, stale: true };
    }

    throw new Error(`Failed to fetch on-chain metrics: ${error.message}`);
  }
}

module.exports = { fetchBTCMetrics };