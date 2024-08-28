import { Platform } from 'react-native';
import {
  documentDirectory,
  writeAsStringAsync,
  deleteAsync,
  EncodingType
} from 'expo-file-system';
import { shareAsync } from 'expo-sharing';
const MAX_VAULT_CHECKS = 1000;
const PURPOSE = 1073; // = [..."thunderden"].reduce((sum, char) => sum + char.charCodeAt(0), 0);
const VAULT_PATH = `m/${PURPOSE}'/<network>'/0'/<index>`;
const SIGNING_MESSAGE = 'Satoshi Nakamoto'; //Can be any, but don't change it
const DATA_PATH = `m/${PURPOSE}'/<network>'/1'/0`;

import { crypto, Network, networks } from 'bitcoinjs-lib';
import type { Signer } from './wallets';
import { getMasterNode } from './vaultDescriptors';
import { MessageFactory } from 'bitcoinjs-message';
import * as secp256k1 from '@bitcoinerlab/secp256k1';
const MessageAPI = MessageFactory(secp256k1);

import { compressData } from '../../common/lib/compress';
import type { Vault, Vaults, TxHex, Rescue, RescueTxMap } from './vaults';
import { getManagedChacha } from '../../common/lib/cipher';

import { gunzipSync } from 'fflate';
import { TextDecoder } from '../../common/lib/textencoder';
import { type NetworkId, networkMapping } from './network';

