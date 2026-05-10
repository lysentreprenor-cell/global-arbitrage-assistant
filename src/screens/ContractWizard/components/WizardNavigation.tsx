import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { C } from '../../../theme';

interface Props {
  currentStep: number;
  totalSteps: number;
  onBack: () => void;
  onNext: () => void;
  onSaveDraft: () => void;
  onCreateContract?: () => void;
}

export default function WizardNavigation({
  currentStep,
  totalSteps,
  onBack,
  onNext,
  onSaveDraft,
  onCreateContract,
}: Props) {
  const isLastStep = currentStep === totalSteps;
  const isFirstStep = currentStep === 1;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.btn, styles.btnSecondary, isFirstStep && styles.btnDisabled]}
        onPress={onBack}
        disabled={isFirstStep}
        activeOpacity={0.75}
      >
        <Text style={[styles.btnText, styles.btnTextSecondary, isFirstStep && styles.btnTextDisabled]}>
          ← Wstecz
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={onSaveDraft} activeOpacity={0.75}>
        <Text style={[styles.btnText, styles.btnTextGhost]}>Zapisz szkic</Text>
      </TouchableOpacity>

      {isLastStep ? (
        <TouchableOpacity
          style={[styles.btn, styles.btnPrimary, styles.btnWide]}
          onPress={onCreateContract}
          activeOpacity={0.8}
        >
          <Text style={[styles.btnText, styles.btnTextPrimary]}>Utwórz umowę ✓</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={onNext} activeOpacity={0.8}>
          <Text style={[styles.btnText, styles.btnTextPrimary]}>Dalej →</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 16,
    gap: 8,
    backgroundColor: C.card,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  btn: {
    height: 44,
    borderRadius: C.radius,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: {
    backgroundColor: C.purple,
    flex: 1,
  },
  btnWide: {
    flex: 1.5,
  },
  btnSecondary: {
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.border,
    flex: 1,
  },
  btnGhost: {
    backgroundColor: 'transparent',
    flex: 1,
  },
  btnDisabled: {
    opacity: 0.35,
  },
  btnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  btnTextPrimary: {
    color: C.white,
  },
  btnTextSecondary: {
    color: C.textSec,
  },
  btnTextGhost: {
    color: C.textSec,
    textDecorationLine: 'underline',
  },
  btnTextDisabled: {
    color: C.textMuted,
  },
});
