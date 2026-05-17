import React from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ContractData, ContractType, ContractCategory, RENOVATION_TYPES } from '../../../types/contract';
import { Field, Input } from '../components/FormField';
import { useSettings, Currency, CURRENCY_SYMBOLS } from '../../../context/SettingsContext';
import { C } from '../../../theme';

interface Props { data: ContractData; updateData: (updates: Partial<ContractData>) => void; }

const CONTRACT_TYPES: { value: ContractType; label: string; icon: string; desc: string }[] = [
  { value: 'remont', label: 'Remont', icon: '🔨', desc: 'Prace remontowe z etapami' },
  { value: 'budowa', label: 'Budowa', icon: '🏗️', desc: 'Roboty budowlane' },
  { value: 'instalacja', label: 'Instalacja', icon: '⚡', desc: 'El., wod-kan, klimatyzacja' },
  { value: 'wykonczenie', label: 'Wykończenie', icon: '🪟', desc: 'Prace wykończeniowe' },
  { value: 'inne', label: 'Inne zlecenie', icon: '📋', desc: 'Usługa, transport, sprzedaż…' },
];

const CATEGORIES: { value: ContractCategory; label: string; icon: string }[] = [
  { value: 'mieszkaniowy', label: 'Mieszkanie / dom', icon: '🏠' },
  { value: 'komercyjny', label: 'Lokal / biuro', icon: '🏢' },
  { value: 'przemyslowy', label: 'Obiekt przemysłowy', icon: '🏭' },
];

const CURRENCIES: Currency[] = ['PLN', 'EUR', 'USD', 'GBP', 'CZK'];

export default function Step1Basics({ data, updateData }: Props) {
  const { currency, setCurrency } = useSettings();
  const isRenovation = RENOVATION_TYPES.includes(data.contractType as any);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.stepTitle}>Jaki rodzaj umowy?</Text>
        <Text style={styles.stepDesc}>Typ umowy wyznacza kolejne kroki kreatora.</Text>
      </View>

      <View style={styles.typeGrid}>
        {CONTRACT_TYPES.map(opt => {
          const isActive = data.contractType === opt.value;
          return (
            <TouchableOpacity key={opt.value} style={[styles.typeCard, isActive && styles.typeCardActive]} onPress={() => updateData({ contractType: opt.value })} activeOpacity={0.75}>
              <Text style={styles.typeIcon}>{opt.icon}</Text>
              <Text style={[styles.typeLabel, isActive && styles.typeLabelActive]}>{opt.label}</Text>
              <Text style={styles.typeDesc}>{opt.desc}</Text>
              {isActive && <View style={styles.typeCheck}><Text style={styles.typeCheckText}>✓</Text></View>}
            </TouchableOpacity>
          );
        })}
      </View>

      {isRenovation && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Typ obiektu</Text>
          <View style={styles.catRow}>
            {CATEGORIES.map(c => {
              const isActive = data.category === c.value;
              return (
                <TouchableOpacity key={c.value} style={[styles.catChip, isActive && styles.catChipActive]} onPress={() => updateData({ category: c.value as ContractCategory })} activeOpacity={0.75}>
                  <Text style={styles.catIcon}>{c.icon}</Text>
                  <Text style={[styles.catLabel, isActive && styles.catLabelActive]}>{c.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {!isRenovation && data.contractType !== '' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tytuł zlecenia</Text>
          <Input value={data.title} onChangeText={v => updateData({ title: v })} placeholder="np. Wyprowadzenie psa, Transport mebli…" />
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Termin realizacji</Text>
        <Field hint="Format: RRRR-MM-DD">
          <Input value={data.deadline} onChangeText={v => updateData({ deadline: v })} placeholder="np. 2025-08-31" />
        </Field>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Waluta rozliczeń</Text>
        <View style={styles.currencyRow}>
          {CURRENCIES.map(c => {
            const isActive = currency === c;
            return (
              <TouchableOpacity key={c} style={[styles.currencyChip, isActive && styles.currencyChipActive]} onPress={() => setCurrency(c)} activeOpacity={0.75}>
                <Text style={[styles.currencyCode, isActive && styles.currencyCodeActive]}>{c}</Text>
                <Text style={[styles.currencySymbol, isActive && styles.currencySymbolActive]}>{CURRENCY_SYMBOLS[c]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 32 },
  header: { marginBottom: 20 },
  stepTitle: { color: C.white, fontSize: 22, fontWeight: '800', marginBottom: 4 },
  stepDesc: { color: C.textSec, fontSize: 14, lineHeight: 20 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  typeCard: { width: '47%', backgroundColor: C.cardAlt, borderRadius: C.radius, borderWidth: 1.5, borderColor: C.border, padding: 14, position: 'relative' },
  typeCardActive: { backgroundColor: C.purpleSubtle, borderColor: C.purple },
  typeIcon: { fontSize: 24, marginBottom: 6 },
  typeLabel: { color: C.white, fontSize: 14, fontWeight: '700', marginBottom: 3 },
  typeLabelActive: { color: C.purpleLight },
  typeDesc: { color: C.textMuted, fontSize: 11, lineHeight: 15 },
  typeCheck: { position: 'absolute', top: 10, right: 10, width: 18, height: 18, borderRadius: 9, backgroundColor: C.purple, alignItems: 'center', justifyContent: 'center' },
  typeCheckText: { color: C.white, fontSize: 10, fontWeight: '700' },
  section: { marginBottom: 20 },
  sectionTitle: { color: C.textSec, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 },
  catRow: { gap: 8 },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.cardAlt, borderRadius: C.radiusSm, borderWidth: 1, borderColor: C.border, paddingVertical: 10, paddingHorizontal: 14 },
  catChipActive: { backgroundColor: C.purpleDim, borderColor: C.purple },
  catIcon: { fontSize: 18 },
  catLabel: { color: C.textSec, fontSize: 14, fontWeight: '500' },
  catLabelActive: { color: C.purpleLight, fontWeight: '700' },
  currencyRow: { flexDirection: 'row', gap: 8 },
  currencyChip: { flex: 1, alignItems: 'center', paddingVertical: 10, backgroundColor: C.cardAlt, borderRadius: C.radiusSm, borderWidth: 1.5, borderColor: C.border },
  currencyChipActive: { backgroundColor: C.purpleDim, borderColor: C.purple },
  currencyCode: { color: C.textSec, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  currencyCodeActive: { color: C.purpleLight },
  currencySymbol: { color: C.textMuted, fontSize: 11, marginTop: 2 },
  currencySymbolActive: { color: C.purple },
});
