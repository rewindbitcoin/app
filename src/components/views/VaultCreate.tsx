import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Button, StyleSheet } from 'react-native';
import * as Progress from 'react-native-progress';
import type { BIP32Interface } from 'bip32';
import type { UtxosData } from '../../lib/vaults';
import type { Network } from 'bitcoinjs-lib';
import { useSettings } from '../../contexts/SettingsContext';
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
  onNewVaultCreated: (vault: Vault | undefined) => void;
}) {
  const { t } = useTranslation();
  const keepProgress = useRef<boolean>(true);
  const { settings } = useSettings();
  const [progress, setProgress] = useState<number>(0);
  const onProgress = (progress: number) => {
    setProgress(progress);
    return keepProgress.current;
  };
  useEffect(() => {
    let isMounted = true;
    //Leave some time so that the progress is rendered
    const createAndNotifyVault = async () => {
      await sleep(200);
      const vault = await createVault({
        balance: amount,
        unvaultKey,
        samples: settings.SAMPLES,
        feeRate,
        serviceFeeRate: settings.SERVICE_FEE_RATE,
        feeRateCeiling: settings.PRESIGNED_FEE_RATE_CEILING,
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
  //TODO Create a button cancel that will set some state that will be used
  //by onProgresss to pass a Cancel
  return (
    <View style={styles.container}>
      <Progress.Circle
        size={300}
        showsText={true}
        progress={progress}
        style={styles.progressCircle}
      />
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
