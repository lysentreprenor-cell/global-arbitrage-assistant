type Quote = {
  symbol: string;
  name: string;
  price: number;
  updatedAt: string;
  source: string;
  change24hPct?: number;
};

const SYMBOL_TO_CG: Record<string, { id: string; name: string }> = {
  BTC: { id: "bitcoin", name: "Bitcoin" },
  ETH: { id: "ethereum", name: "Ethereum" },
  SOL: { id: "solana", name: "Solana" },
  BNB: { id: "binancecoin", name: "BNB" },
  XRP: { id: "ripple", name: "XRP" },
  ADA: { id: "cardano", name: "Cardano" },
  DOGE: { id: "dogecoin", name: "Dogecoin" },
  AVAX: { id: "avalanche-2", name: "Avalanche" },
  LINK: { id: "chainlink", name: "Chainlink" },
  TON: { id: "the-open-network", name: "Toncoin" },
  MATIC: { id: "matic-network", name: "Polygon" },
  DOT: { id: "polkadot", name: "Polkadot" },
  LTC: { id: "litecoin", name: "Litecoin" },
  BCH: { id: "bitcoin-cash", name: "Bitcoin Cash" },
  TRX: { id: "tron", name: "TRON" },
};

const DEFAULT_SYMBOLS = ["BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "DOGE", "AVAX", "LINK", "TON"];

function getQuoteConfig() {
  const proKey = process.env.COINGECKO_PRO_API_KEY?.trim();
  const demoKey = process.env.COINGECKO_DEMO_API_KEY?.trim();

  if (proKey) {
    return {
      baseUrl: "https://pro-api.coingecko.com/api/v3",
      headers: { "x-cg-pro-api-key": proKey },
      source: "coingecko-pro",
      live: true,
    };
  }

  if (demoKey) {
    return {
      baseUrl: "https://api.coingecko.com/api/v3",
      headers: { "x-cg-demo-api-key": demoKey },
      source: "coingecko-demo",
      live: true,
    };
  }

  return null;
}

function normalizeSymbols(input?: string[]) {
  const list = (input?.length ? input : DEFAULT_SYMBOLS)
    .map((s) => String(s || "").trim().toUpperCase())
    .filter(Boolean)
    .filter((s) => SYMBOL_TO_CG[s]);

  return Array.from(new Set(list));
}

function fallbackQuotes(symbols: string[]): Quote[] {
  const now = new Date();
  const daySlot = Math.floor(Date.now() / 1000 / 60 / 15);
  return symbols.map((symbol, index) => {
    const baseMap: Record<string, number> = {
      BTC: 68000,
      ETH: 3300,
      SOL: 180,
      BNB: 600,
      XRP: 0.62,
      ADA: 0.71,
      DOGE: 0.18,
      AVAX: 41,
      LINK: 18,
      TON: 6.1,
      MATIC: 0.86,
      DOT: 7.9,
      LTC: 92,
      BCH: 505,
      TRX: 0.12,
    };

    const base = baseMap[symbol] ?? 100;
    const phase = (index + 1) * 0.73;
    const swing = Math.sin(daySlot * 0.4 + phase) * 0.018;
    const price = +(base * (1 + swing)).toFixed(6);

    return {
      symbol,
      name: SYMBOL_TO_CG[symbol]?.name || symbol,
      price,
      updatedAt: now.toISOString(),
      source: "demo-fallback-no-api-key",
      change24hPct: +(swing * 100).toFixed(4),
    };
  });
}

export async function fetchInvestQuotes(symbolsInput?: string[]) {
  const symbols = normalizeSymbols(symbolsInput);
  const config = getQuoteConfig();

  if (!config) {
    return {
      quotes: fallbackQuotes(symbols),
      updatedAt: new Date().toISOString(),
      source: "demo-fallback-no-api-key",
      live: false,
    };
  }

  const ids = symbols.map((symbol) => SYMBOL_TO_CG[symbol].id);
  const params = new URLSearchParams({
    ids: ids.join(","),
    vs_currencies: "usd",
    include_last_updated_at: "true",
    include_24hr_change: "true",
  });

  const res = await fetch(`${config.baseUrl}/simple/price?${params.toString()}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...config.headers,
    } as unknown as Record<string, string>,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`CoinGecko quotes failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as Record<
    string,
    {
      usd?: number;
      usd_24h_change?: number;
      last_updated_at?: number;
    }
  >;

  const quotes: Quote[] = symbols.map((symbol) => {
    const id = SYMBOL_TO_CG[symbol].id;
    const row = data[id] || {};
    const updatedAt = row.last_updated_at
      ? new Date(row.last_updated_at * 1000).toISOString()
      : new Date().toISOString();

    return {
      symbol,
      name: SYMBOL_TO_CG[symbol].name,
      price: Number(row.usd || 0),
      updatedAt,
      source: config.source,
      change24hPct:
        typeof row.usd_24h_change === "number" ? Number(row.usd_24h_change) : undefined,
    };
  });

  return {
    quotes,
    updatedAt: new Date().toISOString(),
    source: config.source,
    live: true,
  };
}
