import React from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ContractData, PaymentSplit } from '../../../types/contract';
import { Section, Field, Input, HintBox } from '../components/FormField';
import { calculatePaymentBreakdown, formatCurrency } from '../../../utils/pricing';
import { C } from '../../../theme';

interface Props {
  data: ContractData;
  updateData: (updates: Partial<ContractData>) => void;
  totalAmount: number;
}

const SPLIT_OPTIONS: { value: PaymentSplit; label: string; desc: string; icon: string }[] = [
  {
    value: 'full_deposit',
    label: 'Całość w depozycie',
    desc: 'Cała kwota trafia do depozytu i jest wypłacana po wykonaniu.',
    icon: '🔒',
  },
  {
    value: 'selected_items',
    label: 'Wybrane pozycje w depozycie',
    desc: 'Część płatna na koniec, reszta w depozycie.',
    icon: '📋',
  },
  {
    value: 'materials_upfront',
    label: 'Materiały z góry',
    desc: 'Materiały płatne od razu, reszta w depozycie.',
    icon: '📦',
  },
  {
    value: 'custom',
    label: 'Własny podział',
    desc: 'Ustaw procentowy podział: z góry, depozyt, po wykonaniu.',
    icon: '⚙️',
  },
];

function PaymentBreakdownCard({ data, totalAmount }: { data: ContractData; totalAmount: number }) {
  const bd = calculatePaymentBreakdown(data);
  if (bd.total === 0) return null;

  return (
    <View style={bStyles.card}>
      <Text style={bStyles.title}>Podział płatności</Text>
      <View style={bStyles.rows}>
        <View style={bStyles.row}>
          <View style={bStyles.dot} />
          <Text style={bStyles.rowLabel}>Płatne z góry</Text>
          <Text style={bStyles.rowValue}>{formatCurrency(bd.upfront)}</Text>
        </View>
        <View style={bStyles.row}>
          <View style={[bStyles.dot, bStyles.dotPurple]} />
          <Text style={bStyles.rowLabel}>W depozycie</Text>
          <Text style={[bStyles.rowValue, bStyles.rowValuePurple]}>{formatCurrency(bd.deposit)}</Text>
        </View>
        <View style={bStyles.row}>
          <View style={[bStyles.dot, bStyles.dotGreen]} />
          <Text style={bStyles.rowLabel}>Płatne po wykonaniu</Text>
          <Text style={[bStyles.rowValue, bStyles.rowValueGreen]}>{formatCurrency(bd.afterCompletion)}</Text>
        </View>
      </View>
      <View style={bStyles.divider} />
      <View style={bStyles.row}>
        <Text style={bStyles.totalLabel}>Łącznie</Text>
        <Text style={bStyles.totalValue}>{formatCurrency(bd.total)}</Text>
      </View>
    </View>
  );
}

export default function Step4Payment({ data, updateData, totalAmount }: Props) {
  const customTotal = data.upfrontPercent + data.depositPercent + data.afterPercent;
  const customValid = data.paymentSplit !== 'custom' || customTotal === 100;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.stepNum}>Krok 4</Text>
        <Text style={styles.stepTitle}>Płatność i depozyt</Text>
        <Text style={styles.stepDesc}>Określ, jak zostanie podzielona kwota {formatCurrency(totalAmount)}.</Text>
      </View>

      <Section title="Model płatności">
        {SPLIT_OPTIONS.map(opt => {
          const isActive = data.paymentSplit === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[styles.splitCard, isActive && styles.splitCardActive]}
              onPress={() => updateData({ paymentSplit: opt.value })}
              activeOpacity={0.8}
            >
              <View style={styles.splitRow}>
                <Text style={styles.splitIcon}>{opt.icon}</Text>
                <View style={styles.splitInfo}>
                  <Text style={[styles.splitLabel, isActive && styles.splitLabelActive]}>{opt.label}</Text>
                  <Text style={styles.splitDesc}>{opt.desc}</Text>
                </View>
                <View style={[styles.radio, isActive && styles.radioActive]}>
                  {isActive && <View style={styles.radioDot} />}
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </Section>

      {data.paymentSplit === 'selected_items' && (
        <Section title="Konfiguracja">
          <Field label="Procent w depozycie (%)" hint="Reszta płatna po wykonaniu.">
            <Input
              value={String(data.depositPercent)}
              onChangeText={v => {
                const p = Math.min(100, Math.max(0, parseInt(v) || 0));
                updateData({ depositPercent: p, afterPercent: 100 - p });
              }}
              keyboardType="numeric"
              placeholder="100"
            />
          </Field>
        </Section>
      )}

      {data.paymentSplit === 'custom' && (
        <Section title="Własny podział (suma = 100%)">
          <Field label="Płatne z góry (%)">
            <Input
              value={String(data.upfrontPercent)}
              onChangeText={v => updateData({ upfrontPercent: Math.min(100, parseInt(v) || 0) })}
              keyboardType="numeric"
              placeholder="0"
            />
          </Field>
          <Field label="W depozycie (%)">
            <Input
              value={String(data.depositPercent)}
              onChangeText={v => updateData({ depositPercent: Math.min(100, parseInt(v) || 0) })}
              keyboardType="numeric"
              placeholder="100"
            />
          </Field>
          <Field label="Płatne po wykonaniu (%)">
            <Input
              value={String(data.afterPercent)}
              onChangeText={v => updateData({ afterPercent: Math.min(100, parseInt(v) || 0) })}
              keyboardType="numeric"
              placeholder="0"
            />
          </Field>
          {!customValid && (
            <HintBox type="warning" message={`Suma procentów wynosi ${customTotal}% – powinna wynosić 100%.`} />
          )}
        </Section>
      )}

      <PaymentBreakdownCard data={data} totalAmount={totalAmount} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 24 },
  header: { marginBottom: 16 },
  stepNum: { color: C.purple, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  stepTitle: { color: C.white, fontSize: 22, fontWeight: '800', marginBottom: 4 },
  stepDesc: { color: C.textSec, fontSize: 14, lineHeight: 20 },
  splitCard: {
    backgroundColor: C.cardAlt,
    borderRadius: C.radiusSm,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    marginBottom: 8,
  },
  splitCardActive: { backgroundColor: C.purpleSubtle, borderColor: C.purple },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  splitIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  splitInfo: { flex: 1 },
  splitLabel: { color: C.textSec, fontSize: 14, fontWeight: '600' },
  splitLabelActive: { color: C.purpleLight },
  splitDesc: { color: C.textMuted, fontSize: 12, marginTop: 2, lineHeight: 16 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: C.purple },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.purple },
});

const bStyles = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: C.radius,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginTop: 4,
  },
  title: { color: C.textSec, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12 },
  rows: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.textMuted, marginRight: 10 },
  dotPurple: { backgroundColor: C.purple },
  dotGreen: { backgroundColor: C.success },
  rowLabel: { flex: 1, color: C.textSec, fontSize: 13 },
  rowValue: { color: C.white, fontSize: 13, fontWeight: '600' },
  rowValuePurple: { color: C.purpleLight },
  rowValueGreen: { color: C.success },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 12 },
  totalLabel: { flex: 1, color: C.white, fontSize: 14, fontWeight: '700' },
  totalValue: { color: C.white, fontSize: 16, fontWeight: '800' },
});
