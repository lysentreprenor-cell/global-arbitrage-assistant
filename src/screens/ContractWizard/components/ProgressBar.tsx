import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { C } from '../../../theme';

interface Props {
  currentStep: number;
  totalSteps: number;
  stepLabels: string[];
  onStepPress?: (step: number) => void;
}

export default function ProgressBar({ currentStep, totalSteps, stepLabels, onStepPress }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Nowa umowa</Text>
      <Text style={styles.subtitle}>Krok {currentStep} z {totalSteps}</Text>
      <View style={styles.stepsRow}>
        {Array.from({ length: totalSteps }, (_, i) => {
          const step = i + 1;
          const isCompleted = step < currentStep;
          const isActive = step === currentStep;
          return (
            <React.Fragment key={step}>
              <TouchableOpacity style={styles.stepItem} onPress={() => isCompleted && onStepPress?.(step)} activeOpacity={isCompleted ? 0.7 : 1}>
                <View style={[styles.circle, isCompleted && styles.circleCompleted, isActive && styles.circleActive]}>
                  {isCompleted ? <Text style={styles.checkmark}>✓</Text> : <Text style={[styles.circleText, isActive && styles.circleTextActive]}>{step}</Text>}
                </View>
                <Text style={[styles.label, isActive && styles.labelActive]} numberOfLines={1}>{stepLabels[i]}</Text>
              </TouchableOpacity>
              {step < totalSteps && <View style={[styles.line, isCompleted && styles.lineCompleted]} />}
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: C.card, paddingTop: 12, paddingBottom: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  title: { color: C.white, fontSize: 17, fontWeight: '700', letterSpacing: 0.2 },
  subtitle: { color: C.textSec, fontSize: 12, marginTop: 1, marginBottom: 10 },
  stepsRow: { flexDirection: 'row', alignItems: 'flex-start' },
  stepItem: { alignItems: 'center', flex: 1, minWidth: 0 },
  circle: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.cardAlt, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  circleActive: { backgroundColor: C.purple, borderColor: C.purpleLight, shadowColor: C.purple, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 6, elevation: 4 },
  circleCompleted: { backgroundColor: C.purpleDim, borderColor: C.purple },
  circleText: { color: C.textMuted, fontSize: 11, fontWeight: '600' },
  circleTextActive: { color: C.white },
  checkmark: { color: C.purpleLight, fontSize: 11, fontWeight: '700' },
  label: { color: C.textMuted, fontSize: 9, marginTop: 4, textAlign: 'center', width: '100%' },
  labelActive: { color: C.purpleLight, fontWeight: '600' },
  line: { height: 1.5, backgroundColor: C.border, marginTop: 12, marginHorizontal: 2, flex: 1 },
  lineCompleted: { backgroundColor: C.purple },
});
