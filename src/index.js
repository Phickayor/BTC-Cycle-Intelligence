require("dotenv").config();

const express = require("express");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { createContextMiddleware } = require("@ctxprotocol/sdk");
const axios = require("axios");

const app = express();
app.use(express.json());
app.use(createContextMiddleware());

const cache = { data: null, timestamp: null, TTL: 4 * 60 * 60 * 1000 };

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    mvrv: { type: "number", description: "Market Value to Realized Value ratio" },
    price: { type: "number", description: "Current BTC price in USD" },
    roi30d: { type: "number", description: "30-day Return on Investment" },
    exchangePressure: { type: "string", description: "Exchange flow direction: Inflow or Outflow" },
    netExchangeFlow: { type: "number", description: "Net exchange flow in BTC" },
    splyEx: { type: "number", description: "BTC supply held on exchanges" },
    adrAct: { type: "number", description: "Number of active addresses" },
    regimeScore: { type: "number", description: "Composite cycle score 0-100" },
    cycleRegime: { type: "string", description: "Current BTC cycle regime classification" },
    entryRisk: { type: "string", description: "Entry risk level: Low, Moderate, High, or Extreme" },
    lthBehavior: { type: "string", description: "Long-term holder behavior: Accumulating, Distributing, or Neutral" },
    historicalContext: { type: "string", description: "Historical cycle comparison" },
    impliedPositioning: { type: "string", description: "Implied positioning guidance" },
    sourceRefs: { type: "array", items: { type: "string" }, description: "Data source references" },
    asOf: { type: "string", description: "Data freshness date" },
    confidence: { type: "number", description: "Confidence score 0-1" },
    stale: { type: "boolean", description: "Whether data is from stale cache" },
  },
  required: ["mvrv", "regimeScore", "cycleRegime", "entryRisk", "asOf"],
};

async function fetchBTCMetrics() {
  const now = Date.now();
  if (cache.data && cache.timestamp && now - cache.timestamp < cache.TTL) {
    return cache.data;
  }
  try {
    const response = await axios.get("https://community-api.coinmetrics.io/v4/timeseries/asset-metrics", {
      params: {
        assets: "btc",
        metrics: "CapMVRVCur,FlowInExNtv,FlowOutExNtv,SplyExNtv,PriceUSD,ROI30d,AdrActCnt",
        frequency: "1d",
        limit_per_asset: "1",
      },
      timeout: 15000,
    });
    const data = response.data?.data;
    if (!data || data.length === 0) throw new Error("No data returned");
    const latest = data[data.length - 1];

    const mvrv = parseFloat(latest.CapMVRVCur) || null;
    const flowIn = parseFloat(latest.FlowInExNtv) || null;
    const flowOut = parseFloat(latest.FlowOutExNtv) || null;
    const splyEx = parseFloat(latest.SplyExNtv) || null;
    const price = parseFloat(latest.PriceUSD) || null;
    const roi30d = parseFloat(latest.ROI30d) || null;
    const adrAct = parseFloat(latest.AdrActCnt) || null;

    const metrics = {
      mvrv, flowIn, flowOut,
      netExchangeFlow: flowIn && flowOut ? flowIn - flowOut : null,
      exchangePressure: flowIn && flowOut ? (flowIn > flowOut ? "Inflow" : "Outflow") : "Unknown",
      splyEx, price, roi30d, adrAct,
      asOf: latest.time ? latest.time.split("T")[0] : new Date().toISOString().split("T")[0],
    };

    cache.data = metrics;
    cache.timestamp = now;
    return metrics;
  } catch (error) {
    if (cache.data) return { ...cache.data, stale: true };
    throw new Error("Failed to fetch metrics: " + error.message);
  }
}

function computeCycleScore(mvrv, roi30d, exchangePressure) {
  const mvrvNorm = !mvrv ? 50 : mvrv < 1 ? 0 : mvrv < 2 ? 25 : mvrv < 3.5 ? 60 : 100;
  const roiNorm = !roi30d ? 50 : roi30d < -0.2 ? 0 : roi30d < 0 ? 20 : roi30d < 0.2 ? 50 : roi30d < 0.5 ? 70 : 100;
  const flowNorm = exchangePressure === "Outflow" ? 30 : exchangePressure === "Inflow" ? 70 : 50;
  const score = Math.round(mvrvNorm * 0.5 + roiNorm * 0.3 + flowNorm * 0.2);

  const cycleRegime =
    score < 15 ? "Capitulation" :
    score < 30 ? "Bear" :
    score < 50 ? "Early Bull" :
    score < 65 ? "Mid Bull" :
    score < 80 ? "Late Bull" : "Distribution";

  const entryRisk =
    score < 30 ? "Low" :
    score < 50 ? "Moderate" :
    score < 70 ? "High" : "Extreme";

  const lthBehavior =
    exchangePressure === "Outflow" && mvrv < 2 ? "Accumulating" :
    exchangePressure === "Inflow" && mvrv > 3 ? "Distributing" : "Neutral";

  const historicalContext =
    score >= 80 ? "Similar to Nov 2021 cycle top - extreme caution" :
    score >= 65 ? "Similar to Oct 2021 - late stage bull" :
    score >= 50 ? "Similar to mid-2021 - healthy bull market" :
    score >= 30 ? "Similar to early 2021 - early bull accumulation" :
    "Similar to late 2022 bear bottom - strong accumulation zone";

  const impliedPositioning =
    cycleRegime === "Distribution" ? "Reduce exposure significantly" :
    cycleRegime === "Late Bull" ? "Consider reducing exposure, protect profits" :
    cycleRegime === "Mid Bull" ? "Hold core positions, trend intact" :
    cycleRegime === "Early Bull" ? "Accumulation phase - risk/reward favorable" :
    "Strong accumulation zone - historically best long-term entry";

  return { regimeScore: score, cycleRegime, entryRisk, lthBehavior, historicalContext, impliedPositioning };
}

