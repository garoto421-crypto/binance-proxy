const express = require('express');
const crypto  = require('crypto');
const https   = require('https');
const app     = express();

app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const API_KEY    = process.env.BINANCE_API_KEY;
const SECRET_KEY = process.env.BINANCE_SECRET_KEY;

function sign(queryString) {
  return crypto.createHmac('sha256', SECRET_KEY).update(queryString).digest('hex');
}

function binanceRequest(method, path, params = {}) {
  return new Promise((resolve, reject) => {
    params.timestamp = Date.now();
    params.recvWindow = 5000;
    const qs = new URLSearchParams(params).toString();
    const signature = sign(qs);
    const fullPath = `${path}?${qs}&signature=${signature}`;
    const options = {
      hostname: 'api.binance.com',
      path: fullPath,
      method: method,
      headers: { 'X-MBX-APIKEY': API_KEY }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.end();
  });
}

app.get('/', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/myip', async (req, res) => {
  try {
    const ip = await new Promise((resolve, reject) => {
      https.get('https://ifconfig.me/ip', r => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => resolve(d.trim()));
      }).on('error', reject);
    });
    res.json({ outbound_ip: ip });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/account', async (req, res) => {
  try { res.json(await binanceRequest('GET', '/api/v
