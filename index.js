import express from "express";
import cors from "cors";
import crypto from "crypto";

const app = express();
app.use(cors());
app.use(express.json());

const BINANCE_BASE = "https://api.binance.com";

function sign(queryString, secret) {
  return crypto.createHmac("sha256", secret).update(queryString).digest("hex");
}

// Health check
app.get("/", (req, res) => {
  res.json({ status: "Binance proxy running ✅" });
});

// Precios
app.get("/api/ticker/price", async (req, res) => {
  try {
    const apiKey = process.env.BINANCE_API_KEY;
    if (!apiKey) return res.status(503).json({ error: "Missing BINANCE_API_KEY" });

    const symbol = req.query.symbol;
    const url = `${BINANCE_BASE}/api/v3/ticker/price${symbol ? `?symbol=${symbol}` : ""}`;

    const response = await fetch(url, {
      headers: { "X-MBX-APIKEY": apiKey }
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cambio 24h
app.get("/api/ticker/24hr", async (req, res) => {
  try {
    const apiKey = process.env.BINANCE_API_KEY;
    if (!apiKey) return res.status(503).json({ error: "Missing BINANCE_API_KEY" });

    const symbol = req.query.symbol;
    const symbols = req.query.symbols;
    let url = `${BINANCE_BASE}/api/v3/ticker/24hr`;
    if (symbol) url += `?symbol=${symbol}`;
    else if (symbols) url += `?symbols=${encodeURIComponent(symbols)}`;

    const response = await fetch(url, {
      headers: { "X-MBX-APIKEY": apiKey }
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Portafolio
app.get("/api/account", async (req, res) => {
  try {
    const apiKey = process.env.BINANCE_API_KEY;
    const apiSecret = process.env.BINANCE_SECRET_KEY;
    if (!apiKey || !apiSecret) return res.status(503).json({ error: "Missing API credentials" });

    const timestamp = Date.now();
    const qs = `timestamp=${timestamp}&recvWindow=10000`;
    const signature = sign(qs, apiSecret);
    const url = `${BINANCE_BASE}/api/v3/account?${qs}&signature=${signature}`;

    const response = await fetch(url, {
      headers: { "X-MBX-APIKEY": apiKey }
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Binance proxy corriendo en puerto ${PORT}`);
});
