import React, { useEffect, useMemo, useState } from "react";

const API_PORTFOLIO = "/api/invest/portfolio";
const API_QUOTES = "/api/invest/quotes";
const API_BUY = "/api/invest/buy";
const API_SELL = "/api/invest/sell";

type Quote = {
  symbol: string;
  name?: string;
  price: number;
  updatedAt?: string;
  source?: string;
};

type Holding = {
  symbol: string;
  name?: string;
  quantity: number;
  averageBuyPrice: number;
  totalInvested?: number;
};

type InvestmentTransaction = {
  id: string;
  type: "buy" | "sell" | string;
  symbol: string;
  quantity: number;
  price: number;
  amount?: number;
  createdAt: string;
  description?: string;
};

type PortfolioPayload = {
  holdings: Holding[];
  transactions: InvestmentTransaction[];
  cashBalance: number;
  updatedAt?: string;
};

type QuotesPayload = {
  quotes: Quote[];
  updatedAt?: string;
  source?: string;
};

type TabKey = "market" | "portfolio" | "history";
type SortKey = "value" | "name" | "pl" | "allocation";

function toNum(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function fmtMoney(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(toNum(value));
}

function fmtPct(value: number) {
  return `${toNum(value).toFixed(2)}%`;
}

function fmtDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function colorForValue(v: number) {
  if (v > 0) return "#14c784";
  if (v < 0) return "#ff6b6b";
  return "#d8d8d8";
}

function normalizeQuotes(raw: any): QuotesPayload {
  const list =
    (Array.isArray(raw) ? raw : null) ||
    raw?.quotes ||
    raw?.items ||
    raw?.data?.quotes ||
    raw?.data?.items ||
    [];

  const quotes: Quote[] = Array.isArray(list)
    ? list.map((item: any) => ({
        symbol: String(item.symbol || item.assetSymbol || "").toUpperCase(),
        name: item.name || item.assetName || undefined,
        price: toNum(item.price ?? item.currentPrice ?? item.quote ?? 0),
        updatedAt: item.updatedAt || item.generatedAt || raw?.updatedAt || raw?.generatedAt,
        source: item.source || raw?.source || "demo quotes",
      }))
    : [];

  return {
    quotes,
    updatedAt: raw?.updatedAt || raw?.generatedAt || quotes[0]?.updatedAt,
    source: raw?.source || quotes[0]?.source || "demo quotes",
  };
}

function normalizePortfolio(raw: any): PortfolioPayload {
  const data = raw?.portfolio || raw?.data || raw || {};

  const holdings: Holding[] = Array.isArray(data.holdings || data.items)
    ? (data.holdings || data.items).map((item: any) => ({
        symbol: String(item.symbol || item.assetSymbol || "").toUpperCase(),
        name: item.name || item.assetName || undefined,
        quantity: toNum(item.quantity),
        averageBuyPrice: toNum(
          item.averageBuyPrice ?? item.avgBuyPrice ?? item.average_price ?? item.avgCost ?? 0
        ),
        totalInvested: toNum(
          item.totalInvested ?? item.investedCapital ?? item.total_invested ?? 0
        ),
      }))
    : [];

  const transactions: InvestmentTransaction[] = Array.isArray(
    data.transactions || data.history
  )
    ? (data.transactions || data.history).map((item: any, idx: number) => ({
        id: String(item.id || item.txId || `${idx}-${item.symbol || "tx"}`),
        type: String(item.type || item.transactionType || "buy").toLowerCase(),
        symbol: String(item.symbol || item.assetSymbol || "").toUpperCase(),
        quantity: toNum(item.quantity),
        price: toNum(item.price ?? item.unitPrice ?? item.price_per_unit ?? 0),
        amount: toNum(item.amount ?? item.total ?? item.totalAmount ?? item.total_amount ?? 0),
        createdAt:
          item.createdAt || item.created_at || item.timestamp || new Date().toISOString(),
        description: item.description || undefined,
      }))
    : [];

  return {
    holdings,
    transactions,
    cashBalance: toNum(
      data.cashBalance ?? data.balance ?? data.availableCash ?? data.userBalance ?? 0
    ),
    updatedAt: data.updatedAt || data.updated_at || new Date().toISOString(),
  };
}

function getQuoteMap(quotes: Quote[]) {
  return new Map(quotes.map((q) => [q.symbol, q]));
}

function pctWidth(value: number) {
  return `${Math.max(0, Math.min(100, value))}%`;
}

function SummaryMetric({
  label,
  value,
  color,
  subtitle,
}: {
  label: string;
  value: string;
  color?: string;
  subtitle?: string;
}) {
  return (
    <div style={styles.summaryCard}>
      <div style={styles.summaryLabel}>{label}</div>
      <div style={{ ...styles.summaryValue, color: color || "#fff" }}>{value}</div>
      {subtitle ? <div style={styles.summarySubtitle}>{subtitle}</div> : null}
    </div>
  );
}

function TabButton({
  active,
  children,
  onClick,
  testId,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      style={{
        ...styles.tabButton,
        ...(active ? styles.tabButtonActive : {}),
      }}
    >
      {children}
    </button>
  );
}

export default function InvestPage() {
  const [tab, setTab] = useState<TabKey>("portfolio");

  const [portfolio, setPortfolio] = useState<PortfolioPayload>({
    holdings: [],
    transactions: [],
    cashBalance: 0,
  });
  const [quotesState, setQuotesState] = useState<QuotesPayload>({
    quotes: [],
    source: "demo quotes",
  });

  const [loadingPortfolio, setLoadingPortfolio] = useState(true);
  const [loadingQuotes, setLoadingQuotes] = useState(true);
  const [portfolioError, setPortfolioError] = useState("");
  const [quotesError, setQuotesError] = useState("");

  const [buySymbol, setBuySymbol] = useState("");
  const [buyAmountUsd, setBuyAmountUsd] = useState("");
  const [sellSymbol, setSellSymbol] = useState("");
  const [sellQuantity, setSellQuantity] = useState("");

  const [buyPending, setBuyPending] = useState(false);
  const [sellPending, setSellPending] = useState(false);
  const [buyError, setBuyError] = useState("");
  const [sellError, setSellError] = useState("");
  const [buySuccess, setBuySuccess] = useState("");
  const [sellSuccess, setSellSuccess] = useState("");

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("value");
  const [txFilter, setTxFilter] = useState<"all" | "buy" | "sell">("all");
  const [txLimit, setTxLimit] = useState(20);

  // Double-submit guards
  const buyInFlight = React.useRef(false);
  const sellInFlight = React.useRef(false);

  async function loadPortfolio() {
    try {
      setLoadingPortfolio(true);
      setPortfolioError("");

      const res = await fetch(API_PORTFOLIO, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Portfolio error ${res.status}`);

      setPortfolio(normalizePortfolio(json));
    } catch (err: any) {
      setPortfolioError(err?.message || "Nie udało się pobrać portfolio.");
    } finally {
      setLoadingPortfolio(false);
    }
  }

  async function loadQuotes() {
    try {
      setLoadingQuotes(true);
      setQuotesError("");

      const res = await fetch(API_QUOTES, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Quotes error ${res.status}`);

      setQuotesState(normalizeQuotes(json));
    } catch (err: any) {
      setQuotesError(err?.message || "Nie udało się pobrać quotes.");
    } finally {
      setLoadingQuotes(false);
    }
  }

  async function refreshAll() {
    await Promise.all([loadPortfolio(), loadQuotes()]);
  }

  useEffect(() => {
    refreshAll();
  }, []);

  const quoteMap = useMemo(() => getQuoteMap(quotesState.quotes), [quotesState.quotes]);

  const holdingsView = useMemo(() => {
    const normalized = portfolio.holdings.map((holding) => {
      const quote = quoteMap.get(holding.symbol);
      const currentPrice = toNum(quote?.price, holding.averageBuyPrice);
      const currentValue = holding.quantity * currentPrice;
      const totalInvested = toNum(
        holding.totalInvested,
        holding.quantity * holding.averageBuyPrice
      );
      const gainLoss = currentValue - totalInvested;
      const gainLossPct = totalInvested > 0 ? (gainLoss / totalInvested) * 100 : 0;

      return {
        ...holding,
        currentPrice,
        currentValue,
        totalInvested,
        gainLoss,
        gainLossPct,
      };
    });

    const totalValue = normalized.reduce((sum, item) => sum + item.currentValue, 0);

    const filtered = normalized
      .filter((item) => {
        const hay = `${item.symbol} ${item.name || ""}`.toLowerCase();
        return hay.includes(search.trim().toLowerCase());
      })
      .map((item) => ({
        ...item,
        allocationPct: totalValue > 0 ? (item.currentValue / totalValue) * 100 : 0,
      }));

    filtered.sort((a, b) => {
      if (sortBy === "name") return a.symbol.localeCompare(b.symbol);
      if (sortBy === "pl") return b.gainLossPct - a.gainLossPct;
      if (sortBy === "allocation") return b.allocationPct - a.allocationPct;
      return b.currentValue - a.currentValue;
    });

    return filtered;
  }, [portfolio.holdings, quoteMap, search, sortBy]);

  const summary = useMemo(() => {
    const investedCapital = holdingsView.reduce((sum, item) => sum + item.totalInvested, 0);
    const portfolioValue = holdingsView.reduce((sum, item) => sum + item.currentValue, 0);
    const totalGainLoss = portfolioValue - investedCapital;
    const totalGainLossPct =
      investedCapital > 0 ? (totalGainLoss / investedCapital) * 100 : 0;

    return {
      cashBalance: portfolio.cashBalance,
      investedCapital,
      portfolioValue,
      totalGainLoss,
      totalGainLossPct,
      grandTotal: portfolio.cashBalance + portfolioValue,
    };
  }, [holdingsView, portfolio.cashBalance]);

  const transactionsView = useMemo(() => {
    const txs = [...portfolio.transactions]
      .filter((tx) => (txFilter === "all" ? true : tx.type === txFilter))
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

    return txs.slice(0, txLimit);
  }, [portfolio.transactions, txFilter, txLimit]);

  const sellPreview = useMemo(() => {
    const symbol = sellSymbol.trim().toUpperCase();
    const qty = toNum(sellQuantity, 0);
    const quote = quoteMap.get(symbol);
    const quotePrice = toNum(quote?.price, 0);

    return {
      symbol,
      qty,
      quotePrice,
      proceeds: qty * quotePrice,
    };
  }, [sellSymbol, sellQuantity, quoteMap]);

  function validateBuy() {
    const symbol = buySymbol.trim().toUpperCase();
    const amount = toNum(buyAmountUsd, 0);

    if (!symbol) return "Podaj symbol aktywa.";
    if (!quoteMap.get(symbol)) return "Nieprawidłowy symbol aktywa.";
    if (amount <= 0) return "Kwota zakupu musi być większa od 0.";
    if (amount > portfolio.cashBalance) return "Brak wystarczających środków.";
    return "";
  }

  function validateSell() {
    const symbol = sellSymbol.trim().toUpperCase();
    const quantity = toNum(sellQuantity, 0);
    const holding = portfolio.holdings.find((h) => h.symbol === symbol);

    if (!symbol) return "Podaj symbol aktywa.";
    if (!holding) return "Nie posiadasz tego aktywa.";
    if (quantity <= 0) return "Ilość sprzedaży musi być większa od 0.";
    if (quantity > holding.quantity) return "Nie możesz sprzedać więcej niż posiadasz.";
    return "";
  }

  async function handleBuy() {
    if (buyInFlight.current) return;
    const validation = validateBuy();
    if (validation) {
      setBuyError(validation);
      setBuySuccess("");
      return;
    }

    buyInFlight.current = true;
    try {
      setBuyPending(true);
      setBuyError("");
      setBuySuccess("");

      const res = await fetch(API_BUY, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          symbol: buySymbol.trim().toUpperCase(),
          amountUsd: toNum(buyAmountUsd, 0),
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Buy failed ${res.status}`);

      setBuySuccess("Zakup wykonany poprawnie.");
      setBuyAmountUsd("");
      await refreshAll();
      setTab("portfolio");
    } catch (err: any) {
      setBuyError(err?.message || "Nie udało się wykonać zakupu.");
    } finally {
      setBuyPending(false);
      buyInFlight.current = false;
    }
  }

  async function handleSell() {
    if (sellInFlight.current) return;
    const validation = validateSell();
    if (validation) {
      setSellError(validation);
      setSellSuccess("");
      return;
    }

    sellInFlight.current = true;
    try {
      setSellPending(true);
      setSellError("");
      setSellSuccess("");

      const res = await fetch(API_SELL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          symbol: sellSymbol.trim().toUpperCase(),
          quantity: toNum(sellQuantity, 0),
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Sell failed ${res.status}`);

      setSellSuccess("Sprzedaż wykonana poprawnie.");
      setSellQuantity("");
      await refreshAll();
      setTab("history");
    } catch (err: any) {
      setSellError(err?.message || "Nie udało się wykonać sprzedaży.");
    } finally {
      setSellPending(false);
      sellInFlight.current = false;
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.topBar}>
        <div>
          <h1 style={styles.title}>Invest</h1>
          <div style={styles.subtle}>
            Source: {quotesState.source || "demo quotes"} · Updated: {fmtDate(quotesState.updatedAt)}
          </div>
        </div>

        <button
          type="button"
          onClick={loadQuotes}
          disabled={loadingQuotes}
          style={styles.secondaryButton}
          data-testid="btn-refresh-quotes"
        >
          {loadingQuotes ? "Refreshing..." : "Refresh quotes"}
        </button>
      </div>

      <div style={styles.tabs}>
        <TabButton active={tab === "market"} onClick={() => setTab("market")} testId="tab-invest-market">
          Market
        </TabButton>
        <TabButton active={tab === "portfolio"} onClick={() => setTab("portfolio")} testId="tab-invest-portfolio">
          Portfolio
        </TabButton>
        <TabButton active={tab === "history"} onClick={() => setTab("history")} testId="tab-invest-history">
          History
        </TabButton>
      </div>

      <div style={styles.summaryGrid}>
        <SummaryMetric label="Cash" value={fmtMoney(summary.cashBalance)} />
        <SummaryMetric label="Invested" value={fmtMoney(summary.investedCapital)} />
        <SummaryMetric label="Portfolio" value={fmtMoney(summary.portfolioValue)} />
        <SummaryMetric
          label="Total P/L"
          value={`${fmtMoney(summary.totalGainLoss)} (${fmtPct(summary.totalGainLossPct)})`}
          color={colorForValue(summary.totalGainLoss)}
        />
        <SummaryMetric label="Grand total" value={fmtMoney(summary.grandTotal)} />
      </div>

      {(portfolioError || quotesError) ? (
        <div style={styles.errorBox}>
          {portfolioError ? <div data-testid="text-portfolio-error">{portfolioError}</div> : null}
          {quotesError ? <div data-testid="text-quotes-error">{quotesError}</div> : null}
        </div>
      ) : null}

      {tab === "market" ? (
        <div style={styles.grid2}>
          <div style={styles.card}>
            <div style={styles.cardTitle}>Buy asset</div>
            <label style={styles.label}>Asset symbol</label>
            <input
              value={buySymbol}
              onChange={(e) => setBuySymbol(e.target.value.toUpperCase())}
              placeholder="BTC"
              style={styles.input}
              data-testid="input-buy-symbol"
            />

            <label style={styles.label}>Amount (USD)</label>
            <input
              value={buyAmountUsd}
              onChange={(e) => setBuyAmountUsd(e.target.value)}
              placeholder="500"
              inputMode="decimal"
              style={styles.input}
              data-testid="input-buy-amount"
            />

            <div style={styles.hint}>Available cash: {fmtMoney(portfolio.cashBalance)}</div>

            {buyError ? <div style={styles.errorText} data-testid="text-buy-error">{buyError}</div> : null}
            {buySuccess ? <div style={styles.successText} data-testid="text-buy-success">{buySuccess}</div> : null}

            <button
              type="button"
              onClick={handleBuy}
              disabled={buyPending || !!validateBuy()}
              style={styles.primaryButton}
              data-testid="btn-execute-buy"
            >
              {buyPending ? "Buying..." : "Buy"}
            </button>
          </div>

          <div style={styles.card}>
            <div style={styles.cardTitle}>Sell asset</div>
            <label style={styles.label}>Asset symbol</label>
            <input
              value={sellSymbol}
              onChange={(e) => setSellSymbol(e.target.value.toUpperCase())}
              placeholder="BTC"
              style={styles.input}
              data-testid="input-sell-symbol"
            />

            <label style={styles.label}>Quantity</label>
            <input
              value={sellQuantity}
              onChange={(e) => setSellQuantity(e.target.value)}
              placeholder="0.01"
              inputMode="decimal"
              style={styles.input}
              data-testid="input-sell-qty"
            />

            <div style={styles.hint}>
              Confirm: {sellPreview.symbol || "—"} · qty {sellPreview.qty || 0} · price{" "}
              {fmtMoney(sellPreview.quotePrice)} · proceeds {fmtMoney(sellPreview.proceeds)}
            </div>

            {sellError ? <div style={styles.errorText} data-testid="text-sell-error">{sellError}</div> : null}
            {sellSuccess ? <div style={styles.successText} data-testid="text-sell-success">{sellSuccess}</div> : null}

            <button
              type="button"
              onClick={handleSell}
              disabled={sellPending || !!validateSell()}
              style={styles.primaryButton}
              data-testid="btn-execute-sell"
            >
              {sellPending ? "Selling..." : "Sell"}
            </button>
          </div>

          <div style={{ ...styles.card, gridColumn: "1 / -1" }}>
            <div style={styles.cardTitle}>Quotes · <span style={{ ...styles.subtle, fontSize: 13 }}>DEMO · Sin-based · deterministic</span></div>
            {loadingQuotes ? (
              <div style={styles.empty}>Loading quotes...</div>
            ) : quotesState.quotes.length === 0 ? (
              <div style={styles.empty}>No quotes available.</div>
            ) : (
              <div style={styles.marketList}>
                {quotesState.quotes.map((q) => (
                  <div
                    key={q.symbol}
                    style={styles.marketItem}
                    data-testid={`card-market-${q.symbol.toLowerCase()}`}
                    onClick={() => { setBuySymbol(q.symbol); }}
                  >
                    <div>
                      <div style={styles.marketSymbol}>{q.symbol}</div>
                      <div style={styles.subtle}>{q.name || "Asset"}</div>
                    </div>
                    <div style={styles.marketPrice}>{fmtMoney(q.price)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {tab === "portfolio" ? (
        <div style={styles.grid2}>
          <div style={{ ...styles.card, gridColumn: "1 / -1" }}>
            <div style={styles.rowTop}>
              <div style={styles.cardTitle}>Portfolio allocation</div>
              <div style={styles.controls}>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search symbol"
                  style={styles.searchInput}
                  data-testid="input-portfolio-search"
                />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortKey)}
                  style={styles.select}
                  data-testid="select-sort-by"
                >
                  <option value="value">Value</option>
                  <option value="pl">P/L</option>
                  <option value="allocation">Allocation</option>
                  <option value="name">Name</option>
                </select>
              </div>
            </div>

            {loadingPortfolio ? (
              <div style={styles.empty}>Loading portfolio...</div>
            ) : holdingsView.length === 0 ? (
              <div style={styles.empty} data-testid="invest-empty-state">Portfolio is empty.</div>
            ) : (
              <div style={styles.allocationList}>
                {holdingsView.map((item) => (
                  <div key={item.symbol} style={styles.allocationCard} data-testid={`card-holding-${item.symbol.toLowerCase()}`}>
                    <div style={styles.rowTop}>
                      <div>
                        <div style={styles.marketSymbol}>{item.symbol}</div>
                        <div style={styles.subtle}>{item.name || "Asset"}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={styles.marketPrice} data-testid={`text-holding-value-${item.symbol.toLowerCase()}`}>{fmtMoney(item.currentValue)}</div>
                        <div style={{ ...styles.subtle, color: colorForValue(item.gainLoss) }} data-testid={`text-holding-pl-${item.symbol.toLowerCase()}`}>
                          {fmtMoney(item.gainLoss)} ({fmtPct(item.gainLossPct)})
                        </div>
                      </div>
                    </div>

                    <div style={styles.barBg}>
                      <div
                        style={{
                          ...styles.barFill,
                          width: pctWidth(item.allocationPct),
                        }}
                      />
                    </div>

                    <div style={styles.metaGrid}>
                      <Meta label="Qty" value={String(item.quantity)} />
                      <Meta label="Avg buy" value={fmtMoney(item.averageBuyPrice)} />
                      <Meta label="Current" value={fmtMoney(item.currentPrice)} />
                      <Meta label="Allocation" value={fmtPct(item.allocationPct)} testId={`text-holding-alloc-${item.symbol.toLowerCase()}`} />
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        style={{ ...styles.secondaryButton, flex: 1, fontSize: 12 }}
                        onClick={() => { setBuySymbol(item.symbol); setBuyAmountUsd(""); setTab("market"); }}
                        data-testid={`btn-buy-more-${item.symbol.toLowerCase()}`}
                      >
                        + Buy more
                      </button>
                      <button
                        type="button"
                        style={{ ...styles.secondaryButton, flex: 1, fontSize: 12, color: "#ff9191", borderColor: "rgba(255,80,80,0.25)" }}
                        onClick={() => { setSellSymbol(item.symbol); setSellQuantity(""); setTab("market"); }}
                        data-testid={`btn-sell-${item.symbol.toLowerCase()}`}
                      >
                        − Sell
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {tab === "history" ? (
        <div style={styles.card}>
          <div style={styles.rowTop}>
            <div style={styles.cardTitle}>Transaction history</div>
            <div style={styles.controls}>
              <select
                value={txFilter}
                onChange={(e) => setTxFilter(e.target.value as any)}
                style={styles.select}
                data-testid="select-tx-filter"
              >
                <option value="all">All</option>
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </div>
          </div>

          <div style={styles.subtle}>
            {transactionsView.length} record{transactionsView.length !== 1 ? "s" : ""}
            {txFilter !== "all" ? ` · ${txFilter}` : ""}
          </div>

          {loadingPortfolio ? (
            <div style={styles.empty}>Loading history...</div>
          ) : transactionsView.length === 0 ? (
            <div style={styles.empty} data-testid="invest-history-empty">No transactions found.</div>
          ) : (
            <div style={styles.txList}>
              {transactionsView.map((tx) => (
                <div key={tx.id} style={styles.txCard} data-testid={`row-invest-tx-${tx.id}`}>
                  <div style={styles.rowTop}>
                    <div style={styles.txLeft}>
                      <span
                        style={{
                          ...styles.badge,
                          background: tx.type === "buy" ? "#143123" : "#3a2b15",
                          color: tx.type === "buy" ? "#74e3ad" : "#ffd36c",
                        }}
                      >
                        {tx.type.toUpperCase()}
                      </span>
                      <strong>{tx.symbol}</strong>
                    </div>
                    <div style={styles.subtle}>{fmtDate(tx.createdAt)}</div>
                  </div>

                  <div style={styles.metaGrid}>
                    <Meta label="Qty" value={String(tx.quantity)} />
                    <Meta label="Price" value={fmtMoney(tx.price)} />
                    <Meta
                      label="Amount"
                      value={fmtMoney(tx.amount ?? tx.quantity * tx.price)}
                      testId={`text-tx-amount-${tx.id}`}
                    />
                  </div>

                  {tx.description ? <div style={styles.txDesc}>{tx.description}</div> : null}
                </div>
              ))}
            </div>
          )}

          {portfolio.transactions.length > txLimit ? (
            <button
              type="button"
              onClick={() => setTxLimit((prev) => prev + 20)}
              style={styles.secondaryButton}
              data-testid="btn-load-more-tx"
            >
              Load more
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Meta({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div style={styles.metaItem}>
      <div style={styles.metaLabel}>{label}</div>
      <div style={styles.metaValue} data-testid={testId}>{value}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#0d1016",
    color: "white",
    padding: 16,
    display: "grid",
    gap: 16,
  },
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  title: {
    margin: 0,
    fontSize: 30,
    fontWeight: 800,
  },
  subtle: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
  },
  tabs: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  tabButton: {
    minHeight: 40,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.1)",
    background: "#141925",
    color: "white",
    padding: "0 14px",
    fontWeight: 700,
    cursor: "pointer",
  },
  tabButtonActive: {
    background: "#d7a71a",
    color: "#111",
    border: "1px solid #d7a71a",
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 12,
  },
  summaryCard: {
    borderRadius: 18,
    padding: 14,
    background: "#131926",
    border: "1px solid rgba(255,255,255,0.08)",
    display: "grid",
    gap: 6,
  },
  summaryLabel: {
    color: "rgba(255,255,255,0.68)",
    fontSize: 12,
  },
  summaryValue: {
    fontSize: 21,
    fontWeight: 800,
  },
  summarySubtitle: {
    color: "rgba(255,255,255,0.58)",
    fontSize: 11,
  },
  grid2: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 16,
  },
  card: {
    borderRadius: 18,
    padding: 16,
    background: "#131926",
    border: "1px solid rgba(255,255,255,0.08)",
    display: "grid",
    gap: 12,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 800,
  },
  label: {
    fontSize: 13,
    color: "rgba(255,255,255,0.72)",
  },
  input: {
    minHeight: 46,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#0d1118",
    color: "white",
    padding: "0 12px",
    outline: "none",
  },
  searchInput: {
    minHeight: 40,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#0d1118",
    color: "white",
    padding: "0 12px",
    outline: "none",
  },
  select: {
    minHeight: 40,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#0d1118",
    color: "white",
    padding: "0 12px",
    outline: "none",
  },
  primaryButton: {
    minHeight: 46,
    borderRadius: 12,
    border: "none",
    background: "#d7a71a",
    color: "#111",
    fontWeight: 800,
    cursor: "pointer",
  },
  secondaryButton: {
    minHeight: 40,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "#1a2030",
    color: "white",
    fontWeight: 700,
    cursor: "pointer",
    padding: "0 14px",
  },
  hint: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 13,
  },
  errorBox: {
    borderRadius: 14,
    padding: 12,
    background: "rgba(255,70,70,0.12)",
    border: "1px solid rgba(255,70,70,0.25)",
    color: "#ff9191",
    display: "grid",
    gap: 6,
  },
  errorText: {
    color: "#ff9191",
    fontSize: 13,
  },
  successText: {
    color: "#6ee7a8",
    fontSize: 13,
  },
  marketList: {
    display: "grid",
    gap: 10,
  },
  marketItem: {
    borderRadius: 14,
    padding: 12,
    background: "#0f141d",
    border: "1px solid rgba(255,255,255,0.06)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    cursor: "pointer",
  },
  marketSymbol: {
    fontSize: 16,
    fontWeight: 800,
  },
  marketPrice: {
    fontSize: 16,
    fontWeight: 800,
  },
  rowTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  controls: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  allocationList: {
    display: "grid",
    gap: 12,
  },
  allocationCard: {
    borderRadius: 14,
    padding: 12,
    background: "#0f141d",
    border: "1px solid rgba(255,255,255,0.06)",
    display: "grid",
    gap: 10,
  },
  barBg: {
    width: "100%",
    height: 10,
    borderRadius: 999,
    background: "#1b2230",
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 999,
    background: "linear-gradient(90deg, #d7a71a, #ffd86b)",
  },
  metaGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
    gap: 10,
  },
  metaItem: {
    display: "grid",
    gap: 4,
  },
  metaLabel: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 11,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: 700,
  },
  txList: {
    display: "grid",
    gap: 10,
  },
  txCard: {
    borderRadius: 14,
    padding: 12,
    background: "#0f141d",
    border: "1px solid rgba(255,255,255,0.06)",
    display: "grid",
    gap: 10,
  },
  txLeft: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  badge: {
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 800,
  },
  txDesc: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 13,
  },
  empty: {
    color: "rgba(255,255,255,0.72)",
  },
};
