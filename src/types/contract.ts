export type ContractType = 'remont' | 'budowa' | 'instalacja' | 'wykonczenie' | 'inne';
export type ContractCategory = 'mieszkaniowy' | 'komercyjny' | 'przemyslowy';
export type PricingMethod = 'per_m2' | 'ryczalt' | 'godzinowy';
export type PaymentSplit = 'full_deposit' | 'per_stage' | 'materials_upfront' | 'custom';

export const RENOVATION_TYPES: ContractType[] = ['remont', 'budowa', 'instalacja', 'wykonczenie'];

export interface Room {
  id: string;
  name: string;
  area: number;
  pricePerM2: number;
  scope: string[];
}

export interface Stage {
  id: string;
  name: string;
  icon: string;
  scope: string[];
  deadline: string;
  amount: number;
}

export interface ContractData {
  contractType: ContractType | '';
  category: ContractCategory | '';
  deadline: string;
  title: string;
  rooms: Room[];
  stages: Stage[];
  materialsValue: number;
  additionalCosts: number;
  lumpSumPrice: number;
  paymentSplit: PaymentSplit | '';
  upfrontPercent: number;
  depositPercent: number;
  afterPercent: number;
  hasAcceptanceProtocol: boolean;
  correctionDays: number;
  paymentDeadlineDays: number;
}

export const INITIAL_CONTRACT_DATA: ContractData = {
  contractType: '',
  category: '',
  deadline: '',
  title: '',
  rooms: [],
  stages: [],
  materialsValue: 0,
  additionalCosts: 0,
  lumpSumPrice: 0,
  paymentSplit: '',
  upfrontPercent: 0,
  depositPercent: 100,
  afterPercent: 0,
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

export const PAYMENT_SPLIT_LABELS: Record<PaymentSplit, string> = {
  full_deposit: 'Całość w depozycie',
  per_stage: 'Płatność po każdym etapie',
  materials_upfront: 'Materiały z góry, reszta w depozycie',
  custom: 'Własny podział płatności',
};
