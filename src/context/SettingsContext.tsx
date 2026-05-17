import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Currency = 'PLN' | 'EUR' | 'USD' | 'GBP' | 'CZK';

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  PLN: 'zł',
  EUR: '€',
  USD: '$',
  GBP: '£',
  CZK: 'Kč',
};

const CURRENCY_LOCALES: Record<Currency, string> = {
  PLN: 'pl-PL',
  EUR: 'de-DE',
  USD: 'en-US',
  GBP: 'en-GB',
  CZK: 'cs-CZ',
};

const STORAGE_KEY = 'app_settings_v1';

interface Settings {
  currency: Currency;
  defaultPricePerM2: number;
  defaultHourlyRate: number;
  defaultMaterialsRate: number;
}

const DEFAULT_SETTINGS: Settings = {
  currency: 'PLN',
  defaultPricePerM2: 0,
  defaultHourlyRate: 0,
  defaultMaterialsRate: 0,
};

interface SettingsContextValue {
  currency: Currency;
  currencySymbol: string;
  defaultPricePerM2: number;
  defaultHourlyRate: number;
  setCurrency: (c: Currency) => void;
  rememberPricePerM2: (rate: number) => void;
  rememberHourlyRate: (rate: number) => void;
  formatAmount: (amount: number) => string;
}

const SettingsContext = createContext<SettingsContextValue>({
  currency: 'PLN',
  currencySymbol: 'zł',
  defaultPricePerM2: 0,
  defaultHourlyRate: 0,
  setCurrency: () => {},
  rememberPricePerM2: () => {},
  rememberHourlyRate: () => {},
  formatAmount: (n) => `${n} zł`,
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try {
          const parsed: Partial<Settings> = JSON.parse(raw);
          setSettings(prev => ({ ...prev, ...parsed }));
        } catch {}
      }
    });
  }, []);

  const persist = useCallback((next: Settings) => {
    setSettings(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const setCurrency = useCallback((currency: Currency) => {
    persist({ ...settings, currency });
  }, [settings, persist]);

  const rememberPricePerM2 = useCallback((rate: number) => {
    if (rate > 0) persist({ ...settings, defaultPricePerM2: rate });
  }, [settings, persist]);

  const rememberHourlyRate = useCallback((rate: number) => {
    if (rate > 0) persist({ ...settings, defaultHourlyRate: rate });
  }, [settings, persist]);

  const formatAmount = useCallback((amount: number): string => {
    const locale = CURRENCY_LOCALES[settings.currency];
    return amount.toLocaleString(locale, {
      style: 'currency',
      currency: settings.currency,
      maximumFractionDigits: 0,
    });
  }, [settings.currency]);

  return (
    <SettingsContext.Provider value={{
      currency: settings.currency,
      currencySymbol: CURRENCY_SYMBOLS[settings.currency],
      defaultPricePerM2: settings.defaultPricePerM2,
      defaultHourlyRate: settings.defaultHourlyRate,
      setCurrency,
      rememberPricePerM2,
      rememberHourlyRate,
      formatAmount,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext);
}
