import React from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ContractData, PaymentSplit } from '../../../types/contract';
import { Field, Input, HintBox } from '../components/FormField';
import { calculatePaymentBreakdown } from '../../../utils/pricing';
import { useSettings } from '../../../context/SettingsContext';
import { C } from '../../../theme';

interface Props { data: ContractData; updateData: (updates: Partial<ContractData>) => void; totalAmount: number; }

const PAYMENT_OPTIONS: { value: PaymentSplit; label: string; icon: string; desc: string }[] = [
  { value: 'full_deposit', label: 'Całość w depozycie', icon: '🔒', desc: 'Środki blokowane do wykonania' },
  { value: 'materials_upfront', label: 'Zaliczka + depozyt', icon: '📦', desc: 'Część z góry, reszta po wykonaniu' },
  { value: 'custom', label: 'Własny podział', icon: '⚙️', desc: 'Ustaw własne procenty' },
];

export default function StepSimpleDetails({ data, updateData, totalAmount }: Props) {
  const { formatAmount } = useSettings();
  const bd = calculatePaymentBreakdown(data);
  const customTotal = data.upfrontPercent + data.depositPercent + data.afterPercent;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.stepTitle}>Kwota i płatność</Text>
        <Text style={styles.stepDesc}>Podaj wartość zlecenia i wybierz model płatności.</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Kwota zlecenia</Text>
        <Field hint="Łączna wartość umowy w złotych.">
          <Input value={data.lumpSumPrice > 0 ? String(data.lumpSumPrice) : ''} onChangeText={v => updateData({ lumpSumPrice: parseFloat(v.replace(',', '.')) || 0 })} placeholder="0" keyboardType="decimal-pad" />
        </Field>
        {data.lumpSumPrice > 0 && (
          <View style={styles.priceTag}>
            <Text style={styles.priceTagText}>{formatAmount(data.lumpSumPrice)}</Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Model płatności</Text>
        {PAYMENT_OPTIONS.map(opt => {
          const isActive = data.paymentSplit === opt.value;
          return (
            <TouchableOpacity key={opt.value} style={[styles.payCard, isActive && styles.payCardActive]} onPress={() => updateData({ paymentSplit: opt.value })} activeOpacity={0.8}>
              <Text style={styles.payIcon}>{opt.icon}</Text>
              <View style={styles.payInfo}>
                <Text style={[styles.payLabel, isActive && styles.payLabelActive]}>{opt.label}</Text>
                <Text style={styles.payDesc}>{opt.desc}</Text>
              </View>
              <View style={[styles.radio, isActive && styles.radioActive]}>{isActive && <View style={styles.radioDot} />}</View>
            </TouchableOpacity>
          );
        })}

        {data.paymentSplit === 'custom' && (
          <View style={styles.customSection}>
            <View style={styles.customRow}>
              <Text style={styles.customLabel}>Z góry (%)</Text>
              <Input value={String(data.upfrontPercent)} onChangeText={v => updateData({ upfrontPercent: Math.min(100, parseInt(v) || 0) })} keyboardType="numeric" placeholder="0" />
            </View>
            <View style={styles.customRow}>
              <Text style={styles.customLabel}>W depozycie (%)</Text>
              <Input value={String(data.depositPercent)} onChangeText={v => updateData({ depositPercent: Math.min(100, parseInt(v) || 0) })} keyboardType="numeric" placeholder="100" />
            </View>
            <View style={styles.customRow}>
              <Text style={styles.customLabel}>Po wykonaniu (%)</Text>
              <Input value={String(data.afterPercent)} onChangeText={v => updateData({ afterPercent: Math.min(100, parseInt(v) || 0) })} keyboardType="numeric" placeholder="0" />
            </View>
            {customTotal !== 100 && <HintBox type="warning" message={`Suma: ${customTotal}% – musi wynosić 100%.`} />}
          </View>
        )}
      </View>

      {bd.total > 0 && (
        <View style={styles.breakdownCard}>
          <Text style={styles.breakdownTitle}>Podział kwoty</Text>
          {bd.upfront > 0 && <View style={styles.bdRow}><Text style={styles.bdLabel}>Płatne z góry</Text><Text style={styles.bdValue}>{formatAmount(bd.upfront)}</Text></View>}
          <View style={styles.bdRow}>
            <View style={styles.bdDot} />
            <Text style={styles.bdLabel}>W depozycie</Text>
            <Text style={[styles.bdValue, styles.bdValuePurple]}>{formatAmount(bd.deposit)}</Text>
          </View>
          {bd.afterCompletion > 0 && <View style={styles.bdRow}><Text style={styles.bdLabel}>Po wykonaniu</Text><Text style={[styles.bdValue, { color: C.success }]}>{formatAmount(bd.afterCompletion)}</Text></View>}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Warunki (opcjonalnie)</Text>
        <View style={styles.condRow}>
          <Text style={styles.condLabel}>Protokół odbioru</Text>
          <TouchableOpacity style={[styles.toggle, data.hasAcceptanceProtocol && styles.toggleOn]} onPress={() => updateData({ hasAcceptanceProtocol: !data.hasAcceptanceProtocol })} activeOpacity={0.8}>
            <View style={[styles.toggleKnob, data.hasAcceptanceProtocol && styles.toggleKnobOn]} />
          </TouchableOpacity>
        </View>
        <View style={styles.condRow}>
          <Text style={styles.condLabel}>Termin na poprawki (dni)</Text>
          <View style={styles.condInputWrap}><Input value={data.correctionDays > 0 ? String(data.correctionDays) : ''} onChangeText={v => updateData({ correctionDays: parseInt(v) || 0 })} placeholder="7" keyboardType="numeric" /></View>
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
  section: { marginBottom: 20 },
  sectionTitle: { color: C.textSec, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 },
  priceTag: { alignSelf: 'flex-start', backgroundColor: C.purpleSubtle, borderRadius: C.radiusSm, borderWidth: 1, borderColor: C.purple, paddingHorizontal: 12, paddingVertical: 6, marginTop: 8 },
  priceTagText: { color: C.purpleLight, fontSize: 18, fontWeight: '800' },
  payCard: { backgroundColor: C.cardAlt, borderRadius: C.radiusSm, borderWidth: 1, borderColor: C.border, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  payCardActive: { backgroundColor: C.purpleSubtle, borderColor: C.purple },
  payIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  payInfo: { flex: 1 },
  payLabel: { color: C.textSec, fontSize: 14, fontWeight: '600' },
  payLabelActive: { color: C.purpleLight },
  payDesc: { color: C.textMuted, fontSize: 12, marginTop: 2 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: C.purple },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.purple },
  customSection: { backgroundColor: C.card, borderRadius: C.radiusSm, borderWidth: 1, borderColor: C.border, padding: 12, gap: 8 },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  customLabel: { color: C.textSec, fontSize: 13, flex: 1 },
  breakdownCard: { backgroundColor: C.card, borderRadius: C.radius, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 20, gap: 10 },
  breakdownTitle: { color: C.textSec, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 },
  bdRow: { flexDirection: 'row', alignItems: 'center' },
  bdDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.purple, marginRight: 8 },
  bdLabel: { color: C.textSec, fontSize: 13, flex: 1 },
  bdValue: { color: C.white, fontSize: 13, fontWeight: '600' },
  bdValuePurple: { color: C.purpleLight },
  condRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  condLabel: { color: C.textSec, fontSize: 14, flex: 1 },
  condInputWrap: { width: 70 },
  toggle: { width: 44, height: 24, borderRadius: 12, backgroundColor: C.border, justifyContent: 'center', paddingHorizontal: 3 },
  toggleOn: { backgroundColor: C.purple },
  toggleKnob: { width: 18, height: 18, borderRadius: 9, backgroundColor: C.textMuted },
  toggleKnobOn: { backgroundColor: C.white, alignSelf: 'flex-end' },
});
