import { ContractData, RENOVATION_TYPES } from '../types/contract';

export function calculateTotal(data: ContractData): number {
  if (RENOVATION_TYPES.includes(data.contractType as any)) {
    const roomsTotal = data.rooms.reduce((sum, r) => sum + r.area * r.pricePerM2, 0);
    const stagesTotal = data.stages.reduce((sum, s) => sum + s.amount, 0);
    const base = roomsTotal > 0 ? roomsTotal : stagesTotal;
    return base + data.materialsValue + data.additionalCosts;
  }
  return data.lumpSumPrice + data.additionalCosts;
}

export interface PaymentBreakdown {
  upfront: number;
  deposit: number;
  afterCompletion: number;
  total: number;
}

export function calculatePaymentBreakdown(data: ContractData): PaymentBreakdown {
  const total = calculateTotal(data);
  switch (data.paymentSplit) {
    case 'full_deposit':
      return { upfront: 0, deposit: total, afterCompletion: 0, total };
    case 'per_stage':
      return { upfront: 0, deposit: total, afterCompletion: 0, total };
    case 'materials_upfront':
      return { upfront: data.materialsValue, deposit: total - data.materialsValue, afterCompletion: 0, total };
    case 'custom': {
      return {
        upfront: total * (data.upfrontPercent / 100),
        deposit: total * (data.depositPercent / 100),
        afterCompletion: total * (data.afterPercent / 100),
        total,
      };
    }
    default:
      return { upfront: 0, deposit: total, afterCompletion: 0, total };
  }
}

export function formatCurrency(amount: number, currency = 'PLN', locale = 'pl-PL'): string {
  return amount.toLocaleString(locale, { style: 'currency', currency, maximumFractionDigits: 0 });
}

export interface SmartHint {
  type: 'warning' | 'info' | 'suggestion';
  message: string;
}

export function getSmartHints(data: ContractData): SmartHint[] {
  const hints: SmartHint[] = [];
  const total = calculateTotal(data);
  if (total > 50000) hints.push({ type: 'warning', message: 'Wysoka kwota – rozważ weryfikację tożsamości zleceniodawcy.' });
  if (RENOVATION_TYPES.includes(data.contractType as any) && !data.hasAcceptanceProtocol) hints.push({ type: 'suggestion', message: 'Przy remoncie rekomendowany jest protokół odbioru.' });
  if (data.materialsValue > 5000 && data.paymentSplit !== 'materials_upfront') hints.push({ type: 'suggestion', message: 'Materiały są kosztowne – rozważ opcję „materiały z góry".' });
  return hints;
}
