import React from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ContractData, CONTRACT_TYPE_LABELS, CATEGORY_LABELS, PRICING_METHOD_LABELS, PAYMENT_SPLIT_LABELS } from '../../../types/contract';
import { HintBox } from '../components/FormField';
import { calculatePaymentBreakdown, formatCurrency, getSmartHints } from '../../../utils/pricing';
import { C } from '../../../theme';

interface Props {
  data: ContractData;
  updateData: (updates: Partial<ContractData>) => void;
  totalAmount: number;
  goToStep: (step: number) => void;
  onCreateContract: () => void;
}

function SummaryRow({ label, value, warning }: { label: string; value: string; warning?: boolean }) {
  return (
    <View style={rStyles.row}>
      <Text style={rStyles.label}>{label}</Text>
      <Text style={[rStyles.value, warning && rStyles.valueWarning]}>{value}</Text>
    </View>
  );
}

function SummarySection({
  title,
  step,
  onEdit,
  children,
}: {
  title: string;
  step: number;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={ssStyles.card}>
      <View style={ssStyles.header}>
        <Text style={ssStyles.title}>{title}</Text>
        <TouchableOpacity onPress={onEdit} style={ssStyles.editBtn} activeOpacity={0.75}>
          <Text style={ssStyles.editText}>Edytuj →</Text>
        </TouchableOpacity>
      </View>
      {children}
    </View>
  );
}

