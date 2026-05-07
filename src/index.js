require("dotenv").config();

const express = require("express");
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
    lthBehavior: { type: "string", description: "Long-term holder behavior" },
    historicalContext: { type: "string", description: "Historical cycle comparison" },
    impliedPositioning: { type: "string", description: "Implied positioning guidance" },
    sourceRefs: { type: "array", items: { type: "string" } },
    asOf: { type: "string", description: "Data freshness date" },
    confidence: { type: "number", description: "Confidence score 0-1" },
    stale: { type: "boolean", description: "Whether data is from stale cache" },
  },
  required: ["mvrv", "regimeScore", "cycleRegime", "entryRisk", "asOf"],
};

const INPUT_SCHEMA = { type: "object", properties: {}, required: [] };

const TOOLS = [
  {
    name: "get_btc_cycle_regime",
    description: "Returns the current Bitcoin market cycle regime using MVRV, exchange flows, and 30-day ROI. Answers: Where are we in the BTC cycle right now?",
    inputSchema: INPUT_SCHEMA,
    outputSchema: OUTPUT_SCHEMA,
  },
  {
    name: "get_lth_behavior",
    description: "Analyzes whether long-term Bitcoin holders are accumulating or distributing based on MVRV and exchange flow data.",
    inputSchema: INPUT_SCHEMA,
    outputSchema: OUTPUT_SCHEMA,
  },
  {
    name: "get_entry_risk",
    description: "Returns whether current BTC on-chain metrics suggest a high or low risk entry point.",
    inputSchema: INPUT_SCHEMA,
    outputSchema: OUTPUT_SCHEMA,
  },
  {
    name: "compare_to_2021_top",
    description: "Compares current BTC on-chain metrics to the 2021 cycle top readings. Returns side-by-side current vs November 2021 peak values including MVRV, regime score, exchange pressure, and cycle classification.",
    inputSchema: INPUT_SCHEMA,
    outputSchema: {
      type: "object",
      properties: {
        mvrv: { type: "number", description: "Current MVRV ratio" },
        regimeScore: { type: "number", description: "Current composite cycle score 0-100" },
        cycleRegime: { type: "string", description: "Current BTC cycle regime" },
        entryRisk: { type: "string", description: "Current entry risk level" },
        top2021: {
          type: "object",
          description: "Actual November 2021 cycle top metrics",
          properties: {
            mvrv: { type: "number", description: "MVRV at Nov 2021 peak (3.96)" },
            regimeScore: { type: "number", description: "Regime score at Nov 2021 peak (94)" },
            cycleRegime: { type: "string", description: "Cycle regime at Nov 2021 peak" },
            entryRisk: { type: "string", description: "Entry risk at Nov 2021 peak" },
            exchangePressure: { type: "string", description: "Exchange pressure at Nov 2021 peak" },
            lthBehavior: { type: "string", description: "LTH behavior at Nov 2021 peak" },
            date: { type: "string", description: "Date of Nov 2021 cycle top" }
          }
        },
        mvrvDelta: { type: "number", description: "% difference between current and 2021 top MVRV" },
        scoreDelta: { type: "number", description: "Difference between current and 2021 top regime score" },
        verdict: { type: "string", description: "Comparative verdict vs 2021 top" },
        asOf: { type: "string", description: "Data freshness date" },
        confidence: { type: "number", description: "Confidence score 0-1" }
      },
      required: ["mvrv", "regimeScore", "cycleRegime", "top2021", "verdict", "asOf"]
    },
  },
  {
    name: "get_nupl_sentiment",
    description: "Returns current Bitcoin market sentiment using MVRV and exchange flow as proxy indicators.",
    inputSchema: INPUT_SCHEMA,
    outputSchema: OUTPUT_SCHEMA,
  },
];

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

