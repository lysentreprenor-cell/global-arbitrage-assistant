import React, { useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import { ContractData, Room } from '../../../types/contract';
import { useSettings } from '../../../context/SettingsContext';
import { C } from '../../../theme';

interface Props { data: ContractData; updateData: (updates: Partial<ContractData>) => void; totalAmount: number; }

const ROOM_PRESETS = ['Salon', 'Sypialnia', 'Łazienka', 'Kuchnia', 'Przedpokój', 'Gabinet', 'Pralnia', 'Taras', 'Garaż', 'Piwnica'];
const RATE_PRESETS = [80, 120, 160, 200, 280, 350];

function RoomPricingCard({ room, onUpdate, onRemove, currencySymbol, onRateCommit }: {
  room: Room;
  onUpdate: (r: Room) => void;
  onRemove: () => void;
  currencySymbol: string;
  onRateCommit: (rate: number) => void;
}) {
  const subtotal = room.area * room.pricePerM2;
  return (
    <View style={rStyles.card}>
      <View style={rStyles.topRow}>
        <Text style={rStyles.roomName}>{room.name}</Text>
        {subtotal > 0 && <Text style={rStyles.subtotal}>{subtotal.toLocaleString()} {currencySymbol}</Text>}
        <TouchableOpacity onPress={onRemove} style={rStyles.removeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={rStyles.removeIcon}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={rStyles.fieldsRow}>
        <View style={rStyles.field}>
          <Text style={rStyles.fieldLabel}>Powierzchnia (m²)</Text>
          <TextInput
            style={rStyles.input}
            value={room.area > 0 ? String(room.area) : ''}
            onChangeText={v => onUpdate({ ...room, area: parseFloat(v.replace(',', '.')) || 0 })}
            placeholder="0"
            placeholderTextColor={C.textMuted}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={rStyles.field}>
          <Text style={rStyles.fieldLabel}>Stawka ({currencySymbol}/m²)</Text>
          <TextInput
            style={rStyles.input}
            value={room.pricePerM2 > 0 ? String(room.pricePerM2) : ''}
            onChangeText={v => onUpdate({ ...room, pricePerM2: parseFloat(v.replace(',', '.')) || 0 })}
            onEndEditing={e => {
              const rate = parseFloat(e.nativeEvent.text.replace(',', '.'));
              if (rate > 0) onRateCommit(rate);
            }}
            placeholder="0"
            placeholderTextColor={C.textMuted}
            keyboardType="decimal-pad"
          />
        </View>
      </View>

      <View style={rStyles.rateSuggestions}>
        {RATE_PRESETS.map(rate => (
          <TouchableOpacity
            key={rate}
            style={[rStyles.rateChip, room.pricePerM2 === rate && rStyles.rateChipActive]}
            onPress={() => { onUpdate({ ...room, pricePerM2: rate }); onRateCommit(rate); }}
            activeOpacity={0.75}
          >
            <Text style={[rStyles.rateChipText, room.pricePerM2 === rate && rStyles.rateChipTextActive]}>
              {rate} {currencySymbol}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {room.area > 0 && room.pricePerM2 > 0 && (
        <View style={rStyles.calcRow}>
          <Text style={rStyles.calcText}>{room.area} m² × {room.pricePerM2} {currencySymbol}/m² =</Text>
          <Text style={rStyles.calcResult}>{subtotal.toLocaleString()} {currencySymbol}</Text>
        </View>
      )}
    </View>
  );
}

export default function StepRenovationPricing({ data, updateData, totalAmount }: Props) {
  const [newRoomName, setNewRoomName] = useState('');
  const { currencySymbol, defaultPricePerM2, rememberPricePerM2, formatAmount } = useSettings();

  const addRoom = (name: string) => {
    if (!name.trim()) return;
    const room: Room = {
      id: Date.now().toString(),
      name: name.trim(),
      area: 0,
      pricePerM2: defaultPricePerM2,
      scope: [],
    };
    updateData({ rooms: [...data.rooms, room] });
    setNewRoomName('');
  };

  const updateRoom = (updated: Room) => updateData({ rooms: data.rooms.map(r => r.id === updated.id ? updated : r) });
  const removeRoom = (id: string) => updateData({ rooms: data.rooms.filter(r => r.id !== id) });

  const roomsTotal = data.rooms.reduce((sum, r) => sum + r.area * r.pricePerM2, 0);
  const grandTotal = roomsTotal + data.materialsValue + data.additionalCosts;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.stepTitle}>Wycena prac</Text>
        <Text style={styles.stepDesc}>
          Podaj powierzchnię i stawkę za m². Suma obliczana automatycznie.
          {defaultPricePerM2 > 0 ? ` Ostatnia stawka: ${defaultPricePerM2} ${currencySymbol}/m².` : ''}
        </Text>
      </View>

      {data.rooms.map(room => (
        <RoomPricingCard
          key={room.id}
          room={room}
          onUpdate={updateRoom}
          onRemove={() => removeRoom(room.id)}
          currencySymbol={currencySymbol}
          onRateCommit={rememberPricePerM2}
        />
      ))}

      <View style={styles.addSection}>
        <Text style={styles.addLabel}>Dodaj pomieszczenie</Text>
        <View style={styles.addRow}>
          <TextInput
            style={styles.addInput}
            value={newRoomName}
            onChangeText={setNewRoomName}
            placeholder="Własna nazwa…"
            placeholderTextColor={C.textMuted}
            onSubmitEditing={() => addRoom(newRoomName)}
            returnKeyType="done"
          />
          <TouchableOpacity style={styles.addBtn} onPress={() => addRoom(newRoomName)} activeOpacity={0.8}>
            <Text style={styles.addBtnText}>+</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.presetsRow}>
          {ROOM_PRESETS.map(name => (
            <TouchableOpacity key={name} style={styles.preset} onPress={() => addRoom(name)} activeOpacity={0.75}>
              <Text style={styles.presetText}>{name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.extrasSection}>
        <Text style={styles.extrasLabel}>Koszty dodatkowe</Text>
        <View style={styles.extraRow}>
          <Text style={styles.extraName}>Materiały ({currencySymbol})</Text>
          <TextInput
            style={styles.extraInput}
            value={data.materialsValue > 0 ? String(data.materialsValue) : ''}
            onChangeText={v => updateData({ materialsValue: parseFloat(v.replace(',', '.')) || 0 })}
            placeholder="0"
            placeholderTextColor={C.textMuted}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={styles.extraRow}>
          <Text style={styles.extraName}>Inne (transport, sprzęt…)</Text>
          <TextInput
            style={styles.extraInput}
            value={data.additionalCosts > 0 ? String(data.additionalCosts) : ''}
            onChangeText={v => updateData({ additionalCosts: parseFloat(v.replace(',', '.')) || 0 })}
            placeholder="0"
            placeholderTextColor={C.textMuted}
            keyboardType="decimal-pad"
          />
        </View>
      </View>

      <View style={styles.totalCard}>
        {roomsTotal > 0 && (
          <View style={styles.totalBreakRow}>
            <Text style={styles.totalBreakLabel}>Robocizna ({data.rooms.length} pom.)</Text>
            <Text style={styles.totalBreakValue}>{formatAmount(roomsTotal)}</Text>
          </View>
        )}
        {data.materialsValue > 0 && (
          <View style={styles.totalBreakRow}>
            <Text style={styles.totalBreakLabel}>Materiały</Text>
            <Text style={styles.totalBreakValue}>{formatAmount(data.materialsValue)}</Text>
          </View>
        )}
        {data.additionalCosts > 0 && (
          <View style={styles.totalBreakRow}>
            <Text style={styles.totalBreakLabel}>Inne koszty</Text>
            <Text style={styles.totalBreakValue}>{formatAmount(data.additionalCosts)}</Text>
          </View>
        )}
        <View style={styles.totalDivider} />
        <Text style={styles.totalLabel}>ŁĄCZNA KWOTA UMOWY</Text>
        <Text style={styles.totalValue}>{formatAmount(grandTotal)}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 32 },
  header: { marginBottom: 18 },
  stepTitle: { color: C.white, fontSize: 22, fontWeight: '800', marginBottom: 4 },
  stepDesc: { color: C.textSec, fontSize: 13, lineHeight: 19 },
  addSection: { marginBottom: 16 },
  addLabel: { color: C.textSec, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 },
  addRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  addInput: { flex: 1, backgroundColor: C.inputBg, borderRadius: C.radiusSm, borderWidth: 1, borderColor: C.border, color: C.white, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  addBtn: { width: 44, height: 44, backgroundColor: C.purple, borderRadius: C.radiusSm, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { color: C.white, fontSize: 22, fontWeight: '300', lineHeight: 28 },
  presetsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  preset: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border },
  presetText: { color: C.textSec, fontSize: 12 },
  extrasSection: { backgroundColor: C.card, borderRadius: C.radius, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 16 },
  extrasLabel: { color: C.textSec, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12 },
  extraRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  extraName: { color: C.textSec, fontSize: 13, flex: 1 },
  extraInput: { width: 100, backgroundColor: C.inputBg, borderRadius: C.radiusSm, borderWidth: 1, borderColor: C.border, color: C.white, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, textAlign: 'right' },
  totalCard: { backgroundColor: C.purpleSubtle, borderRadius: C.radius, borderWidth: 1.5, borderColor: C.purple, padding: 20, alignItems: 'center' },
  totalBreakRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 6 },
  totalBreakLabel: { color: C.textSec, fontSize: 13 },
  totalBreakValue: { color: C.white, fontSize: 13, fontWeight: '500' },
  totalDivider: { height: 1, backgroundColor: C.purpleDim, width: '100%', marginVertical: 12 },
  totalLabel: { color: C.purpleLight, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6 },
  totalValue: { color: C.white, fontSize: 34, fontWeight: '800', letterSpacing: -0.5 },
});

const rStyles = StyleSheet.create({
  card: { backgroundColor: C.cardAlt, borderRadius: C.radius, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 10 },
  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  roomName: { color: C.white, fontSize: 15, fontWeight: '700', flex: 1 },
  subtotal: { color: C.purpleLight, fontSize: 14, fontWeight: '700', marginRight: 10 },
  removeBtn: { padding: 2 },
  removeIcon: { color: C.textMuted, fontSize: 13 },
  fieldsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  field: { flex: 1 },
  fieldLabel: { color: C.textSec, fontSize: 10, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 },
  input: { backgroundColor: C.inputBg, borderRadius: C.radiusSm, borderWidth: 1, borderColor: C.border, color: C.white, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, fontWeight: '600', textAlign: 'center' },
  rateSuggestions: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 8 },
  rateChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border },
  rateChipActive: { backgroundColor: C.purpleDim, borderColor: C.purple },
  rateChipText: { color: C.textMuted, fontSize: 11 },
  rateChipTextActive: { color: C.purpleLight, fontWeight: '600' },
  calcRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: C.border },
  calcText: { color: C.textSec, fontSize: 12 },
  calcResult: { color: C.success, fontSize: 14, fontWeight: '700' },
});
