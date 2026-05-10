import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { ContractData } from '../../../types/contract';
import { Section, Field, Input, HintBox } from '../components/FormField';
import { calculateTotal, formatCurrency } from '../../../utils/pricing';
import { C } from '../../../theme';

interface Props {
  data: ContractData;
  updateData: (updates: Partial<ContractData>) => void;
  totalAmount: number;
}

export default function Step3Pricing({ data, updateData, totalAmount }: Props) {
  const isPerM2 = data.pricingMethod === 'per_m2' || data.pricingMethod === '';
  const isLumpSum = data.pricingMethod === 'ryczalt';
  const isHourly = data.pricingMethod === 'godzinowy';

  const roomsArea = data.rooms.reduce((s, r) => s + r.area, 0);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.stepNum}>Krok 3</Text>
        <Text style={styles.stepTitle}>Wycena</Text>
        <Text style={styles.stepDesc}>Wprowadź koszty, a suma zostanie obliczona automatycznie.</Text>
      </View>

      {totalAmount > 50000 && (
        <HintBox
          type="warning"
          message="Wysoka kwota – rozważ weryfikację tożsamości zleceniodawcy lub zmniejsz kwotę startową."
        />
      )}

      {data.materialsValue > 5000 && (
        <HintBox
          type="suggestion"
          message="Materiały są kosztowne – w kroku 4 określ, czy mają być opłacone z góry czy w depozycie."
        />
      )}

      {(isPerM2 || isHourly) && (
        <Section title="Podstawa wyceny">
          {isPerM2 && (
            <>
              <Field
                label="Całkowita powierzchnia (m²)"
                hint={roomsArea > 0 ? `Suma pomieszczeń: ${roomsArea} m²` : undefined}
              >
                <Input
                  value={data.totalArea > 0 ? String(data.totalArea) : ''}
                  onChangeText={v => updateData({ totalArea: parseFloat(v) || 0 })}
                  placeholder="0"
                  keyboardType="decimal-pad"
                />
              </Field>
              <Field label="Cena za m²">
                <Input
                  value={data.pricePerM2 > 0 ? String(data.pricePerM2) : ''}
                  onChangeText={v => updateData({ pricePerM2: parseFloat(v) || 0 })}
                  placeholder="0"
                  keyboardType="decimal-pad"
                />
              </Field>
              {data.totalArea > 0 && data.pricePerM2 > 0 && (
                <View style={styles.subTotal}>
                  <Text style={styles.subTotalLabel}>Robocizna</Text>
                  <Text style={styles.subTotalValue}>{formatCurrency(data.totalArea * data.pricePerM2)}</Text>
                </View>
              )}
            </>
          )}
          {isHourly && (
            <>
              <Field label="Stawka godzinowa (PLN/h)">
                <Input
                  value={data.hourlyRate > 0 ? String(data.hourlyRate) : ''}
                  onChangeText={v => updateData({ hourlyRate: parseFloat(v) || 0 })}
                  placeholder="0"
                  keyboardType="decimal-pad"
                />
              </Field>
              <Field label="Szacowana liczba godzin">
                <Input
                  value={data.estimatedHours > 0 ? String(data.estimatedHours) : ''}
                  onChangeText={v => updateData({ estimatedHours: parseFloat(v) || 0 })}
                  placeholder="0"
                  keyboardType="decimal-pad"
                />
              </Field>
              {data.hourlyRate > 0 && data.estimatedHours > 0 && (
                <View style={styles.subTotal}>
                  <Text style={styles.subTotalLabel}>Robocizna</Text>
                  <Text style={styles.subTotalValue}>{formatCurrency(data.hourlyRate * data.estimatedHours)}</Text>
                </View>
              )}
            </>
          )}
        </Section>
      )}

      {isLumpSum && (
        <Section title="Ryczałt">
          <Field label="Całkowita kwota umowy (PLN)">
            <Input
              value={data.lumpSumPrice > 0 ? String(data.lumpSumPrice) : ''}
              onChangeText={v => updateData({ lumpSumPrice: parseFloat(v) || 0 })}
              placeholder="0"
              keyboardType="decimal-pad"
            />
          </Field>
        </Section>
      )}

      {!isLumpSum && (
        <Section title="Dodatkowe koszty">
          <Field label="Wartość materiałów (PLN)" hint="Zostanie uwzględniona w łącznej kwocie.">
            <Input
              value={data.materialsValue > 0 ? String(data.materialsValue) : ''}
              onChangeText={v => updateData({ materialsValue: parseFloat(v) || 0 })}
              placeholder="0"
              keyboardType="decimal-pad"
            />
          </Field>
          <Field label="Inne dodatkowe koszty (PLN)" hint="Transport, wynajem sprzętu itp.">
            <Input
              value={data.additionalCosts > 0 ? String(data.additionalCosts) : ''}
              onChangeText={v => updateData({ additionalCosts: parseFloat(v) || 0 })}
              placeholder="0"
              keyboardType="decimal-pad"
            />
          </Field>
        </Section>
      )}

      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>ŁĄCZNA KWOTA UMOWY</Text>
        <Text style={styles.totalValue}>{formatCurrency(totalAmount)}</Text>
        {!isLumpSum && (
          <View style={styles.breakdown}>
            {(isPerM2 && data.totalArea > 0 && data.pricePerM2 > 0) && (
              <View style={styles.bRow}>
                <Text style={styles.bLabel}>Robocizna ({data.totalArea} m² × {data.pricePerM2} PLN)</Text>
                <Text style={styles.bValue}>{formatCurrency(data.totalArea * data.pricePerM2)}</Text>
              </View>
            )}
            {(isHourly && data.hourlyRate > 0 && data.estimatedHours > 0) && (
              <View style={styles.bRow}>
                <Text style={styles.bLabel}>Robocizna ({data.estimatedHours}h × {data.hourlyRate} PLN)</Text>
                <Text style={styles.bValue}>{formatCurrency(data.hourlyRate * data.estimatedHours)}</Text>
              </View>
            )}
            {data.materialsValue > 0 && (
              <View style={styles.bRow}>
                <Text style={styles.bLabel}>Materiały</Text>
                <Text style={styles.bValue}>{formatCurrency(data.materialsValue)}</Text>
              </View>
            )}
            {data.additionalCosts > 0 && (
              <View style={styles.bRow}>
                <Text style={styles.bLabel}>Dodatkowe</Text>
                <Text style={styles.bValue}>{formatCurrency(data.additionalCosts)}</Text>
              </View>
            )}
          </View>
        )}
      </View>
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
  subTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  subTotalLabel: { color: C.textSec, fontSize: 13 },
  subTotalValue: { color: C.white, fontSize: 13, fontWeight: '600' },
  totalCard: {
    backgroundColor: C.purpleSubtle,
    borderRadius: C.radius,
    borderWidth: 1.5,
    borderColor: C.purple,
    padding: 20,
    alignItems: 'center',
    marginTop: 4,
  },
  totalLabel: {
    color: C.purpleLight,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  totalValue: {
    color: C.white,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  breakdown: { width: '100%', marginTop: 16, gap: 6 },
  bRow: { flexDirection: 'row', justifyContent: 'space-between' },
  bLabel: { color: C.textSec, fontSize: 12 },
  bValue: { color: C.white, fontSize: 12, fontWeight: '600' },
});
