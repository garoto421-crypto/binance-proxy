const express = require('express');
const crypto  = require('crypto');
const https   = require('https');
const app     = express();

app.use(express.json());

// ── CORS — permite acceso desde el dashboard local ──────────────
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin',  '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const API_KEY    = process.env.BINANCE_API_KEY;
const SECRET_KEY = process.env.BINANCE_SECRET_KEY;
const BASE_URL   = 'https://api.binance.com';

// ── Firma HMAC-SHA256 para endpoints autenticados ───────────────
function sign(queryString) {
  return crypto.createHmac('sha256', SECRET_KEY).update(queryString).digest('hex');
}

// ── Petición autenticada a Binance ──────────────────────────────
function binanceRequest(method, path, params = {}) {
  return new Promise((resolve, reject) => {
    params.timestamp = Date.now();
    params.recvWindow = 5000;
    const qs        = new URLSearchParams(params).toString();
    const signature = sign(qs);
    const fullPath  = `${path}?${qs}&signature=${signature}`;

    const options = {
      hostname: 'api.binance.com',
      path:     fullPath,
      method:   method,
      headers:  { 'X-MBX-APIKEY': API_KEY, 'Content-Type': 'application/json' }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('Respuesta inválida de Binance')); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ══════════════════════════════════════════════════════════════
// ENDPOINTS DE LECTURA (ya existían)
// ══════════════════════════════════════════════════════════════

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Portafolio
app.get('/api/account', async (req, res) => {
  try {
    const data = await binanceRequest('GET', '/api/v3/account');
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Precios en tiempo real
app.get('/api/ticker/price', async (req, res) => {
  try {
    const data = await binanceRequest('GET', '/api/v3/ticker/price');
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Cambio 24h
app.get('/api/ticker/24hr', async (req, res) => {
  try {
    const data = await binanceRequest('GET', '/api/v3/ticker/24hr');
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
// ENDPOINTS DE TRADING (nuevos)
// ══════════════════════════════════════════════════════════════

// ── Ver órdenes abiertas ─────────────────────────────────────
app.get('/api/orders/open', async (req, res) => {
  try {
    const params = {};
    if (req.query.symbol) params.symbol = req.query.symbol;
    const data = await binanceRequest('GET', '/api/v3/openOrders', params);
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Historial de órdenes ─────────────────────────────────────
app.get('/api/orders/history', async (req, res) => {
  try {
    const params = { symbol: req.query.symbol || 'BTCUSDT', limit: 20 };
    const data = await binanceRequest('GET', '/api/v3/allOrders', params);
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Crear orden ──────────────────────────────────────────────
// Tipos soportados: MARKET, LIMIT, STOP_LOSS_LIMIT, TAKE_PROFIT_LIMIT, OCO
app.post('/api/order', async (req, res) => {
  try {
    const { symbol, side, type, quantity, price, stopPrice, timeInForce } = req.body;

    // Validaciones básicas de seguridad en el servidor
    if (!symbol || !side || !type || !quantity) {
      return res.status(400).json({ error: 'Faltan parámetros obligatorios' });
    }
    if (!['BUY','SELL'].includes(side)) {
      return res.status(400).json({ error: 'side debe ser BUY o SELL' });
    }
    if (!['MARKET','LIMIT','STOP_LOSS_LIMIT','TAKE_PROFIT_LIMIT'].includes(type)) {
      return res.status(400).json({ error: 'Tipo de orden no soportado' });
    }

    const params = { symbol, side, type, quantity };
    if (price)       params.price       = price;
    if (stopPrice)   params.stopPrice   = stopPrice;
    if (timeInForce) params.timeInForce = timeInForce;
    else if (type !== 'MARKET') params.timeInForce = 'GTC';

    const data = await binanceRequest('POST', '/api/v3/order', params);
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Crear orden OCO (Take-Profit + Stop-Loss simultáneos) ────
app.post('/api/order/oco', async (req, res) => {
  try {
    const { symbol, side, quantity, price, stopPrice, stopLimitPrice } = req.body;

    if (!symbol || !side || !quantity || !price || !stopPrice || !stopLimitPrice) {
      return res.status(400).json({ error: 'Faltan parámetros para OCO' });
    }

    const params = {
      symbol,
      side,
      quantity,
      price,           // precio Take-Profit (límite superior venta)
      stopPrice,       // precio que dispara el stop
      stopLimitPrice,  // precio límite del stop
      stopLimitTimeInForce: 'GTC'
    };

    const data = await binanceRequest('POST', '/api/v3/orderList/oco', params);
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Cancelar orden ───────────────────────────────────────────
app.delete('/api/order', async (req, res) => {
  try {
    const { symbol, orderId } = req.query;
    if (!symbol || !orderId) {
      return res.status(400).json({ error: 'symbol y orderId son obligatorios' });
    }
    const data = await binanceRequest('DELETE', '/api/v3/order', { symbol, orderId });
    res.json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy Binance escuchando en puerto ${PORT}`));
