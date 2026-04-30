function normalizeMVRV(mvrv) {
  if (mvrv < 1) return 0;
  if (mvrv >= 1 && mvrv < 2) return 25;
  if (mvrv >= 2 && mvrv < 3.5) return 60;
  if (mvrv >= 3.5) return 100;
  return 0;
}

function normalizeNUPL(nupl) {
  if (nupl < 0) return 0;
  if (nupl >= 0 && nupl < 0.25) return 20;
  if (nupl >= 0.25 && nupl < 0.5) return 45;
  if (nupl >= 0.5 && nupl < 0.75) return 75;
  if (nupl >= 0.75) return 100;
  return 0;
}

function normalizeSOPR(sopr) {
  if (sopr < 0.98) return 0;
  if (sopr >= 0.98 && sopr < 1.0) return 30;
  if (sopr >= 1.0 && sopr < 1.05) return 60;
  if (sopr >= 1.05) return 90;
  return 0;
}

function classifyRegime(score) {
  if (score < 15) return "Capitulation";
  if (score < 30) return "Bear";
  if (score < 50) return "Early Bull";
  if (score < 65) return "Mid Bull";
  if (score < 80) return "Late Bull";
  return "Distribution";
}

function classifyNUPLSentiment(nupl) {
  if (nupl < 0) return "Capitulation";
  if (nupl < 0.25) return "Hope";
  if (nupl < 0.5) return "Optimism";
  if (nupl < 0.75) return "Belief";
  return "Euphoria";
}

function classifyEntryRisk(score) {
  if (score < 30) return "Low";
  if (score < 50) return "Moderate";
  if (score < 70) return "High";
  return "Extreme";
}

function classifyLTHBehavior(nupl, mvrv) {
  if (nupl > 0.6 && mvrv > 3) return "Distributing";
  if (nupl < 0.3 && mvrv < 1.5) return "Accumulating";
  return "Neutral";
}

function getHistoricalContext(score, mvrv, nupl) {
  if (score >= 80 && mvrv >= 3.5)
    return "Similar to November 2021 cycle top readings — extreme caution warranted";
  if (score >= 65 && mvrv >= 2.5)
    return "Similar to October 2021 — strong bull market, approaching distribution zone";
  if (score >= 50 && mvrv >= 2)
    return "Similar to mid-2021 — healthy bull market with room to run";
  if (score >= 30 && mvrv >= 1)
    return "Similar to early 2021 — early bull market accumulation phase";
  if (score < 30 && mvrv < 1)
    return "Similar to late 2022 bear market bottom — historically strong accumulation zone";
  return "Transitional market phase — monitor closely";
}

function getImpliedPositioning(regime) {
  const map = {
    Capitulation: "Strong accumulation zone — historically best long-term entry",
    Bear: "Consider dollar-cost averaging — market still in downtrend",
    "Early Bull": "Accumulation phase — risk/reward favorable for long positions",
    "Mid Bull": "Hold core positions — trend intact but monitor for overheating",
    "Late Bull": "Consider reducing exposure — risk elevated, protect profits",
    Distribution:
      "High caution — reduce exposure significantly, preserve capital",
  };
  return map[regime] || "Monitor market conditions closely";
}

function computeCycleScore(mvrv, nupl, sopr) {
  const mvrvNorm = normalizeMVRV(mvrv);
  const nuplNorm = normalizeNUPL(nupl);
  const soprNorm = normalizeSOPR(sopr);

  const score = mvrvNorm * 0.4 + nuplNorm * 0.4 + soprNorm * 0.2;

  return {
    regimeScore: Math.round(score),
    cycleRegime: classifyRegime(score),
    nuplSentiment: classifyNUPLSentiment(nupl),
    entryRisk: classifyEntryRisk(score),
    lthBehavior: classifyLTHBehavior(nupl, mvrv),
    historicalContext: getHistoricalContext(score, mvrv, nupl),
    impliedPositioning: getImpliedPositioning(classifyRegime(score)),
  };
}

module.exports = { computeCycleScore };