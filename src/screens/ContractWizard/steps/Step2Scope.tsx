import React, { useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ContractData, Room } from '../../../types/contract';
import { Section, Field, Toggle, Input, HintBox } from '../components/FormField';
import { C } from '../../../theme';

interface Props {
  data: ContractData;
  updateData: (updates: Partial<ContractData>) => void;
}

const ROOM_PRESETS = ['Salon', 'Sypialnia', 'Łazienka', 'Kuchnia', 'Przedpokój', 'Taras', 'Piwnica', 'Garaż'];
const SCOPE_OPTIONS = ['Malowanie', 'Podłogi', 'Sufity', 'Ściany', 'Okna', 'Drzwi', 'Tynki', 'Glazura', 'Elektryka', 'Hydraulika'];
const ADDITIONAL_OPTIONS = ['Transport materiałów', 'Wywóz gruzu', 'Sprzątanie po remoncie', 'Projekt', 'Nadzór budowlany'];

function RoomCard({
  room,
  onUpdate,
  onRemove,
}: {
  room: Room;
  onUpdate: (r: Room) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const toggleScope = (item: string) => {
    const next = room.scope.includes(item)
      ? room.scope.filter(s => s !== item)
      : [...room.scope, item];
    onUpdate({ ...room, scope: next });
  };

  return (
    <View style={rStyles.card}>
      <TouchableOpacity style={rStyles.header} onPress={() => setExpanded(e => !e)} activeOpacity={0.8}>
        <View style={rStyles.headerLeft}>
          <Text style={rStyles.roomName}>{room.name}</Text>
          {room.area > 0 && <Text style={rStyles.roomArea}>{room.area} m²</Text>}
        </View>
        <View style={rStyles.headerRight}>
          <Text style={rStyles.scopeCount}>{room.scope.length} zakres{room.scope.length !== 1 ? 'ów' : ''}</Text>
          <Text style={rStyles.chevron}>{expanded ? '▲' : '▼'}</Text>
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={rStyles.body}>
          <Field label="Powierzchnia (m²)">
            <Input
              value={room.area > 0 ? String(room.area) : ''}
              onChangeText={v => onUpdate({ ...room, area: parseFloat(v) || 0 })}
              placeholder="0"
              keyboardType="decimal-pad"
            />
          </Field>
          <Field label="Zakres prac">
            <View style={rStyles.scopeGrid}>
              {SCOPE_OPTIONS.map(item => (
                <TouchableOpacity
                  key={item}
                  style={[rStyles.scopeChip, room.scope.includes(item) && rStyles.scopeChipActive]}
                  onPress={() => toggleScope(item)}
                  activeOpacity={0.75}
                >
                  <Text style={[rStyles.scopeText, room.scope.includes(item) && rStyles.scopeTextActive]}>
                    {item}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Field>
          <TouchableOpacity onPress={onRemove} style={rStyles.removeBtn}>
            <Text style={rStyles.removeBtnText}>🗑 Usuń pomieszczenie</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function Step2Scope({ data, updateData }: Props) {
  const [newRoomName, setNewRoomName] = useState('');

  const addRoom = (name: string) => {
    if (!name.trim()) return;
    const room: Room = { id: Date.now().toString(), name: name.trim(), area: 0, scope: [] };
    updateData({ rooms: [...data.rooms, room] });
    setNewRoomName('');
  };

  const updateRoom = (updated: Room) => {
    updateData({ rooms: data.rooms.map(r => (r.id === updated.id ? updated : r)) });
  };

  const removeRoom = (id: string) => {
    updateData({ rooms: data.rooms.filter(r => r.id !== id) });
  };

  const toggleAdditional = (item: string) => {
    const next = data.additionalItems.includes(item)
      ? data.additionalItems.filter(i => i !== item)
      : [...data.additionalItems, item];
    updateData({ additionalItems: next });
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.stepNum}>Krok 2</Text>
        <Text style={styles.stepTitle}>Zakres prac</Text>
        <Text style={styles.stepDesc}>Dodaj pomieszczenia i określ zakres dla każdego z nich.</Text>
      </View>

      {data.rooms.length === 0 && (
        <HintBox type="info" message="Brak pomieszczeń – umowa będzie mniej precyzyjna. Dodaj przynajmniej jedno pomieszczenie." />
      )}

      <Section title="Pomieszczenia">
        {data.rooms.map(room => (
          <RoomCard key={room.id} room={room} onUpdate={updateRoom} onRemove={() => removeRoom(room.id)} />
        ))}
        <Field label="Dodaj pomieszczenie">
          <View style={styles.addRow}>
            <View style={styles.addInputWrap}>
              <Input
                value={newRoomName}
                onChangeText={setNewRoomName}
                placeholder="Nazwa pomieszczenia…"
              />
            </View>
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
        </Field>
      </Section>

      <Section title="Instalacje">
        <Toggle
          label="Elektryka"
          value={data.hasElectrical}
          onToggle={() => updateData({ hasElectrical: !data.hasElectrical })}
          icon="⚡"
        />
        <Toggle
          label="Hydraulika / Wod-kan"
          value={data.hasPlumbing}
          onToggle={() => updateData({ hasPlumbing: !data.hasPlumbing })}
          icon="🔧"
        />
        <Toggle
          label="Zakup i dostawa materiałów"
          value={data.hasMaterials}
          onToggle={() => updateData({ hasMaterials: !data.hasMaterials })}
          icon="📦"
        />
      </Section>

      <Section title="Dodatkowe pozycje">
        <View style={styles.presetsRow}>
          {ADDITIONAL_OPTIONS.map(item => (
            <TouchableOpacity
              key={item}
              style={[styles.preset, data.additionalItems.includes(item) && styles.presetActive]}
              onPress={() => toggleAdditional(item)}
              activeOpacity={0.75}
            >
              <Text style={[styles.presetText, data.additionalItems.includes(item) && styles.presetTextActive]}>
                {item}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Section>
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
  addRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  addInputWrap: { flex: 1 },
  addBtn: {
    width: 44,
    height: 40,
    backgroundColor: C.purple,
    borderRadius: C.radiusSm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { color: C.white, fontSize: 22, fontWeight: '300', lineHeight: 28 },
  presetsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  preset: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.border,
  },
  presetActive: { backgroundColor: C.purpleDim, borderColor: C.purple },
  presetText: { color: C.textSec, fontSize: 12 },
  presetTextActive: { color: C.purpleLight, fontWeight: '600' },
});

const rStyles = StyleSheet.create({
  card: {
    backgroundColor: C.cardAlt,
    borderRadius: C.radiusSm,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 8,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roomName: { color: C.white, fontSize: 14, fontWeight: '600' },
  roomArea: {
    color: C.purpleLight,
    fontSize: 12,
    backgroundColor: C.purpleSubtle,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  scopeCount: { color: C.textMuted, fontSize: 12 },
  chevron: { color: C.textMuted, fontSize: 11 },
  body: { paddingHorizontal: 12, paddingBottom: 12, borderTopWidth: 1, borderTopColor: C.border },
  scopeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  scopeChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: C.inputBg,
    borderWidth: 1,
    borderColor: C.border,
  },
  scopeChipActive: { backgroundColor: C.purpleDim, borderColor: C.purple },
  scopeText: { color: C.textSec, fontSize: 12 },
  scopeTextActive: { color: C.purpleLight, fontWeight: '600' },
  removeBtn: { marginTop: 8, alignSelf: 'flex-start' },
  removeBtnText: { color: C.error, fontSize: 12 },
});
