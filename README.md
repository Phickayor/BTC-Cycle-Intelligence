# BTC Cycle Intelligence

An MCP (Model Context Protocol) server that delivers 
a single structured Bitcoin market cycle verdict — 
combining MVRV, exchange flow pressure and 30-day 
ROI into one composite regime score and classification.

Built for the Context Protocol marketplace. Replaces 
the need for a Glassnode $799/month subscription for 
retail BTC macro investors making pre-allocation 
decisions.

## What It Does

Answers the one question BTC macro investors ask 
before sizing a position:

> "Where are we in the BTC cycle right now, early bull, late bull, or bear territory?"

## Features

- MVRV ratio with cycle regime classification
- Exchange flow pressure (accumulation vs distribution)
- Composite cycle score 0-100
- Regime classification: Early Bull, Mid Bull, 
  Late Bull, Distribution, Bear, Capitulation
- Entry risk level: Low, Moderate, High, Extreme
- LTH behavior: Accumulating, Distributing, Neutral
- Historical context vs prior cycle peaks
- Implied positioning guidance
- Data freshness asOf field with confidence score

## Tools

| Tool | Description |
|---|---|
| `get_btc_cycle_regime` | Full cycle verdict combining all signals |
| `get_lth_behavior` | LTH accumulating or distributing |
| `get_entry_risk` | High or low risk entry point |
| `compare_to_2021_top` | Compare to 2021 cycle top |
| `get_nupl_sentiment` | Market sentiment zone |

## Example Response

```json
{
  "mvrv": 1.41,
  "price": 75795,
  "roi30d": 13.7,
  "exchangePressure": "Outflow",
  "netExchangeFlow": -1245.32,
  "regimeScore": 49,
  "cycleRegime": "Early Bull",
  "entryRisk": "Moderate",
  "lthBehavior": "Accumulating",
  "historicalContext": "Similar to early 2021 - early bull accumulation",
  "impliedPositioning": "Accumulation phase - risk/reward favorable",
  "sourceRefs": ["CoinMetrics Community API"],
  "asOf": "2026-04-29",
  "confidence": 0.88,
  "stale": false
}

## Data Sources

All data is fetched from the CoinMetrics Community 
API — completely free, no authentication required.

| Metric | CoinMetrics Field |
|---|---|
| MVRV | CapMVRVCur |
| Exchange Inflow | FlowInExNtv |
| Exchange Outflow | FlowOutExNtv |
| Exchange Supply | SplyExNtv |
| BTC Price | PriceUSD |
| 30-day ROI | ROI30d |
| Active Addresses | AdrActCnt |


## Tech Stack

- Node.js + Express
- CoinMetrics Community API (free)
- Context Protocol SDK (@ctxprotocol/sdk)
- In-memory caching (4-hour TTL)

## Local Development

```bash
# Clone the repo
git clone https://github.com/Phickayor/BTC-Cycle-Intelligence.git
cd BTC-Cycle-Intelligence

# Install dependencies
npm install

# Create .env file
echo "PORT=3000" > .env

# Start the server
npm start
```

Test locally:

```powershell
$headers = @{
  "Content-Type" = "application/json"
  "Accept" = "application/json, text/event-stream"
}
$body = '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
$r = Invoke-WebRequest -Uri "http://localhost:3000/mcp" `
  -Method POST -Headers $headers -Body $body `
  -UseBasicParsing -TimeoutSec 30
Write-Output $r.Content
```
