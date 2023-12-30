//TODO: get some style stuff for the color
import React, { useContext, useEffect, useState, useRef } from 'react';
import { WalletContext, WalletContextType } from '../contexts/WalletContext';
import { useTranslation } from 'react-i18next';
import { ScrollView, Button, Text, StyleSheet } from 'react-native';
import * as Progress from 'react-native-progress';
import { createVault, type VaultSettings } from '../lib/vaults';
import {
  defaultSettings,
  Settings,
  SETTINGS_GLOBAL_STORAGE
} from '../lib/settings';
import { useGlobalStateStorage } from '../../common/contexts/StorageContext';
import { SERIALIZABLE } from '../../common/lib/storage';
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export default function VaultCreate({
  vaultSettings,
  onVaultCreated
}: {
  vaultSettings: VaultSettings | undefined;
  onVaultCreated: (result: boolean) => void;
}) {
  //TODO Use a proper Cancellable Modal
  const context = useContext<WalletContextType | null>(WalletContext);
  if (context === null) throw new Error('Context was not set');

  if (!vaultSettings) throw new Error('vaultSettings not set');
  const { amount, feeRate, lockBlocks } = vaultSettings;

  const {
    utxosData,
    network,
    signPsbt,
    coldAddress,
    serviceAddress,
    changeDescriptor,
    unvaultKey,
    processCreatedVault
  } = context;
  if (
    !utxosData ||
    !network ||
    !signPsbt ||
    !coldAddress ||
    !serviceAddress ||
    !changeDescriptor ||
    !unvaultKey ||
    !processCreatedVault
  )
    throw new Error('Missing data from context');
  const { t } = useTranslation();
  const keepProgress = useRef<boolean>(true);
  const [settings] = useGlobalStateStorage<Settings>(
    SETTINGS_GLOBAL_STORAGE,
    SERIALIZABLE,
    defaultSettings
  );
  if (!settings)
    throw new Error(
      'This component should only be started after settings has been retrieved from storage'
    );
  // We know settings are the correct ones in this Component
  const [progress, setProgress] = useState<number>(0);
  const onProgress = (progress: number) => {
    setProgress(progress);
    return keepProgress.current;
  };
  const samples = settings.SAMPLES;
  const feeRateCeiling = settings.PRESIGNED_FEE_RATE_CEILING;
  useEffect(() => {
    let isMounted = true;
    //Leave some time so that the progress is rendered
    const createAndNotifyVault = async () => {
      await sleep(200);
      const vault = await createVault({
        amount,
        unvaultKey,
        samples,
        feeRate,
        serviceFeeRate: settings.SERVICE_FEE_RATE,
        feeRateCeiling,
        coldAddress,
        changeDescriptor,
        serviceAddress,
        lockBlocks,
        signPsbt,
        utxosData,
        network,
        onProgress
      });
      if (isMounted) {
        const result = await processCreatedVault(vault);
        //TODO: ask for confirmation, then:
        onVaultCreated(result);
      }
    };
    createAndNotifyVault();
    return () => {
      isMounted = false;
    };
  }, []);
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        flexGrow: 1, //grow vertically to 100% and center child
        justifyContent: 'center',

        alignItems: 'center'
      }}
    >
      <Progress.Circle
        size={300}
        showsText={true}
        progress={progress}
        style={styles.progressCircle}
      />
      <Text>
        Expected increase of fees will be{' '}
        {((Math.pow(feeRateCeiling, 1 / samples) - 1) * 100) / 2}%
      </Text>
      <Button
        title={t('cancelButton')}
        onPress={() => {
          keepProgress.current = false;
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  progressCircle: {
    marginBottom: 100
  }
});
