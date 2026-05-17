import React from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { C } from '../../../theme';

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={sStyles.section}><Text style={sStyles.title}>{title}</Text>{children}</View>;
}

export function Field({ label, children, hint }: { label?: string; children: React.ReactNode; hint?: string }) {
  return <View style={fStyles.field}>{label && <Text style={fStyles.label}>{label}</Text>}{children}{hint && <Text style={fStyles.hint}>{hint}</Text>}</View>;
}

export function Input({ value, onChangeText, placeholder, keyboardType = 'default', multiline }: { value: string; onChangeText: (v: string) => void; placeholder?: string; keyboardType?: 'default' | 'numeric' | 'decimal-pad'; multiline?: boolean }) {
  return <TextInput style={[iStyles.input, multiline && iStyles.multiline]} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={C.textMuted} keyboardType={keyboardType} multiline={multiline} numberOfLines={multiline ? 3 : 1} selectionColor={C.purple} />;
}

export function ChipGroup({ options, selected, onSelect }: { options: { value: string; label: string }[]; selected: string; onSelect: (v: string) => void }) {
  return (
    <View style={cgStyles.row}>
      {options.map(opt => (
        <TouchableOpacity key={opt.value} style={[cgStyles.chip, selected === opt.value && cgStyles.chipActive]} onPress={() => onSelect(opt.value)} activeOpacity={0.75}>
          <Text style={[cgStyles.chipText, selected === opt.value && cgStyles.chipTextActive]}>{opt.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function Toggle({ label, value, onToggle, icon }: { label: string; value: boolean; onToggle: () => void; icon?: string }) {
  return (
    <TouchableOpacity style={tStyles.row} onPress={onToggle} activeOpacity={0.75}>
      <View style={[tStyles.box, value && tStyles.boxActive]}>{value && <Text style={tStyles.check}>✓</Text>}</View>
      {icon && <Text style={tStyles.icon}>{icon}</Text>}
      <Text style={[tStyles.label, value && tStyles.labelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function HintBox({ type, message }: { type: 'warning' | 'info' | 'suggestion'; message: string }) {
  const colors = {
    warning: { bg: C.warningBg, border: C.warning, text: C.warning, icon: '⚠️' },
    info: { bg: C.infoBg, border: C.info, text: C.info, icon: 'ℹ️' },
    suggestion: { bg: C.purpleSubtle, border: C.purpleDim, text: C.purpleLight, icon: '💡' },
  };
  const c = colors[type];
  return (
    <View style={[hStyles.box, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Text style={hStyles.icon}>{c.icon}</Text>
      <Text style={[hStyles.text, { color: c.text }]}>{message}</Text>
    </View>
  );
}

const sStyles = StyleSheet.create({ section: { backgroundColor: C.card, borderRadius: C.radius, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border }, title: { color: C.purpleLight, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12 } });
const fStyles = StyleSheet.create({ field: { marginBottom: 12 }, label: { color: C.textSec, fontSize: 13, fontWeight: '500', marginBottom: 6 }, hint: { color: C.textMuted, fontSize: 11, marginTop: 4 } });
const iStyles = StyleSheet.create({ input: { backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border, borderRadius: C.radiusSm, color: C.white, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 }, multiline: { height: 80, textAlignVertical: 'top' } });
const cgStyles = StyleSheet.create({ row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border }, chipActive: { backgroundColor: C.purpleDim, borderColor: C.purple }, chipText: { color: C.textSec, fontSize: 13, fontWeight: '500' }, chipTextActive: { color: C.purpleLight, fontWeight: '700' } });
const tStyles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 }, box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.inputBg, alignItems: 'center', justifyContent: 'center', marginRight: 10 }, boxActive: { backgroundColor: C.purpleDim, borderColor: C.purple }, check: { color: C.purpleLight, fontSize: 12, fontWeight: '700' }, icon: { marginRight: 6, fontSize: 14 }, label: { color: C.textSec, fontSize: 14 }, labelActive: { color: C.white } });
const hStyles = StyleSheet.create({ box: { flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, borderRadius: C.radiusSm, padding: 10, marginBottom: 10, gap: 8 }, icon: { fontSize: 14, lineHeight: 20 }, text: { flex: 1, fontSize: 12, lineHeight: 18 } });
