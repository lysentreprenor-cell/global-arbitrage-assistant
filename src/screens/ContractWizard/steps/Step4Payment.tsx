import React from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ContractData, PaymentSplit } from '../../../types/contract';
import { Field, Input, HintBox } from '../components/FormField';
import { calculatePaymentBreakdown } from '../../../utils/pricing';
import { useSettings } from '../../../context/SettingsContext';
import { C } from '../../../theme';

interface Props { data: ContractData; updateData: (updates: Partial<ContractData>) => void; totalAmount: number; }

const SPLIT_OPTIONS: { value: PaymentSplit; label: string; desc: string; icon: string }[] = [
  { value: 'per_stage', label: 'Płatność po każdym etapie', desc: 'Depozyt uwalniany po odbiorze każdej fazy prac.', icon: '📋' },
  { value: 'full_deposit', label: 'Całość w depozycie', desc: 'Cała kwota trafia do depozytu, wypłacana po finałowym odbiorze.', icon: '🔒' },
  { value: 'materials_upfront', label: 'Materiały z góry', desc: 'Materiały płatne od razu, robocizna po wykonaniu.', icon: '📦' },
  { value: 'custom', label: 'Własny podział', desc: 'Ustaw procentowy podział: z góry, depozyt, po wykonaniu.', icon: '⚙️' },
];

