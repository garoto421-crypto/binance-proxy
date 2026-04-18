import { Router, type IRouter } from "express";
import crypto from "crypto";

const router: IRouter = Router();

const BINANCE_BASE = "https://api.binance.com";

function sign(queryString: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(queryString).digest("hex");
}

function getCredentials(): { apiKey: string; apiSecret: string } | null {
  const apiKey = process.env.BINANCE_API_KEY;
  const apiSecret = process.env.BINANCE_SECRET_KEY;
  if (!apiKey || !apiSecret) return null;
  return { apiKey, apiSecret };
}

router.get("/ticker/price", async (req, res): Promise<void> => {
  const creds = getCredentials();
  if (!creds) {
    res.status(503).json({
      error: "Server is missing BINANCE_API_KEY or BINANCE_SECRET_KEY configuration",
    });
    return;
  }

  const symbol = req.query.symbol as string | undefined;
  const qs = symbol ? `symbol=${encodeURIComponent(symbol)}` : "";
  const url = `${BINANCE_BASE}/api/v3/ticker/price${qs ? `?${qs}` : ""}`;

  req.log.info({ url }, "Proxying ticker/price request");

  const upstream = await fetch(url, {
    headers: { "X-MBX-APIKEY": creds.apiKey },
  });

  const data = await upstream.json();
  res.status(upstream.status).json(data);
});

router.get("/account", async (req, res): Promise<void> => {
  const creds = getCredentials();
  if (!creds) {
    res.status(503).json({
      error: "Server is missing BINANCE_API_KEY or BINANCE_SECRET_KEY configuration",
    });
    return;
  }

  const timestamp = Date.now();
  const recvWindow = 5000;
  const qs = `timestamp=${timestamp}&recvWindow=${recvWindow}`;
  const signature = sign(qs, creds.apiSecret);
  const url = `${BINANCE_BASE}/api/v3/account?${qs}&signature=${signature}`;

  req.log.info("Proxying account request");

  const upstream = await fetch(url, {
    headers: { "X-MBX-APIKEY": creds.apiKey },
  });

  const data = await upstream.json();
  res.status(upstream.status).json(data);
});

export default router;
