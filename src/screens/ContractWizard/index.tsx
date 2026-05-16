import React, { useState } from 'react';
import { View, StyleSheet, SafeAreaView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { ContractData, INITIAL_CONTRACT_DATA, RENOVATION_TYPES } from '../../types/contract';
import { calculateTotal } from '../../utils/pricing';
import { C } from '../../theme';
import ProgressBar from './components/ProgressBar';
import WizardNavigation from './components/WizardNavigation';
import Step1Basics from './steps/Step1Basics';
import StepStages from './steps/StepStages';
import StepRenovationPricing from './steps/StepRenovationPricing';
import Step4Payment from './steps/Step4Payment';
import StepSimpleDetails from './steps/StepSimpleDetails';
import Step6Summary from './steps/Step6Summary';

const RENOVATION_LABELS = ['Podstawy', 'Etapy', 'Wycena', 'Płatność', 'Gotowe'];
const SIMPLE_LABELS = ['Podstawy', 'Szczegóły', 'Gotowe'];

export default function ContractWizard() {
  const [currentStep, setCurrentStep] = useState(1);
  const [data, setData] = useState<ContractData>(INITIAL_CONTRACT_DATA);

  const updateData = (updates: Partial<ContractData>) => setData(prev => ({ ...prev, ...updates }));
  const totalAmount = calculateTotal(data);

  const isRenovation = RENOVATION_TYPES.includes(data.contractType as any);
  const stepLabels = isRenovation ? RENOVATION_LABELS : SIMPLE_LABELS;
  const totalSteps = stepLabels.length;

  const goNext = () => { if (currentStep < totalSteps) setCurrentStep(s => s + 1); };
  const goBack = () => { if (currentStep > 1) setCurrentStep(s => s - 1); };
  const goToStep = (step: number) => { if (step >= 1 && step <= totalSteps) setCurrentStep(step); };
  const saveDraft = () => console.log('[ContractWizard] Draft saved', JSON.stringify(data, null, 2));
  const createContract = () => console.log('[ContractWizard] Creating contract', JSON.stringify(data, null, 2));

  const stepProps = { data, updateData, totalAmount };

  const renderStep = () => {
    if (isRenovation) {
      switch (currentStep) {
        case 1: return <Step1Basics {...stepProps} />;
        case 2: return <StepStages {...stepProps} />;
        case 3: return <StepRenovationPricing {...stepProps} />;
        case 4: return <Step4Payment {...stepProps} />;
        case 5: return <Step6Summary {...stepProps} goToStep={goToStep} onCreateContract={createContract} />;
      }
    } else {
      switch (currentStep) {
        case 1: return <Step1Basics {...stepProps} />;
        case 2: return <StepSimpleDetails {...stepProps} />;
        case 3: return <Step6Summary {...stepProps} goToStep={goToStep} onCreateContract={createContract} />;
      }
    }
    return null;
  };

  const isLastStep = currentStep === totalSteps;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" backgroundColor={C.bg} />
      <View style={styles.container}>
        <ProgressBar currentStep={currentStep} totalSteps={totalSteps} stepLabels={stepLabels} onStepPress={goToStep} />
        <View style={styles.content}>{renderStep()}</View>
        <WizardNavigation currentStep={currentStep} totalSteps={totalSteps} onBack={goBack} onNext={goNext} onSaveDraft={saveDraft} onCreateContract={createContract} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  container: { flex: 1, backgroundColor: C.bg },
  content: { flex: 1 },
});