function formatResponse(toolName, data) {
  const sentiment =
    data.regimeScore >= 80 ? "Euphoria" :
    data.regimeScore >= 65 ? "Belief" :
    data.regimeScore >= 50 ? "Optimism" :
    data.regimeScore >= 30 ? "Hope" : "Capitulation";

  switch (toolName) {
    case "get_btc_cycle_regime":
      return `BTC Cycle Regime: ${data.cycleRegime} (Score: ${data.regimeScore}/100)\nMVRV: ${data.mvrv?.toFixed(2)} | Price: $${data.price?.toFixed(0)} | ROI 30d: ${(data.roi30d * 100)?.toFixed(1)}%\nExchange Pressure: ${data.exchangePressure}\nEntry Risk: ${data.entryRisk}\nLTH Behavior: ${data.lthBehavior}\n${data.historicalContext}\nPositioning: ${data.impliedPositioning}\nData as of: ${data.asOf}`;
    case "get_lth_behavior":
      return `LTH Behavior: ${data.lthBehavior}\nExchange Pressure: ${data.exchangePressure}\nNet Exchange Flow: ${data.netExchangeFlow?.toFixed(2)} BTC\nMVRV: ${data.mvrv?.toFixed(2)}\nRegime: ${data.cycleRegime}\n${data.impliedPositioning}`;
    case "get_entry_risk":
      return `Entry Risk: ${data.entryRisk}\nScore: ${data.regimeScore}/100\nMVRV: ${data.mvrv?.toFixed(2)}\nROI 30d: ${(data.roi30d * 100)?.toFixed(1)}%\nExchange Pressure: ${data.exchangePressure}\n${data.historicalContext}\n${data.impliedPositioning}`;
    case "compare_to_2021_top":
      return `Current vs 2021 Cycle Top:\nCurrent MVRV: ${data.mvrv?.toFixed(2)} vs 2021 Top: 3.96\nCurrent Score: ${data.regimeScore}/100 vs 2021 Top: 94/100\nCurrent Regime: ${data.cycleRegime} vs 2021: Distribution\nCurrent Exchange Pressure: ${data.exchangePressure}\n${data.historicalContext}\nVerdict: ${data.mvrv < 3.96 ? `Current MVRV is ${((1 - data.mvrv/3.96)*100).toFixed(0)}% below the 2021 top - not yet at cycle peak levels` : "Current MVRV has exceeded 2021 top - extreme caution warranted"}`;
    case "get_nupl_sentiment":
      return `Market Sentiment: ${sentiment}\nRegime Score: ${data.regimeScore}/100\nMVRV: ${data.mvrv?.toFixed(2)}\nExchange Pressure: ${data.exchangePressure}\nROI 30d: ${(data.roi30d * 100)?.toFixed(1)}%\nRegime: ${data.cycleRegime}\nRisk: ${data.entryRisk}`;
    default:
      return `BTC Cycle Regime: ${data.cycleRegime} (Score: ${data.regimeScore}/100)`;
  }
}

// Health check routes - keeps Railway awake
app.get("/", (req, res) => {
  res.json({ status: "ok", name: "btc-cycle-intelligence", version: "1.0.0" });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.post("/mcp", async (req, res) => {
  const body = req.body;

  res.setHeader("Content-Type", "text/event-stream");

  const sendEvent = (data) => {
    res.write(`event: message\ndata: ${JSON.stringify(data)}\n\n`);
    res.end();
  };

  try {
    if (body.method === "initialize") {
      return sendEvent({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "btc-cycle-intelligence", version: "1.0.0" }
        }
      });
    }

    if (body.method === "tools/list") {
      return sendEvent({
        jsonrpc: "2.0",
        id: body.id,
        result: { tools: TOOLS }
      });
    }

    if (body.method === "tools/call") {
      const data = await getCycleData();
      const text = formatResponse(body.params?.name, data);

      let structuredContent = data;

      if (body.params?.name === "get_nupl_sentiment") {
        structuredContent = {
          ...data,
          sentiment: data.regimeScore >= 80 ? "Euphoria" :
            data.regimeScore >= 65 ? "Belief" :
            data.regimeScore >= 50 ? "Optimism" :
            data.regimeScore >= 30 ? "Hope" : "Capitulation"
        };
      }

      if (body.params?.name === "compare_to_2021_top") {
        const mvrvDelta = data.mvrv
          ? parseFloat(((data.mvrv - 3.96) / 3.96 * 100).toFixed(1))
          : null;
        structuredContent = {
          ...data,
          top2021: {
            mvrv: 3.96,
            regimeScore: 94,
            cycleRegime: "Distribution",
            entryRisk: "Extreme",
            exchangePressure: "Inflow",
            lthBehavior: "Distributing",
            date: "2021-11-10"
          },
          mvrvDelta,
          scoreDelta: data.regimeScore - 94,
          verdict: data.mvrv < 3.96
            ? `Current MVRV (${data.mvrv?.toFixed(2)}) is ${((1 - data.mvrv/3.96)*100).toFixed(0)}% below the 2021 top of 3.96 - not yet at cycle peak levels`
            : `Current MVRV (${data.mvrv?.toFixed(2)}) has exceeded the 2021 top of 3.96 - extreme caution warranted`
        };
      }

      return sendEvent({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          structuredContent,
          content: [{ type: "text", text }]
        }
      });
    }

    sendEvent({ jsonrpc: "2.0", id: body.id, result: {} });

  } catch (error) {
    sendEvent({
      jsonrpc: "2.0",
      id: body.id,
      error: { code: -32603, message: error.message }
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`BTC Cycle Intelligence MCP Server running on port ${PORT}`);
  fetchBTCMetrics()
    .then(() => console.log("Cache pre-warmed successfully"))
    .catch((err) => console.log("Cache pre-warm failed:", err.message));
});

module.exports = app;