export const fetchP2PVaultIds = async ({
  signer,
  networkId,
  vaults,
  vaultsAPI
}: {
  signer: Signer;
  networkId: NetworkId;
  vaults: Vaults | undefined;
  vaultsAPI: string;
}): Promise<{
  nextVaultId: string;
  nextVaultPath: string;
  existingVaults: Array<{ vaultId: string; vaultPath: string }>;
}> => {
  const mnemonic = signer.mnemonic;
  if (!mnemonic) throw new Error('This type of signer is not supported');
  const network = networkMapping[networkId];
  const masterNode = getMasterNode(mnemonic, network);
  const existingVaults = [];

  for (let index = 0; index < MAX_VAULT_CHECKS; index++) {
    const vaultPath = VAULT_PATH.replace(
      '<network>',
      network === networks.bitcoin ? '0' : '1'
    ).replace('<index>', index.toString());

    const vaultNode = masterNode.derivePath(vaultPath);
    if (!vaultNode.publicKey) throw new Error('Could not generate a vaultId');
    const vaultId = vaultNode.publicKey.toString('hex');
    const vault = vaults?.[vaultId];
    if (vault) {
      existingVaults.push({ vaultId, vaultPath });
    } else {
      const vaultCheckUrl = `${vaultsAPI}/${vaultId}/check`;

      try {
        const response = await fetch(vaultCheckUrl);
        const responseBody = await response.json(); // Always try to parse JSON

        if (response.ok) {
          if (responseBody.exists) {
            existingVaults.push({ vaultId, vaultPath });
          } else {
            throw new Error(`Unexpected non-existing vaultId with status 200`);
          }
        } else {
          // Handle non-2xx status codes
          switch (response.status) {
            case 404:
              // Resource does not exist, but the request was valid
              if ('exists' in responseBody && responseBody.exists === false) {
                return {
                  nextVaultId: vaultId,
                  nextVaultPath: vaultPath,
                  existingVaults
                };
              } else throw new Error(`Server not found: ${vaultCheckUrl}`);
            case 409:
              // Key already exists, updates or deletions are not allowed
              throw new Error(responseBody.message);
            default:
              // Other errors
              throw new Error(
                `Unexpected response: ${response.status} ${responseBody.message || ''}`
              );
          }
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'An unknown error occurred';
        throw new Error(`Error checking vault ID: ${vaultId}. ${errorMessage}`);
      }
    }
  }
  throw new Error(`Reached MAX_VAULT_CHECKS`);
};

export async function fetchP2PVaults({
  signer,
  networkId,
  vaultsAPI,
  vaults
}: {
  signer: Signer;
  networkId: NetworkId;
  vaultsAPI: string;
  vaults: Vaults;
}): Promise<Vaults> {
  const { existingVaults: p2pVaultIds } = await fetchP2PVaultIds({
    signer,
    networkId,
    vaults,
    vaultsAPI
  });

  const p2pVaults: Vaults = {};
  for (const { vaultId, vaultPath } of p2pVaultIds) {
    const vault = vaults[vaultId];
    if (!vault) {
      const fetchedVault = await fetchP2PVault({
        vaultId,
        vaultPath,
        signer,
        vaultsAPI,
        networkId
      });
      p2pVaults[vaultId] = fetchedVault.vault;
    } else {
      p2pVaults[vaultId] = vault;
    }
  }

  return p2pVaults;
}

export const getDataCipherKey = async ({
  signer,
  network
}: {
  signer: Signer;
  network: Network;
}) => {
  return await getSeedDerivedCipherKey({
    vaultPath: DATA_PATH.replace(
      '<network>',
      network === networks.bitcoin ? '0' : '1'
    ),
    signer,
    network
  });
};

// Important to be async so that this will also work when using Hardware Wallets
const getSeedDerivedCipherKey = async ({
  vaultPath,
  signer,
  network
}: {
  vaultPath: string;
  signer: Signer;
  network: Network;
}) => {
  const mnemonic = signer.mnemonic;
  if (!mnemonic) throw new Error('Could not initialize the signer');
  const masterNode = getMasterNode(mnemonic, network);
  const childNode = masterNode.derivePath(vaultPath);
  if (!childNode.privateKey)
    throw new Error('Could not generatel a privateKey');

  const signature = MessageAPI.sign(
    SIGNING_MESSAGE,
    childNode.privateKey,
    true // assumes compressed
  );
  const cipherKey = crypto.sha256(signature);

  return cipherKey;
};

const fetchP2PVault = async ({
  vaultId,
  vaultPath,
  signer,
  vaultsAPI,
  networkId
}: {
  vaultId: string;
  vaultPath: string;
  signer: Signer;
  vaultsAPI: string;
  networkId: NetworkId;
}): Promise<{ strVault: string; vault: Vault }> => {
  const network = networkMapping[networkId];
  const vaultGetUrl = `${vaultsAPI}/${vaultId}/get`;
  const cipherKey = await getSeedDerivedCipherKey({
    vaultPath,
    signer,
    network
  });
  const chacha = getManagedChacha(cipherKey);

  const maxAttempts = 10;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const compressedEncryptedVault = await fetch(vaultGetUrl);
      if (compressedEncryptedVault.ok) {
        const compressedVault = chacha.decrypt(
          new Uint8Array(await compressedEncryptedVault.arrayBuffer())
        );
        const vault = gunzipSync(compressedVault);
        //const strVault = strFromU8(vault);
        const strVault = new TextDecoder().decode(vault, { stream: false });
        return { strVault, vault: JSON.parse(strVault) };
      } else {
        throw new Error(
          `Fetch returned a non-ok status: ${compressedEncryptedVault.status}`
        );
      }
    } catch (error) {
      if (attempt === maxAttempts) {
        throw new Error(
          `Failed to fetch vault after ${maxAttempts} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
      console.warn(
        `Attempt ${attempt} failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  throw new Error(
    `Unable to fetch vault with ID ${vaultId} after ${maxAttempts} attempts.`
  );
};

/**
 * compresses the vault and pushes it to the primary backups server and then
 * it retrieves it from the secondary server and decompresses it and checks
 * whether it was ok. This function will throw on error messages, so deal with
 * this externally.
 */
export const p2pBackupVault = async ({
  vault,
  signer,
  vaultsAPI,
  vaultsSecondaryAPI,
  onProgress,
  networkId
}: {
  vault: Vault;
  signer: Signer;
  vaultsAPI: string;
  vaultsSecondaryAPI: string;
  onProgress?: (progress: number) => boolean;
  networkId: NetworkId;
}) => {
  const network = networkMapping[networkId];
  const vaultId = vault.vaultId;
  const vaultPath = vault.vaultPath;
  const commitment = vault.vaultTxHex;
  const cipherKey = await getSeedDerivedCipherKey({
    vaultPath,
    signer,
    network
  });

  const strVault = JSON.stringify(vault, null, 2);
  const compressedVault = await compressData({
    data: strVault,
    chunkSize: 256 * 1024, //chunks of 256 KB
    ...(onProgress ? { onProgress } : {})
  });
  if (!compressedVault) {
    //TODO: don't throw here! This means user cancelled
    throw new Error('Could not compress the Vault');
  }

  const chacha = getManagedChacha(cipherKey);
  const cipheredCompressedVault = chacha.encrypt(compressedVault);

  const vaultPushUrl = `${vaultsAPI}/${vaultId}`;
  try {
    const response = await fetch(vaultPushUrl, {
      method: 'PUT',
      body: cipheredCompressedVault,
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Vault-Commitment': commitment
      }
    });
    if (!response.ok) {
      throw new Error('Network problems pushing the vault to the network');
    }
  } catch (err) {
    throw new Error('Network problems pushing the vault to the network');
  }

  const { strVault: strP2PVault } = await fetchP2PVault({
    vaultId,
    vaultPath,
    signer,
    vaultsAPI: vaultsSecondaryAPI,
    networkId
  });
  if (strP2PVault === strVault) return true;
  else throw new Error('Inconsistencies detected while verifying backup');
};

export const delegateVault = async ({
  readme,
  vault,
  onProgress
}: {
  readme: Array<string>;
  vault: Vault;
  onProgress?: (progress: number) => boolean;
}): Promise<boolean> => {
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
    const blob = new Blob([compressedRescue], {
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
    await writeAsStringAsync(
      filePath,
      Buffer.from(compressedRescue).toString('base64'),
      {
        encoding: EncodingType.Base64
      }
    );
    await shareAsync(filePath);
    await deleteAsync(filePath);
  }
  return true;
};

export const shareVaults = async ({
  vaults,
  onProgress
}: {
  vaults: Vaults;
  onProgress?: (progress: number) => boolean;
}): Promise<boolean> => {
  const strVaults = JSON.stringify(vaults, null, 2);

  const compressedVaults = await compressData({
    data: strVaults,
    chunkSize: 256 * 1024, //chunks of 256 KB
    ...(onProgress ? { onProgress } : {})
  });
  if (!compressedVaults) {
    //TODO: This means it was user cancelled.
    //TODO: but i need to try catch compressData for errors and toast somehow.
    return false;
  }

  const fileName = `rewbtc_vaults.json.gz`;
  if (Platform.OS === 'web') {
    const blob = new Blob([compressedVaults], {
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
    await writeAsStringAsync(
      filePath,
      Buffer.from(compressedVaults).toString('base64'),
      {
        encoding: EncodingType.Base64
      }
    );
    await shareAsync(filePath);
    await deleteAsync(filePath);
  }
  return true;
};
