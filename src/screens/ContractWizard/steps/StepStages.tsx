import React, { useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import { ContractData, Stage } from '../../../types/contract';
import { useSettings } from '../../../context/SettingsContext';
import { C } from '../../../theme';

interface Props { data: ContractData; updateData: (updates: Partial<ContractData>) => void; totalAmount: number; }

const STAGE_PRESETS: { name: string; icon: string; scope: string[] }[] = [
  { name: 'Rozbiórka', icon: '🔨', scope: ['Wyburzenia', 'Wywóz gruzu', 'Ochrona podłóg'] },
  { name: 'Instalacje el.', icon: '⚡', scope: ['Okablowanie', 'Rozdzielnia', 'Punkty świetlne', 'Gniazdka'] },
  { name: 'Hydraulika', icon: '🔧', scope: ['Rury wod-kan', 'Grzejniki', 'Podejścia'] },
  { name: 'Tynki i wylewki', icon: '🪟', scope: ['Tynki wewnętrzne', 'Wylewki samopoziomujące', 'Szpachlowanie'] },
  { name: 'Glazura', icon: '🚿', scope: ['Płytki ścienne', 'Terakota', 'Fugowanie', 'Silikon'] },
  { name: 'Malowanie', icon: '🎨', scope: ['Gruntowanie', 'Malowanie ścian', 'Malowanie sufitów', 'Lamperie'] },
  { name: 'Podłogi', icon: '🪵', scope: ['Panele', 'Parkiet', 'Listwy', 'Cokoły'] },
  { name: 'Łazienka', icon: '🚿', scope: ['Kabina/wanna', 'WC', 'Umywalka', 'Lustra', 'Akcesoria'] },
  { name: 'Kuchnia', icon: '🍳', scope: ['Meble kuchenne', 'Blat', 'AGD', 'Kafelki'] },
  { name: 'Odbiór końcowy', icon: '✅', scope: ['Sprzątanie', 'Protokół odbioru', 'Poprawki'] },
];

const SCOPE_OPTIONS = ['Wyburzenia', 'Wywóz gruzu', 'Okablowanie', 'Rozdzielnia', 'Punkty świetlne', 'Gniazdka', 'Rury wod-kan', 'Grzejniki', 'Tynki wewnętrzne', 'Wylewki', 'Szpachlowanie', 'Płytki ścienne', 'Terakota', 'Fugowanie', 'Malowanie ścian', 'Malowanie sufitów', 'Panele', 'Parkiet', 'Listwy', 'Kabina/wanna', 'WC', 'Umywalka', 'Meble kuchenne', 'Blat', 'Sprzątanie', 'Protokół odbioru'];

function StageCard({ stage, index, onUpdate, onRemove, currencySymbol, formatAmount }: { stage: Stage; index: number; onUpdate: (s: Stage) => void; onRemove: () => void; currencySymbol: string; formatAmount: (n: number) => string }) {
  const [expanded, setExpanded] = useState(true);
  const toggleScope = (item: string) => onUpdate({ ...stage, scope: stage.scope.includes(item) ? stage.scope.filter(s => s !== item) : [...stage.scope, item] });

  return (
    <View style={sStyles.card}>
      <TouchableOpacity style={sStyles.header} onPress={() => setExpanded(e => !e)} activeOpacity={0.8}>
        <View style={sStyles.headerLeft}>
          <Text style={sStyles.etapBadge}>Etap {index + 1}</Text>
          <Text style={sStyles.stageName}>{stage.icon} {stage.name}</Text>
        </View>
        <View style={sStyles.headerRight}>
          {stage.amount > 0 && <Text style={sStyles.stageAmount}>{formatAmount(stage.amount)}</Text>}
          <Text style={sStyles.chevron}>{expanded ? '▲' : '▼'}</Text>
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={sStyles.body}>
          <Text style={sStyles.fieldLabel}>Zakres prac</Text>
          <View style={sStyles.scopeGrid}>
            {SCOPE_OPTIONS.map(item => (
              <TouchableOpacity key={item} style={[sStyles.chip, stage.scope.includes(item) && sStyles.chipActive]} onPress={() => toggleScope(item)} activeOpacity={0.75}>
                <Text style={[sStyles.chipText, stage.scope.includes(item) && sStyles.chipTextActive]}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={sStyles.row}>
            <View style={sStyles.halfField}>
              <Text style={sStyles.fieldLabel}>Kwota etapu ({currencySymbol})</Text>
              <TextInput
                style={sStyles.input}
                value={stage.amount > 0 ? String(stage.amount) : ''}
                onChangeText={v => onUpdate({ ...stage, amount: parseFloat(v.replace(',', '.')) || 0 })}
                placeholder="0"
                placeholderTextColor={C.textMuted}
                keyboardType="decimal-pad"
              />
            </View>
            <View style={sStyles.halfField}>
              <Text style={sStyles.fieldLabel}>Termin etapu</Text>
              <TextInput
                style={sStyles.input}
                value={stage.deadline}
                onChangeText={v => onUpdate({ ...stage, deadline: v })}
                placeholder="RRRR-MM-DD"
                placeholderTextColor={C.textMuted}
              />
            </View>
          </View>

          <TouchableOpacity onPress={onRemove} style={sStyles.removeBtn}>
            <Text style={sStyles.removeBtnText}>🗑 Usuń etap</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function StepStages({ data, updateData, totalAmount }: Props) {
  const { currencySymbol, formatAmount } = useSettings();
  const addStage = (preset: typeof STAGE_PRESETS[0]) => {
    const stage: Stage = { id: Date.now().toString(), name: preset.name, icon: preset.icon, scope: preset.scope, deadline: '', amount: 0 };
    updateData({ stages: [...data.stages, stage] });
  };
  const addCustomStage = () => {
    const stage: Stage = { id: Date.now().toString(), name: 'Własny etap', icon: '📋', scope: [], deadline: '', amount: 0 };
    updateData({ stages: [...data.stages, stage] });
  };
  const updateStage = (updated: Stage) => updateData({ stages: data.stages.map(s => s.id === updated.id ? updated : s) });
  const removeStage = (id: string) => updateData({ stages: data.stages.filter(s => s.id !== id) });
  const stagesTotal = data.stages.reduce((sum, s) => sum + s.amount, 0);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.stepTitle}>Etapy projektu</Text>
        <Text style={styles.stepDesc}>Podziel remont na fazy z osobnymi terminami i kwotami płatności.</Text>
      </View>

      {data.stages.length === 0 && (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyText}>Dodaj etapy z listy gotowych szablonów lub utwórz własny.</Text>
        </View>
      )}

      {data.stages.map((stage, index) => (
        <StageCard key={stage.id} stage={stage} index={index} onUpdate={updateStage} onRemove={() => removeStage(stage.id)} currencySymbol={currencySymbol} formatAmount={formatAmount} />
      ))}

      <Text style={styles.presetsTitle}>Dodaj etap</Text>
      <View style={styles.presetsGrid}>
        {STAGE_PRESETS.map(preset => (
          <TouchableOpacity key={preset.name} style={styles.presetBtn} onPress={() => addStage(preset)} activeOpacity={0.75}>
            <Text style={styles.presetIcon}>{preset.icon}</Text>
            <Text style={styles.presetLabel}>{preset.name}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[styles.presetBtn, styles.presetBtnCustom]} onPress={addCustomStage} activeOpacity={0.75}>
          <Text style={styles.presetIcon}>✏️</Text>
          <Text style={styles.presetLabel}>Własny etap</Text>
        </TouchableOpacity>
      </View>

      {data.stages.length > 0 && (
        <View style={styles.totalBar}>
          <View>
            <Text style={styles.totalBarLabel}>Suma etapów</Text>
            <Text style={styles.totalBarSub}>{data.stages.length} {data.stages.length === 1 ? 'etap' : data.stages.length < 5 ? 'etapy' : 'etapów'}</Text>
          </View>
          <Text style={styles.totalBarValue}>{formatAmount(stagesTotal)}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 32 },
  header: { marginBottom: 18 },
  stepTitle: { color: C.white, fontSize: 22, fontWeight: '800', marginBottom: 4 },
  stepDesc: { color: C.textSec, fontSize: 14, lineHeight: 20 },
  emptyBox: { alignItems: 'center', backgroundColor: C.cardAlt, borderRadius: C.radius, borderWidth: 1, borderColor: C.border, padding: 24, marginBottom: 20 },
  emptyIcon: { fontSize: 32, marginBottom: 8 },
  emptyText: { color: C.textSec, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  presetsTitle: { color: C.textSec, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10, marginTop: 8 },
  presetsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  presetBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.cardAlt, borderRadius: 20, borderWidth: 1, borderColor: C.border, paddingVertical: 8, paddingHorizontal: 12 },
  presetBtnCustom: { borderColor: C.purple, borderStyle: 'dashed' },
  presetIcon: { fontSize: 14 },
  presetLabel: { color: C.textSec, fontSize: 12, fontWeight: '500' },
  totalBar: { backgroundColor: C.purpleSubtle, borderRadius: C.radius, borderWidth: 1.5, borderColor: C.purple, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  totalBarLabel: { color: C.purpleLight, fontSize: 13, fontWeight: '700' },
  totalBarSub: { color: C.textSec, fontSize: 11, marginTop: 2 },
  totalBarValue: { color: C.white, fontSize: 26, fontWeight: '800' },
});

const sStyles = StyleSheet.create({
  card: { backgroundColor: C.cardAlt, borderRadius: C.radius, borderWidth: 1, borderColor: C.border, marginBottom: 10, overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  etapBadge: { color: C.purple, fontSize: 10, fontWeight: '700', backgroundColor: C.purpleDim, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  stageName: { color: C.white, fontSize: 14, fontWeight: '600', flex: 1 },
  stageAmount: { color: C.purpleLight, fontSize: 13, fontWeight: '700' },
  chevron: { color: C.textMuted, fontSize: 10 },
  body: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: C.border },
  fieldLabel: { color: C.textSec, fontSize: 11, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8, marginTop: 12 },
  scopeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border },
  chipActive: { backgroundColor: C.purpleDim, borderColor: C.purple },
  chipText: { color: C.textSec, fontSize: 11 },
  chipTextActive: { color: C.purpleLight, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 10 },
  halfField: { flex: 1 },
  input: { backgroundColor: C.inputBg, borderRadius: C.radiusSm, borderWidth: 1, borderColor: C.border, color: C.white, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  removeBtn: { marginTop: 12, alignSelf: 'flex-start' },
  removeBtnText: { color: C.error, fontSize: 12 },
});
