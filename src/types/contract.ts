export type ContractType = 'remont' | 'budowa' | 'instalacja' | 'wykonczenie' | 'inne';
export type ContractCategory = 'mieszkaniowy' | 'komercyjny' | 'przemyslowy';
export type PricingMethod = 'per_m2' | 'ryczalt' | 'godzinowy';
export type PaymentSplit = 'full_deposit' | 'selected_items' | 'materials_upfront' | 'custom';

export interface Room {
  id: string;
  name: string;
  area: number;
  scope: string[];
}

export interface ContractData {
  // Step 1 – Basics
  contractType: ContractType | '';
  category: ContractCategory | '';
  pricingMethod: PricingMethod | '';
  deadline: string;

  // Step 2 – Scope
  rooms: Room[];
  hasElectrical: boolean;
  hasPlumbing: boolean;
  hasMaterials: boolean;
  additionalItems: string[];

  // Step 3 – Pricing
  totalArea: number;
  pricePerM2: number;
  materialsValue: number;
  additionalCosts: number;
  lumpSumPrice: number;
  hourlyRate: number;
  estimatedHours: number;

  // Step 4 – Payment
  paymentSplit: PaymentSplit | '';
  upfrontPercent: number;
  depositPercent: number;
  afterPercent: number;

  // Step 5 – Conditions
  requiredProofs: string[];
  executionConditions: string[];
  hasAcceptanceProtocol: boolean;
  correctionDays: number;
  paymentDeadlineDays: number;
}

export const INITIAL_CONTRACT_DATA: ContractData = {
  contractType: '',
  category: '',
  pricingMethod: '',
  deadline: '',
  rooms: [],
  hasElectrical: false,
  hasPlumbing: false,
  hasMaterials: false,
  additionalItems: [],
  totalArea: 0,
  pricePerM2: 0,
  materialsValue: 0,
  additionalCosts: 0,
  lumpSumPrice: 0,
  hourlyRate: 0,
  estimatedHours: 0,
  paymentSplit: '',
  upfrontPercent: 0,
  depositPercent: 100,
  afterPercent: 0,
  requiredProofs: [],
  executionConditions: [],
  hasAcceptanceProtocol: false,
  correctionDays: 7,
  paymentDeadlineDays: 14,
};

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  remont: 'Remont',
  budowa: 'Budowa',
  instalacja: 'Instalacja',
  wykonczenie: 'Wykończenie',
  inne: 'Inne',
};

export const CATEGORY_LABELS: Record<ContractCategory, string> = {
  mieszkaniowy: 'Mieszkaniowy',
  komercyjny: 'Komercyjny',
  przemyslowy: 'Przemysłowy',
};

export const PRICING_METHOD_LABELS: Record<PricingMethod, string> = {
  per_m2: 'Za m²',
  ryczalt: 'Ryczałt',
  godzinowy: 'Godzinowy',
};

export const PAYMENT_SPLIT_LABELS: Record<PaymentSplit, string> = {
  full_deposit: 'Całość w depozycie',
  selected_items: 'Tylko wybrane pozycje',
  materials_upfront: 'Materiały z góry, reszta w depozycie',
  custom: 'Własny podział płatności',
};
