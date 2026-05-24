import React, { useState, useMemo } from "react";
import type { Currency } from "@/lib/resell/types";
import { calculateProfit, formatCurrency } from "@/lib/resell/calculations";

const INPUT_STYLE: React.CSSProperties = {
  width: "100%", background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 10, padding: "9px 12px",
  color: "#fff", fontSize: 14, outline: "none",
  boxSizing: "border-box",
};

interface SliderRowProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max: number;
  step?: number;
  currency?: Currency;
  suffix?: string;
  accentColor?: string;
}

function SliderRow({ label, value, onChange, min = 0, max, step = 0.01, currency, suffix, accentColor = "#8b5cf6" }: SliderRowProps) {
  const display = currency ? formatCurrency(value, currency) : `${value}${suffix ?? ""}`;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>{label}</span>
        <span style={{ color: accentColor, fontWeight: 700, fontSize: 13 }}>{display}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor }}
      />
    </div>
  );
}

interface Props {
  initialBuyPrice?: number;
  initialBuyCurrency?: Currency;
  initialSellPrice?: number;
}

export function ProfitCalculator({ initialBuyPrice = 100, initialBuyCurrency = "PLN", initialSellPrice = 35 }: Props) {
  const [buyPrice, setBuyPrice] = useState(initialBuyPrice);
  const [buyCurrency] = useState<Currency>(initialBuyCurrency);
  const [sellPrice, setSellPrice] = useState(initialSellPrice);
  const [sellCurrency, setSellCurrency] = useState<Currency>("USD");
  const [shipping, setShipping] = useState(15);
  const [customs, setCustoms] = useState(5);
  const [tax, setTax] = useState(8);
  const [marketFee, setMarketFee] = useState(10);
  const [returnRisk, setReturnRisk] = useState(3);
  const [damageRisk, setDamageRisk] = useState(2);
  const [platformFee, setPlatformFee] = useState(3);
  const [other, setOther] = useState(0);

  const result = useMemo(() => calculateProfit(
    {
      buyPrice, currency: buyCurrency,
      shippingCost: shipping, customsDuty: customs,
      tax, marketplaceFee: marketFee,
      returnRisk, damagRisk: damageRisk,
      platformFee, otherCosts: other, exchangeRate: 1,
      targetCurrency: sellCurrency,
    },
    sellPrice, sellCurrency,
  ), [buyPrice, buyCurrency, sellPrice, sellCurrency, shipping, customs, tax, marketFee, returnRisk, damageRisk, platformFee, other]);

  const netColor = result.netProfit > 0 ? "#4ade80" : "#f87171";
  const marginColor = result.marginPercent > 20 ? "#4ade80" : result.marginPercent > 0 ? "#fbbf24" : "#f87171";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Result card */}
      <div style={{
        background: result.isViable
          ? "linear-gradient(135deg, rgba(74,222,128,0.10) 0%, rgba(34,197,94,0.06) 100%)"
          : "linear-gradient(135deg, rgba(248,113,113,0.10) 0%, rgba(239,68,68,0.06) 100%)",
        border: `1px solid ${result.isViable ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.25)"}`,
        borderRadius: 16, padding: "16px 20px", marginBottom: 20,
      }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 14 }}>
          <div>
            <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, marginBottom: 4 }}>ZYSK NETTO</div>
            <div style={{ color: netColor, fontSize: 26, fontWeight: 800 }}>
              {formatCurrency(result.netProfit, buyCurrency)}
            </div>
          </div>
          <div>
            <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, marginBottom: 4 }}>MARŻA</div>
            <div style={{ color: marginColor, fontSize: 26, fontWeight: 800 }}>
              {result.marginPercent.toFixed(1)}%
            </div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
          {[
            { label: "PLN", value: result.inPLN.toFixed(0) },
            { label: "USD", value: `$${result.inUSD.toFixed(0)}` },
            { label: "EUR", value: `€${result.inEUR.toFixed(0)}` },
            { label: "NOK", value: `${result.inNOK.toFixed(0)} kr` },
          ].map(({ label, value }) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 9, letterSpacing: 0.5 }}>{label}</div>
              <div style={{ color: netColor, fontSize: 13, fontWeight: 700 }}>{value}</div>
            </div>
          ))}
        </div>
        {!result.isViable && (
          <div style={{ marginTop: 12, color: "#f87171", fontSize: 11, textAlign: "center", fontWeight: 600 }}>
            ⚠ Marża poniżej 15% — transakcja ryzykowna
          </div>
        )}
      </div>

      {/* Sell price + currency */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, marginBottom: 20 }}>
        <div>
          <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: 600, marginBottom: 5 }}>CENA SPRZEDAŻY</div>
          <input type="number" min={0} step={0.01} value={sellPrice} onChange={e => setSellPrice(parseFloat(e.target.value) || 0)} style={INPUT_STYLE} />
        </div>
        <div>
          <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: 600, marginBottom: 5 }}>WALUTA</div>
          <select
            value={sellCurrency}
            onChange={e => setSellCurrency(e.target.value as Currency)}
            style={{ ...INPUT_STYLE, width: 90 } as React.CSSProperties}
          >
            {(["PLN", "USD", "EUR", "NOK", "GBP"] as Currency[]).map(c =>
              <option key={c} value={c}>{c}</option>
            )}
          </select>
        </div>
      </div>

      <div style={{ color: "#a78bfa", fontSize: 12, fontWeight: 700, marginBottom: 12, letterSpacing: 0.5 }}>KOSZTY</div>

      <SliderRow label="Cena zakupu" value={buyPrice} onChange={setBuyPrice} max={5000} step={1} currency={buyCurrency} accentColor="#f5c842" />
      <SliderRow label="Koszt wysyłki" value={shipping} onChange={setShipping} max={200} step={1} currency={buyCurrency} accentColor="#8b5cf6" />
      <SliderRow label="Cło (%)" value={customs} onChange={setCustoms} max={30} step={0.5} suffix="%" accentColor="#8b5cf6" />
      <SliderRow label="Podatek (%)" value={tax} onChange={setTax} max={30} step={0.5} suffix="%" accentColor="#8b5cf6" />
      <SliderRow label="Prowizja marketplace (%)" value={marketFee} onChange={setMarketFee} max={25} step={0.5} suffix="%" accentColor="#8b5cf6" />
      <SliderRow label="Ryzyko zwrotu (%)" value={returnRisk} onChange={setReturnRisk} max={20} step={0.5} suffix="%" accentColor="#f97316" />
      <SliderRow label="Ryzyko uszkodzenia (%)" value={damageRisk} onChange={setDamageRisk} max={10} step={0.5} suffix="%" accentColor="#f97316" />
      <SliderRow label="Opłata platformy (%)" value={platformFee} onChange={setPlatformFee} max={10} step={0.5} suffix="%" accentColor="#8b5cf6" />
      <SliderRow label="Inne koszty" value={other} onChange={setOther} max={500} step={1} currency={buyCurrency} accentColor="#8b5cf6" />

      {/* Cost breakdown table */}
      <div style={{
        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 14, padding: "14px 16px", marginTop: 8,
      }}>
        <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: 700, marginBottom: 10, letterSpacing: 0.5 }}>
          SZCZEGÓŁOWE KOSZTY
        </div>
        {[
          { label: "Cena zakupu", value: buyPrice },
          { label: "Wysyłka", value: shipping },
          { label: "Cło", value: buyPrice * customs / 100 },
          { label: "Podatek", value: buyPrice * tax / 100 },
          { label: "Prowizja marketplace", value: (sellPrice * 3.92) * marketFee / 100 },
          { label: "Ryzyko zwrotu", value: (sellPrice * 3.92) * returnRisk / 100 },
          { label: "Ryzyko uszkodzenia", value: (sellPrice * 3.92) * damageRisk / 100 },
          { label: "Opłata platformy", value: (sellPrice * 3.92) * platformFee / 100 },
          { label: "Inne", value: other },
        ].map(row => (
          <div key={row.label} style={{
            display: "flex", justifyContent: "space-between",
            padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)",
          }}>
            <span style={{ color: "rgba(255,255,255,0.50)", fontSize: 12 }}>{row.label}</span>
            <span style={{ color: "rgba(255,255,255,0.70)", fontSize: 12, fontWeight: 600 }}>
              {formatCurrency(row.value, buyCurrency)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
