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

export const getNextVaultId = async (
  signer: Signer,
  network: Network,
  vaultCheckUrlTemplate: string
): Promise<{ vaultId: string; vaultPath: string }> => {
  const mnemonic = signer.mnemonic;
  if (!mnemonic) throw new Error('This type of signer is not supported');
  const masterNode = getMasterNode(mnemonic, network);
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
      .replace('<vaultId>', vaultId)
      .replace('<network>', networkId);

    try {
      const response = await fetch(vaultCheckUrl);
      const responseBody = await response.json(); // Always try to parse JSON

      if (response.ok) {
        if (responseBody.exists) {
          continue;
        } else {
          throw new Error(`Unexpected non-existing vaultId with status 200}`);
        }
      } else {
        // Handle non-2xx status codes
        switch (response.status) {
          case 404:
            // Resource does not exist, but the request was valid
            if ('exists' in responseBody && responseBody.exists === false) {
              return { vaultId, vaultPath };
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

const getCipherKey = async (
  vaultPath: string,
  signer: Signer,
  network: Network
) => {
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

export const p2pBackupVault = async (
  vault: Vault,
  signer: Signer,
  vaultSubmitUrlTemplate: string,
  vaultGetUrlTemplate: string,
  network: Network
) => {
  const vaultId = vault.vaultId;
  const commitment = vault.vaultTxHex;
  const cipherKey = await getCipherKey(vault.vaultPath, signer, network);

  const strVault = JSON.stringify(vault, null, 2);
  const compressedVault = compressData(
    strVault,
    256 * 1024, //chunks of 256 KB
    (progress: number) => {
      console.log({ progress });
      return false; //true if user wants to cancel
    }
  );
  if (!compressedVault) {
    return false;
    //TODO: toast throw new Error('Impossible to compress vaults');
  }

  const chacha = getManagedChacha(cipherKey);
  const cipheredCompressedVault = chacha.encrypt(compressedVault);

  const networkId = getNetworkId(network).toLowerCase();
  const submitUrl = vaultSubmitUrlTemplate
    .replace('<vaultId>', vaultId)
    .replace('<network>', networkId);
  try {
    const response = await fetch(submitUrl, {
      method: 'PUT',
      body: cipheredCompressedVault,
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Vault-Commitment': commitment
      }
    });

    if (!response.ok) {
      //TODO toast throw new Error(`HTTP error! status: ${response.status}`);
      return false;
    }

    const getUrl = vaultGetUrlTemplate
      .replace('<vaultId>', vaultId)
      .replace('<network>', networkId);

    const maxAttempts = 10;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const compressedEncriptedVault = await fetch(getUrl);
        if (compressedEncriptedVault.ok) {
          const compressedVault = chacha.decrypt(
            new Uint8Array(await compressedEncriptedVault.arrayBuffer())
          );
          const vault = gunzipSync(compressedVault);
          if (strFromU8(vault) === strVault) return true;
          else return false; //TODO: toast
        }
      } catch (error) {}

      await new Promise(resolve => setTimeout(resolve, 1000));

      if (attempt === maxAttempts) {
        return false;
        //TODO: toast
      }
    }
  } catch (error) {
    return false;
  }
  return true;
};

export const shareVaults = async (vaults: Vaults): Promise<boolean> => {
  const strVaults = JSON.stringify(vaults, null, 2);

  const compressedVaults = compressData(
    strVaults,
    256 * 1024, //chunks of 256 KB
    (progress: number) => {
      console.log({ progress });
      return false; //true if user wants to cancel
    }
  );
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
