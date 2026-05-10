import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { ContractData, ContractType, ContractCategory, PricingMethod } from '../../../types/contract';
import { Section, Field, ChipGroup, Input } from '../components/FormField';
import { C } from '../../../theme';

interface Props {
  data: ContractData;
  updateData: (updates: Partial<ContractData>) => void;
}

const CONTRACT_TYPES: { value: ContractType; label: string }[] = [
  { value: 'remont', label: '🔨 Remont' },
  { value: 'budowa', label: '🏗️ Budowa' },
  { value: 'instalacja', label: '⚡ Instalacja' },
  { value: 'wykonczenie', label: '🪟 Wykończenie' },
  { value: 'inne', label: '📋 Inne' },
];

const CATEGORIES: { value: ContractCategory; label: string }[] = [
  { value: 'mieszkaniowy', label: '🏠 Mieszkaniowy' },
  { value: 'komercyjny', label: '🏢 Komercyjny' },
  { value: 'przemyslowy', label: '🏭 Przemysłowy' },
];

const PRICING_METHODS: { value: PricingMethod; label: string }[] = [
  { value: 'per_m2', label: 'Za m²' },
  { value: 'ryczalt', label: 'Ryczałt' },
  { value: 'godzinowy', label: 'Godzinowy' },
];

export default function Step1Basics({ data, updateData }: Props) {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.stepNum}>Krok 1</Text>
        <Text style={styles.stepTitle}>Podstawy umowy</Text>
        <Text style={styles.stepDesc}>Określ typ, kategorię i sposób wyceny prac.</Text>
      </View>

      <Section title="Typ umowy">
        <Field label="Rodzaj prac">
          <View style={styles.typeGrid}>
            {CONTRACT_TYPES.map(opt => {
              const isActive = data.contractType === opt.value;
              return (
                <View key={opt.value} style={{ width: '48%' }}>
                  <View style={[styles.typeCard, isActive && styles.typeCardActive]}>
                    <Text
                      style={[styles.typeCardText, isActive && styles.typeCardTextActive]}
                      onPress={() => updateData({ contractType: opt.value })}
                    >
                      {opt.label}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </Field>
      </Section>

      <Section title="Kategoria">
        <Field label="Typ obiektu">
          <ChipGroup
            options={CATEGORIES}
            selected={data.category}
            onSelect={v => updateData({ category: v as ContractCategory })}
          />
        </Field>
      </Section>

      <Section title="Sposób wyceny">
        <Field label="Metoda rozliczenia" hint="Możesz zmienić w kroku 3.">
          <ChipGroup
            options={PRICING_METHODS}
            selected={data.pricingMethod}
            onSelect={v => updateData({ pricingMethod: v as PricingMethod })}
          />
        </Field>
      </Section>

      <Section title="Termin realizacji">
        <Field label="Data zakończenia prac" hint="Format: RRRR-MM-DD">
          <Input
            value={data.deadline}
            onChangeText={v => updateData({ deadline: v })}
            placeholder="np. 2024-06-30"
          />
        </Field>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 24 },
  header: { marginBottom: 16 },
  stepNum: {
    color: C.purple,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  stepTitle: { color: C.white, fontSize: 22, fontWeight: '800', marginBottom: 4 },
  stepDesc: { color: C.textSec, fontSize: 14, lineHeight: 20 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeCard: {
    borderRadius: C.radiusSm,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.inputBg,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  typeCardActive: {
    backgroundColor: C.purpleDim,
    borderColor: C.purple,
  },
  typeCardText: { color: C.textSec, fontSize: 13, fontWeight: '500', textAlign: 'center' },
  typeCardTextActive: { color: C.purpleLight, fontWeight: '700' },
});
