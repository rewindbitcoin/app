//TODO: get some style stuff for the color
import type { Psbt } from 'bitcoinjs-lib';
import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Button, Text, StyleSheet } from 'react-native';
import * as Progress from 'react-native-progress';
import { type UtxosData, createVault, type Vault } from '../lib/vaults';
import type { Network } from 'bitcoinjs-lib';
import {
  defaultSettings,
  Settings,
  SETTINGS_GLOBAL_STORAGE
} from '../lib/settings';
import { useGlobalStateStorage } from '../../common/contexts/StorageContext';
import { SERIALIZABLE } from '../../common/lib/storage';
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export default function VaultCreate({
  signPsbt,
  utxosData,
  amount,
  feeRate,
  lockBlocks,
  coldAddress,
  serviceAddress,
  changeDescriptor,
  unvaultKey,
  network,
  onVaultCreated
}: {
  signPsbt: (psbtVault: Psbt) => Promise<void>;
  utxosData: UtxosData;
  amount: number;
  feeRate: number;
  lockBlocks: number;
  coldAddress: string;
  serviceAddress: string;
  changeDescriptor: string;
  unvaultKey: string;
  network: Network;
  onVaultCreated: (
    vault:
      | Vault
      | 'COINSELECT_ERROR'
      | 'NOT_ENOUGH_FUNDS'
      | 'USER_CANCEL'
      | 'UNKNOWN_ERROR'
  ) => void;
}) {
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
      if (isMounted) onVaultCreated(vault);
    };
    createAndNotifyVault();
    return () => {
      isMounted = false;
    };
  }, []);
  return (
    <View style={styles.container}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  progressCircle: {
    marginBottom: 100
  }
});
