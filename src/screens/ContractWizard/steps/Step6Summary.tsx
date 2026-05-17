import React from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ContractData, CONTRACT_TYPE_LABELS, CATEGORY_LABELS, PAYMENT_SPLIT_LABELS, RENOVATION_TYPES } from '../../../types/contract';
import { HintBox } from '../components/FormField';
import { calculatePaymentBreakdown, getSmartHints } from '../../../utils/pricing';
import { useSettings } from '../../../context/SettingsContext';
import { C } from '../../../theme';

interface Props { data: ContractData; updateData: (updates: Partial<ContractData>) => void; totalAmount: number; goToStep: (step: number) => void; onCreateContract: () => void; }

function SummaryRow({ label, value, warning }: { label: string; value: string; warning?: boolean }) {
  return (
    <View style={rStyles.row}>
      <Text style={rStyles.label}>{label}</Text>
      <Text style={[rStyles.value, warning && rStyles.valueWarning]}>{value}</Text>
    </View>
  );
}

function SummarySection({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
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

export default function Step6Summary({ data, totalAmount, goToStep, onCreateContract }: Props) {
  const { formatAmount } = useSettings();
  const hints = getSmartHints(data);
  const bd = calculatePaymentBreakdown(data);
  const isRenovation = RENOVATION_TYPES.includes(data.contractType as any);
  const roomsTotal = data.rooms.reduce((sum, r) => sum + r.area * r.pricePerM2, 0);

  const warnings: string[] = [];
  if (!data.contractType) warnings.push('Brak typu umowy');
  if (totalAmount === 0) warnings.push('Kwota umowy wynosi 0 zł');
  if (!data.paymentSplit) warnings.push('Brak modelu płatności');
  if (!data.deadline) warnings.push('Brak terminu realizacji');

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.stepTitle}>Podsumowanie</Text>
        <Text style={styles.stepDesc}>Sprawdź dane i utwórz umowę.</Text>
      </View>

      {warnings.length > 0 && (
        <View style={styles.warningsBox}>
          <Text style={styles.warningsTitle}>⚠️ Brakujące dane ({warnings.length})</Text>
          {warnings.map(w => <Text key={w} style={styles.warningItem}>• {w}</Text>)}
        </View>
      )}

      {hints.map((hint, i) => <HintBox key={i} type={hint.type} message={hint.message} />)}

      <SummarySection title="Podstawy" onEdit={() => goToStep(1)}>
        <SummaryRow label="Typ" value={data.contractType ? CONTRACT_TYPE_LABELS[data.contractType] : '—'} warning={!data.contractType} />
        {isRenovation && data.category && <SummaryRow label="Obiekt" value={CATEGORY_LABELS[data.category]} />}
        {data.title ? <SummaryRow label="Tytuł" value={data.title} /> : null}
        <SummaryRow label="Termin" value={data.deadline || '—'} warning={!data.deadline} />
      </SummarySection>

      {isRenovation && data.stages.length > 0 && (
        <SummarySection title={`Etapy (${data.stages.length})`} onEdit={() => goToStep(2)}>
          {data.stages.map((s, i) => (
            <SummaryRow key={s.id} label={`Etap ${i + 1}: ${s.icon} ${s.name}`} value={s.amount > 0 ? formatAmount(s.amount) : s.deadline || '—'} />
          ))}
        </SummarySection>
      )}

      {isRenovation && data.rooms.length > 0 && (
        <SummarySection title={`Wycena (${data.rooms.length} pom.)`} onEdit={() => goToStep(3)}>
          {data.rooms.map(r => (
            <SummaryRow key={r.id} label={r.name} value={r.area > 0 && r.pricePerM2 > 0 ? formatAmount(r.area * r.pricePerM2) : r.area > 0 ? `${r.area} m²` : '—'} />
          ))}
          {data.materialsValue > 0 && <SummaryRow label="Materiały" value={formatAmount(data.materialsValue)} />}
        </SummarySection>
      )}

      {!isRenovation && (
        <SummarySection title="Kwota" onEdit={() => goToStep(2)}>
          <SummaryRow label="Wartość zlecenia" value={data.lumpSumPrice > 0 ? formatAmount(data.lumpSumPrice) : '—'} warning={data.lumpSumPrice === 0} />
        </SummarySection>
      )}

      <SummarySection title="Płatność" onEdit={() => goToStep(isRenovation ? 4 : 2)}>
        <SummaryRow label="Model" value={data.paymentSplit ? PAYMENT_SPLIT_LABELS[data.paymentSplit] : '—'} warning={!data.paymentSplit} />
        {bd.total > 0 && <SummaryRow label="Depozyt" value={formatAmount(bd.deposit)} />}
        {data.hasAcceptanceProtocol && <SummaryRow label="Protokół odbioru" value="Wymagany ✓" />}
        {data.correctionDays > 0 && <SummaryRow label="Poprawki" value={`${data.correctionDays} dni`} />}
      </SummarySection>

      <View style={styles.finalCard}>
        <Text style={styles.finalLabel}>ŁĄCZNA KWOTA UMOWY</Text>
        <Text style={styles.finalValue}>{formatAmount(totalAmount)}</Text>
        {bd.deposit > 0 && <Text style={styles.finalDeposit}>w tym {formatAmount(bd.deposit)} w depozycie</Text>}
      </View>

      <TouchableOpacity style={[styles.createBtn, warnings.length > 0 && styles.createBtnWarning]} onPress={onCreateContract} activeOpacity={0.85}>
        <Text style={styles.createBtnText}>{warnings.length > 0 ? '⚠️ Utwórz mimo braków' : '✓ Utwórz umowę'}</Text>
      </TouchableOpacity>
      {warnings.length > 0 && <Text style={styles.createHint}>Uzupełnij brakujące dane, aby umowa była bardziej precyzyjna.</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 32 },
  header: { marginBottom: 16 },
  stepTitle: { color: C.white, fontSize: 22, fontWeight: '800', marginBottom: 4 },
  stepDesc: { color: C.textSec, fontSize: 14, lineHeight: 20 },
  warningsBox: { backgroundColor: C.warningBg, borderRadius: C.radiusSm, borderWidth: 1, borderColor: C.warning, padding: 12, marginBottom: 12 },
  warningsTitle: { color: C.warning, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  warningItem: { color: C.warning, fontSize: 12, lineHeight: 20 },
  finalCard: { backgroundColor: C.purpleSubtle, borderRadius: C.radius, borderWidth: 1.5, borderColor: C.purple, padding: 20, alignItems: 'center', marginVertical: 16 },
  finalLabel: { color: C.purpleLight, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6 },
  finalValue: { color: C.white, fontSize: 34, fontWeight: '800', letterSpacing: -0.5 },
  finalDeposit: { color: C.textSec, fontSize: 13, marginTop: 4 },
  createBtn: { backgroundColor: C.purple, borderRadius: C.radius, paddingVertical: 16, alignItems: 'center', marginBottom: 8, elevation: 6 },
  createBtnWarning: { backgroundColor: '#92400E' },
  createBtnText: { color: C.white, fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },
  createHint: { color: C.textMuted, fontSize: 12, textAlign: 'center', lineHeight: 18 },
});
const rStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 5 },
  label: { color: C.textSec, fontSize: 13, flex: 1, paddingRight: 8 },
  value: { color: C.white, fontSize: 13, fontWeight: '500', flex: 1.2, textAlign: 'right' },
  valueWarning: { color: C.warning },
});
const ssStyles = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: C.radius, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { color: C.purpleLight, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  editBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  editText: { color: C.purple, fontSize: 12, fontWeight: '600' },
});
