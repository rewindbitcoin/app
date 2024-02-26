import { Platform } from 'react-native';
import {
  documentDirectory,
  writeAsStringAsync,
  deleteAsync,
  EncodingType
} from 'expo-file-system';
import { shareAsync } from 'expo-sharing';
const MAX_VAULT_CHECKS = 1000;
const THUNDER_DEN_PURPOSE = 1073; // = [..."thunderden"].reduce((sum, char) => sum + char.charCodeAt(0), 0);
import { getNetworkId } from './network';
const THUNDERDEN_VAULT_PATH = `m/${THUNDER_DEN_PURPOSE}'/<network>'/0'/<index>`;
const THUNDERDEN_SIGNING_MESSAGE = 'ThunderDen Encryption';

import { crypto, Network, networks } from 'bitcoinjs-lib';
import type { Signer } from './wallets';
import { getMasterNode } from './vaultDescriptors';
import { MessageFactory } from 'bitcoinjs-message';
import * as secp256k1 from '@bitcoinerlab/secp256k1';
const MessageAPI = MessageFactory(secp256k1);

import { compressData } from '../../common/lib/compress';
import type { Vault, Vaults } from './vaults';
import { getManagedChacha } from '../../common/lib/cipher';

import { gunzipSync, strFromU8 } from 'fflate';

export const fetchP2PVaultIds = async ({
  signer,
  network,
  vaultCheckUrlTemplate
}: {
  signer: Signer;
  network: Network;
  vaultCheckUrlTemplate: string;
}): Promise<{
  nextVaultId: string;
  nextVaultPath: string;
  existingVaults: Array<{ vaultId: string; vaultPath: string }>;
}> => {
  const mnemonic = signer.mnemonic;
  if (!mnemonic) throw new Error('This type of signer is not supported');
  const masterNode = getMasterNode(mnemonic, network);
  const existingVaults = [];

  for (let index = 0; index < MAX_VAULT_CHECKS; index++) {
    const vaultPath = THUNDERDEN_VAULT_PATH.replace(
      '<network>',
      network === networks.bitcoin ? '0' : '1'
    ).replace('<index>', index.toString());

    const vaultNode = masterNode.derivePath(vaultPath);
    if (!vaultNode.publicKey) throw new Error('Could not generate a vaultId');
    const vaultId = vaultNode.publicKey.toString('hex');
    const networkId = getNetworkId(network).toLowerCase();

    const vaultCheckUrl = vaultCheckUrlTemplate
      .replace(':vaultId', vaultId)
      .replace(':network?/', networkId === 'bitcoin' ? '' : `${networkId}/`);

    try {
      const response = await fetch(vaultCheckUrl);
      const responseBody = await response.json(); // Always try to parse JSON

      if (response.ok) {
        if (responseBody.exists) {
          existingVaults.push({ vaultId, vaultPath });
        } else {
          throw new Error(`Unexpected non-existing vaultId with status 200}`);
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
      throw new Error(`Error checking vault ID: ${errorMessage}`);
    }
  }
  throw new Error(`Reached MAX_VAULT_CHECKS`);
};

// Important to be async so that this will also work when using Hardware Wallets
const getCipherKey = async ({
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
    THUNDERDEN_SIGNING_MESSAGE,
    childNode.privateKey,
    true // assumes compressed
  );
  const cipherKey = crypto.sha256(signature);

  return cipherKey;
};

export const fetchP2PVault = async ({
  vaultId,
  vaultPath,
  signer,
  fetchVaultUrlTemplate,
  network
}: {
  vaultId: string;
  vaultPath: string;
  signer: Signer;
  fetchVaultUrlTemplate: string;
  network: Network;
}): Promise<{ strVault: string; vault: Vault }> => {
  const networkId = getNetworkId(network).toLowerCase();
  const fetchVaultUrl = fetchVaultUrlTemplate
    .replace(':vaultId', vaultId)
    .replace(':network?/', networkId === 'bitcoin' ? '' : `${networkId}/`);
  const cipherKey = await getCipherKey({ vaultPath, signer, network });
  const chacha = getManagedChacha(cipherKey);

  const maxAttempts = 10;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const compressedEncryptedVault = await fetch(fetchVaultUrl);
      if (compressedEncryptedVault.ok) {
        const compressedVault = chacha.decrypt(
          new Uint8Array(await compressedEncryptedVault.arrayBuffer())
        );
        const vault = gunzipSync(compressedVault);
        const strVault = strFromU8(vault);
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
      console.error(
        `Attempt ${attempt} failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  throw new Error(
    `Unable to fetch vault with ID ${vaultId} after ${maxAttempts} attempts.`
  );
};

export const p2pBackupVault = async ({
  vault,
  signer,
  pushVaultUrlTemplate,
  fetchVaultUrlTemplate,
  onProgress,
  network
}: {
  vault: Vault;
  signer: Signer;
  pushVaultUrlTemplate: string;
  fetchVaultUrlTemplate: string;
  onProgress?: (progress: number) => boolean;
  network: Network;
}) => {
  const vaultId = vault.vaultId;
  const vaultPath = vault.vaultPath;
  const commitment = vault.vaultTxHex;
  const cipherKey = await getCipherKey({ vaultPath, signer, network });

  const strVault = JSON.stringify(vault, null, 2);
  const compressedVault = await compressData({
    data: strVault,
    chunkSize: 256 * 1024, //chunks of 256 KB
    ...(onProgress ? { onProgress } : {})
  });
  if (!compressedVault) {
    throw new Error('Could not compress the Vault');
  }

  const chacha = getManagedChacha(cipherKey);
  const cipheredCompressedVault = chacha.encrypt(compressedVault);

  const networkId = getNetworkId(network).toLowerCase();
  const pushVaultUrl = pushVaultUrlTemplate
    .replace(':vaultId', vaultId)
    .replace(':network?/', networkId === 'bitcoin' ? '' : `${networkId}/`);
  try {
    const response = await fetch(pushVaultUrl, {
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
    fetchVaultUrlTemplate,
    network
  });
  if (strP2PVault === strVault) return true;
  else throw new Error('Inconsistencies detected while verifying backup');
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
    return false;
    //TODO: toast throw new Error('Impossible to compress vaults');
  }

  const fileName = `vaults.json.gz`;
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