async function getCycleData() {
  const metrics = await fetchBTCMetrics();
  const scoring = computeCycleScore(metrics.mvrv, metrics.roi30d, metrics.exchangePressure);
  return {
    mvrv: metrics.mvrv,
    price: metrics.price,
    roi30d: metrics.roi30d,
    exchangePressure: metrics.exchangePressure,
    netExchangeFlow: metrics.netExchangeFlow,
    splyEx: metrics.splyEx,
    adrAct: metrics.adrAct,
    ...scoring,
    sourceRefs: ["CoinMetrics Community API - community-api.coinmetrics.io"],
    asOf: metrics.asOf,
    confidence: metrics.stale ? 0.6 : 0.88,
    stale: metrics.stale || false,
  };
}

function createServer() {
  const server = new McpServer({ name: "btc-cycle-intelligence", version: "1.0.0" });
  const inputSchema = {};

  server.tool("get_btc_cycle_regime",
    "Returns the current Bitcoin market cycle regime using MVRV, exchange flows, and 30-day ROI. Answers: Where are we in the BTC cycle right now?",
    inputSchema,
    async () => {
      const data = await getCycleData();
      return {
        structuredContent: data,
        content: [{ type: "text", text: `BTC Cycle Regime: ${data.cycleRegime} (Score: ${data.regimeScore}/100)\nMVRV: ${data.mvrv?.toFixed(2)} | Price: $${data.price?.toFixed(0)} | ROI 30d: ${(data.roi30d * 100)?.toFixed(1)}%\nExchange Pressure: ${data.exchangePressure}\nEntry Risk: ${data.entryRisk}\nLTH Behavior: ${data.lthBehavior}\n${data.historicalContext}\nPositioning: ${data.impliedPositioning}\nData as of: ${data.asOf}` }],
      };
    }
  );

  server.tool("get_lth_behavior",
    "Analyzes whether long-term Bitcoin holders are accumulating or distributing based on MVRV and exchange flow data.",
    inputSchema,
    async () => {
      const data = await getCycleData();
      return {
        structuredContent: data,
        content: [{ type: "text", text: `LTH Behavior: ${data.lthBehavior}\nExchange Pressure: ${data.exchangePressure}\nNet Exchange Flow: ${data.netExchangeFlow?.toFixed(2)} BTC\nMVRV: ${data.mvrv?.toFixed(2)}\nRegime: ${data.cycleRegime}\n${data.impliedPositioning}` }],
      };
    }
  );

  server.tool("get_entry_risk",
    "Returns whether current BTC on-chain metrics suggest a high or low risk entry point.",
    inputSchema,
    async () => {
      const data = await getCycleData();
      return {
        structuredContent: data,
        content: [{ type: "text", text: `Entry Risk: ${data.entryRisk}\nScore: ${data.regimeScore}/100\nMVRV: ${data.mvrv?.toFixed(2)}\nROI 30d: ${(data.roi30d * 100)?.toFixed(1)}%\nExchange Pressure: ${data.exchangePressure}\n${data.historicalContext}\n${data.impliedPositioning}` }],
      };
    }
  );

  server.tool("compare_to_2021_top",
    "Compares current BTC on-chain metrics to the 2021 cycle top readings.",
    inputSchema,
    async () => {
      const data = await getCycleData();
      return {
        structuredContent: data,
        content: [{ type: "text", text: `Current vs 2021 Cycle Top:\nCurrent MVRV: ${data.mvrv?.toFixed(2)} vs 2021 Top: 8.01\nCurrent Score: ${data.regimeScore}/100 vs 2021 Top: 94/100\nCurrent Regime: ${data.cycleRegime} vs 2021: Distribution\nCurrent Exchange Pressure: ${data.exchangePressure}\n${data.historicalContext}` }],
      };
    }
  );

  server.tool("get_nupl_sentiment",
    "Returns current Bitcoin market sentiment using MVRV and exchange flow as proxy indicators.",
    inputSchema,
    async () => {
      const data = await getCycleData();
      const sentiment =
        data.regimeScore >= 80 ? "Euphoria" :
        data.regimeScore >= 65 ? "Belief" :
        data.regimeScore >= 50 ? "Optimism" :
        data.regimeScore >= 30 ? "Hope" : "Capitulation";
      return {
        structuredContent: { ...data, sentiment },
        content: [{ type: "text", text: `Market Sentiment: ${sentiment}\nRegime Score: ${data.regimeScore}/100\nMVRV: ${data.mvrv?.toFixed(2)}\nExchange Pressure: ${data.exchangePressure}\nROI 30d: ${(data.roi30d * 100)?.toFixed(1)}%\nRegime: ${data.cycleRegime}\nRisk: ${data.entryRisk}` }],
      };
    }
  );

  return server;
}

app.post("/mcp", async (req, res) => {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`BTC Cycle Intelligence MCP Server running on port ${PORT}`));
module.exports = app;