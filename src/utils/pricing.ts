import { ContractData } from '../types/contract';

export function calculateTotal(data: ContractData): number {
  switch (data.pricingMethod) {
    case 'per_m2':
      return data.totalArea * data.pricePerM2 + data.materialsValue + data.additionalCosts;
    case 'ryczalt':
      return data.lumpSumPrice;
    case 'godzinowy':
      return data.hourlyRate * data.estimatedHours + data.materialsValue + data.additionalCosts;
    default:
      return data.totalArea * data.pricePerM2 + data.materialsValue + data.additionalCosts;
  }
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

    case 'selected_items':
      return {
        upfront: 0,
        deposit: total * (data.depositPercent / 100),
        afterCompletion: total * ((100 - data.depositPercent) / 100),
        total,
      };

    case 'materials_upfront':
      return {
        upfront: data.materialsValue,
        deposit: total - data.materialsValue,
        afterCompletion: 0,
        total,
      };

    case 'custom': {
      const up = total * (data.upfrontPercent / 100);
      const dep = total * (data.depositPercent / 100);
      const after = total * (data.afterPercent / 100);
      return { upfront: up, deposit: dep, afterCompletion: after, total };
    }

    default:
      return { upfront: 0, deposit: total, afterCompletion: 0, total };
  }
}

export function formatCurrency(amount: number): string {
  return amount.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 });
}

export interface SmartHint {
  type: 'warning' | 'info' | 'suggestion';
  message: string;
  step?: number;
}

export function getSmartHints(data: ContractData): SmartHint[] {
  const hints: SmartHint[] = [];
  const total = calculateTotal(data);

  if (total > 50000) {
    hints.push({
      type: 'warning',
      step: 3,
      message: 'Wysoka kwota – rozważ weryfikację tożsamości zleceniodawcy lub zmniejsz kwotę startową.',
    });
  }

  if (data.rooms.length === 0 && data.contractType !== '') {
    hints.push({
      type: 'info',
      step: 2,
      message: 'Brak pomieszczeń – umowa jest mniej precyzyjna. Dodaj przynajmniej jedno pomieszczenie.',
    });
  }

  if (data.contractType === 'remont' && !data.hasAcceptanceProtocol) {
    hints.push({
      type: 'suggestion',
      step: 5,
      message: 'Przy remoncie rekomendowane jest zdjęcie wykonanej pracy i protokół odbioru.',
    });
  }

  if (data.materialsValue > 5000 && data.paymentSplit !== 'materials_upfront') {
    hints.push({
      type: 'suggestion',
      step: 4,
      message: 'Materiały są kosztowne – czy mają być opłacone z góry czy w depozycie?',
    });
  }

  if (data.correctionDays === 0 && data.executionConditions.length > 0) {
    hints.push({
      type: 'suggestion',
      step: 5,
      message: 'Brak terminu na poprawki – sugerujemy 7 dni roboczych.',
    });
  }

  return hints;
}
