import React, { useState } from 'react';
import { View, StyleSheet, SafeAreaView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { ContractData, INITIAL_CONTRACT_DATA } from '../../types/contract';
import { calculateTotal } from '../../utils/pricing';
import { C } from '../../theme';

import ProgressBar from './components/ProgressBar';
import WizardNavigation from './components/WizardNavigation';
import Step1Basics from './steps/Step1Basics';
import Step2Scope from './steps/Step2Scope';
import Step3Pricing from './steps/Step3Pricing';
import Step4Payment from './steps/Step4Payment';
import Step5Conditions from './steps/Step5Conditions';
import Step6Summary from './steps/Step6Summary';

const TOTAL_STEPS = 6;

export default function ContractWizard() {
  const [currentStep, setCurrentStep] = useState(1);
  const [data, setData] = useState<ContractData>(INITIAL_CONTRACT_DATA);

  const updateData = (updates: Partial<ContractData>) => {
    setData(prev => ({ ...prev, ...updates }));
  };

  const totalAmount = calculateTotal(data);

  const goNext = () => {
    if (currentStep < TOTAL_STEPS) setCurrentStep(s => s + 1);
  };

  const goBack = () => {
    if (currentStep > 1) setCurrentStep(s => s - 1);
  };

  const goToStep = (step: number) => {
    if (step >= 1 && step <= TOTAL_STEPS) setCurrentStep(step);
  };

  const saveDraft = () => {
    // Persist draft to async storage in full implementation
    console.log('[ContractWizard] Draft saved', JSON.stringify(data, null, 2));
  };

  const createContract = () => {
    // Trigger contract creation flow in full implementation
    console.log('[ContractWizard] Creating contract', JSON.stringify(data, null, 2));
  };

  const stepProps = { data, updateData, totalAmount };

  const renderStep = () => {
    switch (currentStep) {
      case 1: return <Step1Basics {...stepProps} />;
      case 2: return <Step2Scope {...stepProps} />;
      case 3: return <Step3Pricing {...stepProps} />;
      case 4: return <Step4Payment {...stepProps} />;
      case 5: return <Step5Conditions {...stepProps} />;
      case 6:
        return (
          <Step6Summary
            {...stepProps}
            goToStep={goToStep}
            onCreateContract={createContract}
          />
        );
      default: return null;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" backgroundColor={C.bg} />
      <View style={styles.container}>
        <ProgressBar
          currentStep={currentStep}
          totalSteps={TOTAL_STEPS}
          onStepPress={goToStep}
        />
        <View style={styles.content}>{renderStep()}</View>
        <WizardNavigation
          currentStep={currentStep}
          totalSteps={TOTAL_STEPS}
          onBack={goBack}
          onNext={goNext}
          onSaveDraft={saveDraft}
          onCreateContract={createContract}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.bg,
  },
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  content: {
    flex: 1,
  },
});