export default function Step4Payment({ data, updateData, totalAmount }: Props) {
  const { formatAmount } = useSettings();
  const bd = calculatePaymentBreakdown(data);
  const customTotal = data.upfrontPercent + data.depositPercent + data.afterPercent;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.stepTitle}>Płatność i depozyt</Text>
        <Text style={styles.stepDesc}>Jak podzielona zostanie kwota {formatAmount(totalAmount)}?</Text>
      </View>

      <View style={styles.section}>
        {SPLIT_OPTIONS.map(opt => {
          const isActive = data.paymentSplit === opt.value;
          return (
            <TouchableOpacity key={opt.value} style={[styles.splitCard, isActive && styles.splitCardActive]} onPress={() => updateData({ paymentSplit: opt.value })} activeOpacity={0.8}>
              <Text style={styles.splitIcon}>{opt.icon}</Text>
              <View style={styles.splitInfo}>
                <Text style={[styles.splitLabel, isActive && styles.splitLabelActive]}>{opt.label}</Text>
                <Text style={styles.splitDesc}>{opt.desc}</Text>
              </View>
              <View style={[styles.radio, isActive && styles.radioActive]}>{isActive && <View style={styles.radioDot} />}</View>
            </TouchableOpacity>
          );
        })}
      </View>

      {data.paymentSplit === 'custom' && (
        <View style={styles.customSection}>
          <Text style={styles.sectionTitle}>Własny podział (suma = 100%)</Text>
          <Field label="Płatne z góry (%)"><Input value={String(data.upfrontPercent)} onChangeText={v => updateData({ upfrontPercent: Math.min(100, parseInt(v) || 0) })} keyboardType="numeric" placeholder="0" /></Field>
          <Field label="W depozycie (%)"><Input value={String(data.depositPercent)} onChangeText={v => updateData({ depositPercent: Math.min(100, parseInt(v) || 0) })} keyboardType="numeric" placeholder="100" /></Field>
          <Field label="Płatne po wykonaniu (%)"><Input value={String(data.afterPercent)} onChangeText={v => updateData({ afterPercent: Math.min(100, parseInt(v) || 0) })} keyboardType="numeric" placeholder="0" /></Field>
          {customTotal !== 100 && <HintBox type="warning" message={`Suma: ${customTotal}% – musi wynosić 100%.`} />}
        </View>
      )}

      {bd.total > 0 && (
        <View style={styles.breakdownCard}>
          <Text style={styles.breakdownTitle}>Podział płatności</Text>
          <View style={styles.bdRows}>
            {bd.upfront > 0 && <View style={styles.bdRow}><View style={[styles.bdDot, { backgroundColor: C.warning }]} /><Text style={styles.bdLabel}>Płatne z góry</Text><Text style={styles.bdValue}>{formatAmount(bd.upfront)}</Text></View>}
            <View style={styles.bdRow}><View style={[styles.bdDot, { backgroundColor: C.purple }]} /><Text style={styles.bdLabel}>W depozycie</Text><Text style={[styles.bdValue, { color: C.purpleLight }]}>{formatAmount(bd.deposit)}</Text></View>
            {bd.afterCompletion > 0 && <View style={styles.bdRow}><View style={[styles.bdDot, { backgroundColor: C.success }]} /><Text style={styles.bdLabel}>Po wykonaniu</Text><Text style={[styles.bdValue, { color: C.success }]}>{formatAmount(bd.afterCompletion)}</Text></View>}
          </View>
          <View style={styles.bdDivider} />
          <View style={styles.bdRow}><Text style={styles.bdTotalLabel}>Łącznie</Text><Text style={styles.bdTotalValue}>{formatAmount(bd.total)}</Text></View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Protokół i terminy</Text>
        <TouchableOpacity style={[styles.toggleRow, data.hasAcceptanceProtocol && styles.toggleRowActive]} onPress={() => updateData({ hasAcceptanceProtocol: !data.hasAcceptanceProtocol })} activeOpacity={0.8}>
          <View style={styles.toggleInfo}>
            <Text style={[styles.toggleLabel, data.hasAcceptanceProtocol && styles.toggleLabelActive]}>📄 Protokół odbioru wymagany</Text>
            <Text style={styles.toggleDesc}>Obie strony podpisują przed wypłatą depozytu</Text>
          </View>
          <View style={[styles.toggle, data.hasAcceptanceProtocol && styles.toggleOn]}>
            <View style={[styles.toggleKnob, data.hasAcceptanceProtocol && styles.toggleKnobOn]} />
          </View>
        </TouchableOpacity>
        <Field label="Termin na poprawki (dni)" hint="Dni roboczych od odbioru"><Input value={data.correctionDays > 0 ? String(data.correctionDays) : ''} onChangeText={v => updateData({ correctionDays: parseInt(v) || 0 })} placeholder="7" keyboardType="numeric" /></Field>
        <Field label="Wypłata depozytu (dni od odbioru)"><Input value={data.paymentDeadlineDays > 0 ? String(data.paymentDeadlineDays) : ''} onChangeText={v => updateData({ paymentDeadlineDays: parseInt(v) || 0 })} placeholder="14" keyboardType="numeric" /></Field>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 32 },
  header: { marginBottom: 18 },
  stepTitle: { color: C.white, fontSize: 22, fontWeight: '800', marginBottom: 4 },
  stepDesc: { color: C.textSec, fontSize: 14, lineHeight: 20 },
  section: { marginBottom: 16 },
  sectionTitle: { color: C.textSec, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 },
  splitCard: { backgroundColor: C.cardAlt, borderRadius: C.radiusSm, borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  splitCardActive: { backgroundColor: C.purpleSubtle, borderColor: C.purple },
  splitIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  splitInfo: { flex: 1 },
  splitLabel: { color: C.textSec, fontSize: 14, fontWeight: '600' },
  splitLabelActive: { color: C.purpleLight },
  splitDesc: { color: C.textMuted, fontSize: 12, marginTop: 2, lineHeight: 16 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: C.purple },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.purple },
  customSection: { backgroundColor: C.card, borderRadius: C.radius, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 16 },
  breakdownCard: { backgroundColor: C.card, borderRadius: C.radius, borderWidth: 1, borderColor: C.border, padding: 16, marginBottom: 16 },
  breakdownTitle: { color: C.textSec, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12 },
  bdRows: { gap: 10 },
  bdRow: { flexDirection: 'row', alignItems: 'center' },
  bdDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  bdLabel: { flex: 1, color: C.textSec, fontSize: 13 },
  bdValue: { color: C.white, fontSize: 13, fontWeight: '600' },
  bdDivider: { height: 1, backgroundColor: C.border, marginVertical: 12 },
  bdTotalLabel: { flex: 1, color: C.white, fontSize: 14, fontWeight: '700' },
  bdTotalValue: { color: C.white, fontSize: 16, fontWeight: '800' },
  toggleRow: { backgroundColor: C.cardAlt, borderRadius: C.radiusSm, borderWidth: 1, borderColor: C.border, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  toggleRowActive: { backgroundColor: C.purpleSubtle, borderColor: C.purple },
  toggleInfo: { flex: 1 },
  toggleLabel: { color: C.textSec, fontSize: 14, fontWeight: '600' },
  toggleLabelActive: { color: C.purpleLight },
  toggleDesc: { color: C.textMuted, fontSize: 12, marginTop: 2 },
  toggle: { width: 44, height: 24, borderRadius: 12, backgroundColor: C.border, justifyContent: 'center', paddingHorizontal: 3 },
  toggleOn: { backgroundColor: C.purple },
  toggleKnob: { width: 18, height: 18, borderRadius: 9, backgroundColor: C.textMuted },
  toggleKnobOn: { backgroundColor: C.white, alignSelf: 'flex-end' },
});
