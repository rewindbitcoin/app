// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { Platform } from 'react-native';
import {
  documentDirectory,
  writeAsStringAsync,
  deleteAsync,
  EncodingType
} from 'expo-file-system';
import { shareAsync } from 'expo-sharing';
import { toBase64 } from 'uint8array-tools';

import { compressData } from '../../../common/lib/compress';
import { networkMapping } from '../network';
import { getTriggerReserveDescriptor } from '../p2aReserve';
import type { Accounts, Signer } from '../wallets';
import type { Vault, Vaults, TxHex, Rescue, RescueTxMap } from '../vaults';

export const delegateVault = async ({
  readmeText,
  vault,
  onProgress
}: {
  readmeText: string;
  vault: Vault;
  onProgress?: (progress: number) => boolean;
}): Promise<boolean> => {
  const readme = text2JsonFriendly(readmeText, 80);
  const rescueTxMap: RescueTxMap = {};
  Object.entries(vault.triggerMap).forEach(([triggerTxHex, rescueTxHexs]) => {
    const triggerTxId = vault.txMap[triggerTxHex]?.txId;
    if (!triggerTxId)
      throw new Error(`Trigger transaction ${triggerTxId} not found in txMap.`);
    rescueTxMap[triggerTxId] = rescueTxHexs.map((rescueTxHex: TxHex) => {
      const rescueTxData = vault.txMap[rescueTxHex];
      if (!rescueTxData)
        throw new Error(`rescueTxData not found for ${rescueTxHex}`);
      return {
        txHex: rescueTxHex,
        fee: rescueTxData.fee,
        feeRate: rescueTxData.feeRate
      };
    });
  });
  const rescue: Rescue = {
    version: 'rewbtc_rescue_v0',
    readme,
    networkId: vault.networkId,
    rescueTxMap
  };

  const strRescue = JSON.stringify(rescue, null, 2);

  const compressedRescue = await compressData({
    data: strRescue,
    chunkSize: 256 * 1024, //chunks of 256 KB
    ...(onProgress ? { onProgress } : {})
  });
  if (!compressedRescue) {
    //TODO: This means it was user cancelled.
    //TODO: but i need to try catch compressData for errors and toast somehow.
    return false;
  }

  const fileName = `visit-RewindBitcoin_com.json.gz`;
  if (Platform.OS === 'web') {
    const blob = new Blob([compressedRescue as Uint8Array<ArrayBuffer>], {
      type: 'application/octet-stream'
    });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = fileName;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(url);
  } else {
    const filePath = `${documentDirectory}${fileName}`;
    await writeAsStringAsync(filePath, toBase64(compressedRescue), {
      encoding: EncodingType.Base64
    });
    await shareAsync(filePath);
    await deleteAsync(filePath);
  }
  return true;
};

// Function to pad each line to 80 characters
function text2JsonFriendly(str: string, length: number) {
  return str.split('\n').map((line: string) => {
    const lineLength = line.length;
    if (lineLength < length) {
      // Pad the line with spaces to reach the desired length
      return line + ' '.repeat(length - lineLength);
    }
    return line;
  });
}

export const exportWallet = async ({
  name,
  exportInstuctions,
  accounts,
  vaults,
  signer,
  onProgress
}: {
  name: string;
  exportInstuctions: string;
  accounts: Accounts;
  vaults: Vaults;
  signer?: Signer;
  onProgress?: (progress: number) => boolean;
}): Promise<boolean> => {
  const descriptors: Array<string> = [];

  for (const [, vault] of Object.entries(vaults)) {
    descriptors.push(vault.triggerDescriptor);
    if (!signer)
      throw new Error(
        'Signer unavailable for trigger reserve descriptor export'
      );
    const triggerReserveDescriptor = getTriggerReserveDescriptor({
      vault,
      signer,
      network: networkMapping[vault.networkId]
    });
    descriptors.push(triggerReserveDescriptor);
  }

  for (const account of Object.keys(accounts))
    descriptors.push(account, account.replace(/\/0\/\*/g, '/1/*'));

  const strExport = JSON.stringify(
    { README: text2JsonFriendly(exportInstuctions, 70), descriptors, vaults },
    null,
    2
  );

  const compressedExport = await compressData({
    data: strExport,
    chunkSize: 256 * 1024, //chunks of 256 KB
    ...(onProgress ? { onProgress } : {})
  });
  if (!compressedExport) {
    //TODO: This means it was user cancelled.
    //TODO: but i need to try catch compressData for errors and toast somehow.
    return false;
  }

  const fileName = `${name}_export.json.gz`;
  if (Platform.OS === 'web') {
    const blob = new Blob([compressedExport as Uint8Array<ArrayBuffer>], {
      type: 'application/octet-stream'
    });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = fileName;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(url);
  } else {
    const filePath = `${documentDirectory}${fileName}`;
    await writeAsStringAsync(filePath, toBase64(compressedExport), {
      encoding: EncodingType.Base64
    });
    await shareAsync(filePath);
    await deleteAsync(filePath);
  }
  return true;
};

export const exportLabels = async ({
  name,
  labels
}: {
  name: string;
  labels: string;
}): Promise<boolean> => {
  const fileName = `${name}_labels.bip329.jsonl`;
  if (Platform.OS === 'web') {
    const blob = new Blob([labels], {
      type: 'application/jsonl;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = fileName;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(url);
  } else {
    const filePath = `${documentDirectory}${fileName}`;
    await writeAsStringAsync(filePath, labels, {
      encoding: EncodingType.UTF8
    });
    await shareAsync(filePath);
    await deleteAsync(filePath);
  }
  return true;
};
