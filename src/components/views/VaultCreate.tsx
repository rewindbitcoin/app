//TODO: get some style stuff for the color
import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Button, Text, StyleSheet } from 'react-native';
import * as Progress from 'react-native-progress';
import type { BIP32Interface } from 'bip32';
import type { UtxosData } from '../../lib/vaults';
import type { Network } from 'bitcoinjs-lib';
import getStorageHook from '../../contexts/StorageContext';
import { defaultSettings, Settings } from '../..//lib/settings';
const { useStorage: useSettings } = getStorageHook<Settings>('settings');
import { createVault, Vault } from '../../lib/vaults';
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export default function VaultCreate({
  masterNode,
  utxosData,
  amount,
  feeRate,
  lockBlocks,
  coldAddress,
  serviceAddress,
  changeDescriptor,
  unvaultKey,
  network,
  onNewVaultCreated
}: {
  masterNode: BIP32Interface;
  utxosData: UtxosData;
  amount: number;
  feeRate: number;
  lockBlocks: number;
  coldAddress: string;
  serviceAddress: string;
  changeDescriptor: string;
  unvaultKey: string;
  network: Network;
  onNewVaultCreated: (
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
  const [settings] = useSettings();
  const [progress, setProgress] = useState<number>(0);
  const onProgress = (progress: number) => {
    setProgress(progress);
    return keepProgress.current;
  };
  const samples = (settings || defaultSettings).SAMPLES;
  const feeRateCeiling = (settings || defaultSettings)
    .PRESIGNED_FEE_RATE_CEILING;
  useEffect(() => {
    let isMounted = true;
    //Leave some time so that the progress is rendered
    const createAndNotifyVault = async () => {
      await sleep(200);
      const vault = await createVault({
        balance: amount,
        unvaultKey,
        samples,
        feeRate,
        serviceFeeRate: (settings || defaultSettings).SERVICE_FEE_RATE,
        feeRateCeiling,
        coldAddress,
        changeDescriptor,
        serviceAddress,
        lockBlocks,
        masterNode,
        utxosData,
        network,
        onProgress
      });
      if (isMounted) onNewVaultCreated(vault);
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
