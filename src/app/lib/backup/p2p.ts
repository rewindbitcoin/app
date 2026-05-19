// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

//FIXME: for legacy wallets, we'll need to mix the vaultId number taken from
//the p2p wallet with the new one from the onchain backup
import type { Signer } from '../wallets';
import { getMasterNode } from '../vaultDescriptors';
import { toHex } from 'uint8array-tools';

import { compressData } from '../../../common/lib/compress';
import type { Vault, Vaults } from '../vaults';
import { getManagedChacha } from '../../../common/lib/cipher';

import { gunzipSync } from 'fflate';
import { TextDecoder } from '../../../common/lib/textencoder';
import { type NetworkId, networkMapping } from '../network';
import { getVaultPath } from '../rewindPaths';
import { getSeedDerivedCipherKey } from './shared';

const MAX_VAULT_CHECKS = 1000;

export const fetchP2PVaultIds = async ({
  signer,
  networkId,
  vaults,
  cBVaultsReaderAPI,
  networkTimeout
}: {
  signer: Signer;
  networkId: NetworkId;
  vaults: Vaults | undefined;
  cBVaultsReaderAPI: string;
  networkTimeout: number;
}): Promise<{
  nextVaultIndex: number;
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
    const vaultPath = getVaultPath(network, index);

    const vaultNode = masterNode.derivePath(vaultPath);
    if (!vaultNode.publicKey) throw new Error('Could not generate a vaultId');
    const vaultId = toHex(vaultNode.publicKey);
    const vault = vaults?.[vaultId];
    if (vault) {
      existingVaults.push({ vaultId, vaultPath });
    } else {
      const vaultCheckUrl = `${cBVaultsReaderAPI}/${vaultId}/check`;

      try {
        const response = await fetch(vaultCheckUrl, {
          signal: AbortSignal.timeout(networkTimeout)
        });
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
                  nextVaultIndex: index,
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
  cBVaultsReaderAPI,
  vaults,
  networkTimeout
}: {
  signer: Signer;
  networkId: NetworkId;
  cBVaultsReaderAPI: string;
  vaults: Vaults;
  networkTimeout: number;
}): Promise<Vaults> {
  const { existingVaults: p2pVaultIds } = await fetchP2PVaultIds({
    signer,
    networkId,
    vaults,
    cBVaultsReaderAPI,
    networkTimeout
  });

  const p2pVaults: Vaults = {};
  for (const { vaultId, vaultPath } of p2pVaultIds) {
    const vault = vaults[vaultId];
    if (!vault) {
      const fetchedVault = await fetchP2PVault({
        networkTimeout,
        vaultId,
        vaultPath,
        signer,
        cBVaultsReaderAPI,
        networkId
      });
      p2pVaults[vaultId] = { ...fetchedVault.vault, backupType: 'p2p' };
    } else {
      p2pVaults[vaultId] = vault;
    }
  }

  return p2pVaults;
}

const fetchP2PVault = async ({
  vaultId,
  vaultPath,
  signer,
  cBVaultsReaderAPI,
  networkId,
  networkTimeout
}: {
  vaultId: string;
  vaultPath: string;
  signer: Signer;
  cBVaultsReaderAPI: string;
  networkId: NetworkId;
  networkTimeout: number;
}): Promise<{ strVault: string; vault: Vault }> => {
  const network = networkMapping[networkId];
  const vaultGetUrl = `${cBVaultsReaderAPI}/${vaultId}/get`;
  const cipherKey = await getSeedDerivedCipherKey({
    vaultPath,
    signer,
    network
  });
  const chacha = await getManagedChacha(cipherKey);

  const maxAttempts = 10;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const compressedEncryptedVault = await fetch(vaultGetUrl, {
        signal: AbortSignal.timeout(networkTimeout)
      });
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
 *
 * returns a promise to true if succesful or false if the user cancelled the
 * compression process returning false onProgress.
 *
 * it throws on errors on network failure or if the backup was inconsistent.
 */
export const p2pBackupVault = async ({
  vault,
  signer,
  cBVaultsWriterAPI,
  cBVaultsReaderAPI,
  onProgress,
  networkId,
  networkTimeout
}: {
  vault: Vault;
  signer: Signer;
  cBVaultsWriterAPI: string;
  cBVaultsReaderAPI: string;
  onProgress?: (progress: number) => boolean;
  networkId: NetworkId;
  networkTimeout: number;
}): Promise<boolean> => {
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
  if (!compressedVault) return false;

  const chacha = await getManagedChacha(cipherKey);
  const cipheredCompressedVault = chacha.encrypt(compressedVault);

  const vaultPushUrl = `${cBVaultsWriterAPI}/${vaultId}`;
  try {
    const response = await fetch(vaultPushUrl, {
      method: 'PUT',
      body: cipheredCompressedVault,
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Vault-Commitment': commitment
      },
      signal: AbortSignal.timeout(networkTimeout)
    });
    if (!response.ok) {
      throw new Error('Network problems pushing the vault to the network');
    }
  } catch (err) {
    void err;
    throw new Error('Network problems pushing the vault to the network');
  }

  const { strVault: strP2PVault } = await fetchP2PVault({
    networkTimeout,
    vaultId,
    vaultPath,
    signer,
    cBVaultsReaderAPI,
    networkId
  });
  if (strP2PVault === strVault) return true;
  else throw new Error('Inconsistencies detected while verifying backup');
};
