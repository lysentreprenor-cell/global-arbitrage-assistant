import React from 'react';
import { SettingsProvider } from './src/context/SettingsContext';
import ContractWizard from './src/screens/ContractWizard';

export default function App() {
  return (
    <SettingsProvider>
      <ContractWizard />
    </SettingsProvider>
  );
}
