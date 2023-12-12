import React, { useEffect } from 'react';
import * as Progress from 'react-native-progress';
import type { BIP32Interface } from 'bip32';
import type { UtxosData } from '../../lib/vaults';
import type { Network } from 'bitcoinjs-lib';
import { useSettings } from '../../contexts/SettingsContext';
import { createVault, Vault } from '../../lib/vaults';
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
  const { settings } = useSettings();
  useEffect(() => {
    let isMounted = true;
    (async () => {
      console.log('createVault on mount');
      const vault = createVault({
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
        network
      });
      if (isMounted) onNewVaultCreated(vault);
    })();
    return () => {
      isMounted = false;
    };
  }, []);
  console.log('render VaultCreate');
  return <Progress.Circle size={30} indeterminate={true} />;
}