export default function Step6Summary({ data, updateData, totalAmount, goToStep, onCreateContract }: Props) {
  const hints = getSmartHints(data);
  const bd = calculatePaymentBreakdown(data);

  const warnings: string[] = [];
  if (!data.contractType) warnings.push('Brak typu umowy');
  if (!data.pricingMethod) warnings.push('Brak metody wyceny');
  if (totalAmount === 0) warnings.push('Kwota umowy wynosi 0 zł');
  if (!data.paymentSplit) warnings.push('Brak określonego modelu płatności');
  if (!data.deadline) warnings.push('Brak terminu realizacji');

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.stepNum}>Krok 6</Text>
        <Text style={styles.stepTitle}>Podsumowanie</Text>
        <Text style={styles.stepDesc}>Sprawdź wszystkie dane przed utworzeniem umowy.</Text>
      </View>

      {warnings.length > 0 && (
        <View style={styles.warningsBox}>
          <Text style={styles.warningsTitle}>⚠️ Brakujące dane ({warnings.length})</Text>
          {warnings.map(w => (
            <Text key={w} style={styles.warningItem}>• {w}</Text>
          ))}
        </View>
      )}

      {hints.map((hint, i) => (
        <HintBox key={i} type={hint.type} message={hint.message} />
      ))}

      <SummarySection title="Podstawy umowy" step={1} onEdit={() => goToStep(1)}>
        <SummaryRow label="Typ" value={data.contractType ? CONTRACT_TYPE_LABELS[data.contractType] : '—'} warning={!data.contractType} />
        <SummaryRow label="Kategoria" value={data.category ? CATEGORY_LABELS[data.category] : '—'} />
        <SummaryRow label="Wycena" value={data.pricingMethod ? PRICING_METHOD_LABELS[data.pricingMethod] : '—'} warning={!data.pricingMethod} />
        <SummaryRow label="Termin" value={data.deadline || '—'} warning={!data.deadline} />
      </SummarySection>

      <SummarySection title="Zakres prac" step={2} onEdit={() => goToStep(2)}>
        <SummaryRow
          label="Pomieszczenia"
          value={data.rooms.length > 0 ? data.rooms.map(r => r.name).join(', ') : '—'}
          warning={data.rooms.length === 0}
        />
        <SummaryRow
          label="Łączna pow."
          value={data.rooms.reduce((s, r) => s + r.area, 0) > 0
            ? `${data.rooms.reduce((s, r) => s + r.area, 0)} m²`
            : '—'}
        />
        <SummaryRow
          label="Instalacje"
          value={[
            data.hasElectrical && 'Elektryka',
            data.hasPlumbing && 'Hydraulika',
            data.hasMaterials && 'Materiały',
          ].filter(Boolean).join(', ') || 'Brak'}
        />
        {data.additionalItems.length > 0 && (
          <SummaryRow label="Dodatkowe" value={data.additionalItems.join(', ')} />
        )}
      </SummarySection>

      <SummarySection title="Wycena" step={3} onEdit={() => goToStep(3)}>
        {data.pricingMethod === 'per_m2' && (
          <>
            <SummaryRow label="Powierzchnia" value={`${data.totalArea} m²`} />
            <SummaryRow label="Cena za m²" value={formatCurrency(data.pricePerM2)} />
          </>
        )}
        {data.pricingMethod === 'ryczalt' && (
          <SummaryRow label="Ryczałt" value={formatCurrency(data.lumpSumPrice)} />
        )}
        {data.pricingMethod === 'godzinowy' && (
          <>
            <SummaryRow label="Stawka/h" value={formatCurrency(data.hourlyRate)} />
            <SummaryRow label="Godziny" value={`${data.estimatedHours}h`} />
          </>
        )}
        {data.materialsValue > 0 && (
          <SummaryRow label="Materiały" value={formatCurrency(data.materialsValue)} />
        )}
        {data.additionalCosts > 0 && (
          <SummaryRow label="Dodatkowe" value={formatCurrency(data.additionalCosts)} />
        )}
      </SummarySection>

      <SummarySection title="Płatność" step={4} onEdit={() => goToStep(4)}>
        <SummaryRow
          label="Model"
          value={data.paymentSplit ? PAYMENT_SPLIT_LABELS[data.paymentSplit] : '—'}
          warning={!data.paymentSplit}
        />
        {bd.total > 0 && (
          <>
            {bd.upfront > 0 && <SummaryRow label="Z góry" value={formatCurrency(bd.upfront)} />}
            <SummaryRow label="Depozyt" value={formatCurrency(bd.deposit)} />
            {bd.afterCompletion > 0 && <SummaryRow label="Po wykonaniu" value={formatCurrency(bd.afterCompletion)} />}
          </>
        )}
      </SummarySection>

      <SummarySection title="Warunki" step={5} onEdit={() => goToStep(5)}>
        <SummaryRow label="Protokół odbioru" value={data.hasAcceptanceProtocol ? 'Tak ✓' : 'Nie'} />
        <SummaryRow
          label="Dowody"
          value={data.requiredProofs.length > 0 ? `${data.requiredProofs.length} wymaganych` : 'Brak'}
        />
        <SummaryRow
          label="Termin poprawek"
          value={data.correctionDays > 0 ? `${data.correctionDays} dni` : 'Nie określono'}
          warning={data.correctionDays === 0}
        />
        <SummaryRow
          label="Wypłata depozytu"
          value={data.paymentDeadlineDays > 0 ? `${data.paymentDeadlineDays} dni od odbioru` : 'Nie określono'}
        />
      </SummarySection>

      <View style={styles.finalCard}>
        <Text style={styles.finalLabel}>ŁĄCZNA KWOTA UMOWY</Text>
        <Text style={styles.finalValue}>{formatCurrency(totalAmount)}</Text>
        {bd.deposit > 0 && (
          <Text style={styles.finalDeposit}>w tym {formatCurrency(bd.deposit)} w depozycie</Text>
        )}
      </View>

      <TouchableOpacity
        style={[styles.createBtn, warnings.length > 0 && styles.createBtnWarning]}
        onPress={onCreateContract}
        activeOpacity={0.85}
      >
        <Text style={styles.createBtnText}>
          {warnings.length > 0 ? '⚠️ Utwórz mimo braków' : '✓ Utwórz profesjonalną umowę'}
        </Text>
      </TouchableOpacity>

      {warnings.length > 0 && (
        <Text style={styles.createHint}>
          Uzupełnij brakujące dane, aby umowa była bardziej precyzyjna.
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 32 },
  header: { marginBottom: 16 },
  stepNum: { color: C.purple, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  stepTitle: { color: C.white, fontSize: 22, fontWeight: '800', marginBottom: 4 },
  stepDesc: { color: C.textSec, fontSize: 14, lineHeight: 20 },
  warningsBox: {
    backgroundColor: C.warningBg,
    borderRadius: C.radiusSm,
    borderWidth: 1,
    borderColor: C.warning,
    padding: 12,
    marginBottom: 12,
  },
  warningsTitle: { color: C.warning, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  warningItem: { color: C.warning, fontSize: 12, lineHeight: 20 },
  finalCard: {
    backgroundColor: C.purpleSubtle,
    borderRadius: C.radius,
    borderWidth: 1.5,
    borderColor: C.purple,
    padding: 20,
    alignItems: 'center',
    marginVertical: 16,
  },
  finalLabel: {
    color: C.purpleLight,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  finalValue: { color: C.white, fontSize: 34, fontWeight: '800', letterSpacing: -0.5 },
  finalDeposit: { color: C.textSec, fontSize: 13, marginTop: 4 },
  createBtn: {
    backgroundColor: C.purple,
    borderRadius: C.radius,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: C.purple,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  createBtnWarning: { backgroundColor: '#92400E' },
  createBtnText: { color: C.white, fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
  createHint: { color: C.textMuted, fontSize: 12, textAlign: 'center', lineHeight: 18 },
});

const rStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 5 },
  label: { color: C.textSec, fontSize: 13, flex: 1 },
  value: { color: C.white, fontSize: 13, fontWeight: '500', flex: 1.2, textAlign: 'right' },
  valueWarning: { color: C.warning },
});

const ssStyles = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: C.radius,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    marginBottom: 10,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { color: C.purpleLight, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  editBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  editText: { color: C.purple, fontSize: 12, fontWeight: '600' },
});
