const MAX_VAULT_CHECKS = 1000;
const THUNDER_DEN_PURPOSE = 1073; // = [..."thunderden"].reduce((sum, char) => sum + char.charCodeAt(0), 0);
const THUNDERDEN_VAULT_PATH = `m/${THUNDER_DEN_PURPOSE}'/<network>'/0'/<index>`;
const THUNDERDEN_SIGNING_MESSAGE = 'ThunderDen Encryption';

import { crypto, Network, networks } from 'bitcoinjs-lib';
import type { Signer } from './wallets';
import { getMasterNode } from './vaultDescriptors';
import { MessageFactory } from 'bitcoinjs-message';
import * as secp256k1 from '@bitcoinerlab/secp256k1';
const MessageAPI = MessageFactory(secp256k1);

import { compressData } from '../../common/lib/compress';
import type { Vault } from './vaults';
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

    try {
      const response = await fetch(
        vaultCheckUrlTemplate.replace('<vaultId>', vaultId)
      );

      // Parse the response body as JSON
      const responseBody = await response.json();

      if (response.status === 200 && responseBody.exists === true) {
        // The resource exists, continue searching for an available ID
        continue;
      } else if (response.status === 404 && responseBody.exists === false) {
        // The resource does not exist, and the response is unambiguous
        return { vaultId, vaultPath };
      } else {
        // For all other cases, including ambiguous 404 responses, throw an error
        throw new Error(
          `Unexpected response: ${response.status} ${responseBody.message || ''}`
        );
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
  const cipherId = vault.vaultId;
  const cipherKey = await getCipherKey(vault.vaultPath, signer, network);

  const strVault = JSON.stringify(vault);
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

  const submitUrl = vaultSubmitUrlTemplate.replace('<vaultId>', cipherId);
  try {
    const response = await fetch(submitUrl, {
      method: 'PUT',
      body: cipheredCompressedVault,
      headers: {
        'Content-Type': 'application/octet-stream'
      }
    });

    if (!response.ok) {
      //TODO toast throw new Error(`HTTP error! status: ${response.status}`);
      return false;
    }

    const getUrl = vaultGetUrlTemplate.replace('<vaultId>', cipherId);

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
