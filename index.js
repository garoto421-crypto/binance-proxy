const express = require('express');
const crypto = require('crypto');
const https = require('https');
const app = express();

app.use(express.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const API_KEY = process.env.BINANCE_API_KEY;
const SECRET_KEY = process.env.BINANCE_SECRET_KEY;

function sign(queryString) {
  return crypto.createHmac('sha256', SECRET_KEY).update(queryString).digest('hex');
}

function binanceRequest(method, path, params) {
  if (!params) params = {};
  params.timestamp = Date.now();
  params.recvWindow = 5000;
  var qs = new URLSearchParams(params).toString();
  var signature = sign(qs);
  var fullPath = path + '?' + qs + '&signature=' + signature;
  return new Promise(function(resolve, reject) {
    var options = {
      hostname: 'api.binance.com',
      path: fullPath,
      method: method,
      headers: { 'X-MBX-APIKEY': API_KEY, 'Content-Type': 'application/json' }
    };
    var req = https.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('Respuesta invalida de Binance')); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

app.get('/', function(req, res) {
  res.json({ status: 'ok', version: '2.0', timestamp: new Date().toISOString() });
});

app.get('/api/myip', function(req, res) {
  https.get('https://ifconfig.me/ip', function(response) {
    var data = '';
    response.on('data', function(chunk) { data += chunk; });
    response.on('end', function() {
      res.json({ outbound_ip: data.trim() });
    });
  }).on('error', function(e) {
    res.status(500).json({ error: e.message });
  });
});

app.get('/api/account', function(req, res) {
  binanceRequest('GET', '/api/v3/account', {})
    .then(function(data) { res.json(data); })
    .catch(function(e) { res.status(500).json({ error: e.message }); });
});

app.get('/api/ticker/price', function(req, res) {
  binanceRequest('GET', '/api/v3/ticker/price', {})
    .then(function(data) { res.json(data); })
    .catch(function(e) { res.status(500).json({ error: e.message }); });
});

app.get('/api/ticker/24hr', function(req, res) {
  binanceRequest('GET', '/api/v3/ticker/24hr', {})
    .then(function(data) { res.json(data); })
    .catch(function(e) { res.status(500).json({ error: e.message }); });
});

app.get('/api/orders/open', function(req, res) {
  var params = {};
  if (req.query.symbol) params.symbol = req.query.symbol;
  binanceRequest('GET', '/api/v3/openOrders', params)
    .then(function(data) { res.json(data); })
    .catch(function(e) { res.status(500).json({ error: e.message }); });
});

app.get('/api/orders/history', function(req, res) {
  var params = { symbol: req.query.symbol || 'BTCUSDT', limit: 20 };
  binanceRequest('GET', '/api/v3/allOrders', params)
    .then(function(data) { res.json(data); })
    .catch(function(e) { res.status(500).json({ error: e.message }); });
});

app.post('/api/order', function(req, res) {
  var body = req.body;
  if (!body.symbol || !body.side || !body.type || !body.quantity) {
    return res.status(400).json({ error: 'Faltan parametros obligatorios' });
  }
  var params = {
    symbol: body.symbol,
    side: body.side,
    type: body.type,
    quantity: body.quantity
  };
  if (body.price) params.price = body.price;
  if (body.stopPrice) params.stopPrice = body.stopPrice;
  if (body.timeInForce) params.timeInForce = body.timeInForce;
  else if (body.type !== 'MARKET') params.timeInForce = 'GTC';
  binanceRequest('POST', '/api/v3/order', params)
    .then(function(data) { res.json(data); })
    .catch(function(e) { res.status(500).json({ error: e.message }); });
});

app.post('/api/order/oco', function(req, res) {
  var body = req.body;
  if (!body.symbol || !body.side || !body.quantity || !body.price || !body.stopPrice || !body.stopLimitPrice) {
    return res.status(400).json({ error: 'Faltan parametros para OCO' });
  }
  var params = {
    symbol: body.symbol,
    side: body.side,
    quantity: body.quantity,
    price: body.price,
    stopPrice: body.stopPrice,
    stopLimitPrice: body.stopLimitPrice,
    stopLimitTimeInForce: 'GTC'
  };
  binanceRequest('POST', '/api/v3/orderList/oco', params)
    .then(function(data) { res.json(data); })
    .catch(function(e) { res.status(500).json({ error: e.message }); });
});

app.delete('/api/order', function(req, res) {
  if (!req.query.symbol || !req.query.orderId) {
    return res.status(400).json({ error: 'Faltan symbol y orderId' });
  }
  var params = { symbol: req.query.symbol, orderId: req.query.orderId };
  binanceRequest('DELETE', '/api/v3/order', params)
    .then(function(data) { res.json(data); })
    .catch(function(e) { res.status(500).json({ error: e.message }); });
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log('Proxy Binance activo en puerto ' + PORT);
});
