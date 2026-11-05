// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { MessageFactory } from '@bitcoinerlab/btcmessage';
import type { DiscoveryInstance } from '@bitcoinerlab/discovery';
import type { Explorer } from '@bitcoinerlab/explorer';
import * as secp256k1 from '@bitcoinerlab/secp256k1';
import { networks, Transaction } from 'bitcoinjs-lib';
import { toHex } from 'uint8array-tools';

import { fixtures } from './fixtutres';
import legacyBackups from './fixtures/legacy-onchain-backups.json';
import {
  getSeedDerivedCipherKey,
  getWalletDataCipherKey
} from '../dist/src/app/lib/backup/shared';
import {
  createOnChainBackupTx,
  fetchOnChainVaults
} from '../dist/src/app/lib/backup/onchain';
import { getVaultIdentity } from '../dist/src/app/lib/backup/vaultIdentity';
import { getMasterNode } from '../dist/src/app/lib/vaultDescriptors';
import type { Signer } from '../dist/src/app/lib/wallets';

// Captured with descriptors 3.0.6, secp256k1 1.2.0 and btcmessage 4.0.1.
const legacyKeys = [
  {
    path: "m/1073'/0'/1'/0",
    signature:
      '2078cace1c90b033ee969be4a53e62051b4fdaea2d3c9c4007023fe374141170485ab8506ec497caa2142a855dbcf7d8c413332681eb9ad4a508b4b1d9f76c8d18',
    cipherKey:
      '1ce27e5e16d255d1e64057b92ab17ff0421837f391ea258b47795e9a32b8143d'
  },
  {
    path: "m/1073'/0'/0'/0",
    signature:
      '20a09725a96d00a62a4793b3d34fc5fd91f888e5352d201e4d4e27ead762e4454a7adf870d2aada4271dbf0c1acfffb1d26cf6c67976b4ef4de4586c894a9741ae',
    cipherKey:
      'da9dfd1a4947e0b6e6bbff631c20c2462ddcaeb7d5c75834f1c984443b44ccf8'
  },
  {
    path: "m/1073'/0'/0'/7",
    signature:
      '1f920c508a175c4ebc01158ccddb7f837e6dd40e6594f2ca0bc826bc7ffcebea046914c00b43a1b70de021d8aeda1759e45ff27b87d3819106ad5245fecc0b5453',
    cipherKey:
      'd4dd35e2af0e1ab4b01afdf90ada176484884be248b301e90d720f31a92d6d92'
  },
  {
    path: "m/1073'/1'/1'/0",
    signature:
      '20099cb6665077d110d8f5ddbf194e266d1013838635c242381d25d7e34fc8134853dff38f719946f6953ed5f2b1dc90771ebe64c978876448dd23e3e890e19e87',
    cipherKey:
      '4a01e7227838ceb3bc49844e11fb763fa7f0af4fb4bd9ef2371796bca379fe89'
  },
  {
    path: "m/1073'/1'/0'/0",
    signature:
      '2088978a4dc13cdaaf019917683f3e3eba2f31d18b3cc96daaee0854c3ae25b29b588a7a46b89a7e264acb83219c2b4a6f0b77b05a8d88644ba5dcf90ef8300b12',
    cipherKey:
      '7f67b263519cdf5259ea172bcaee3eb37593d7aa2dd0f334ab343bf0a67e3e00'
  },
  {
    path: "m/1073'/1'/0'/7",
    signature:
      '1fe845f88f38c8ea801c0318ae82d47eb4817388b7b3f2f04f968a1e62986828bb067a69562facfbf96b94dfbe82229b855dda28b8ac1527b5003cf02646190b14',
    cipherKey:
      '1f807792333348d0f63a9dd0b56b2c0e445eaa61b9bc6a0fb9ce527ef229d033'
  }
];

const signer: Signer = {
  type: 'SOFTWARE',
  mnemonic: fixtures.edge2edge.MNEMONIC,
  masterFingerprint: fixtures.edge2edge.expected.masterFingerprint
};

describe('backup compatibility across crypto dependency updates', () => {
  test.each(legacyKeys)(
    'preserves signatures and cipher keys at $path',
    async vector => {
      const network = vector.path.startsWith("m/1073'/0'")
        ? networks.bitcoin
        : networks.regtest;
      const child = getMasterNode(
        fixtures.edge2edge.MNEMONIC,
        network
      ).derivePath(vector.path);
      if (!child.privateKey) throw new Error('Missing fixture private key');
      const signature = MessageFactory(secp256k1).sign(
        'Satoshi Nakamoto',
        child.privateKey,
        true
      );
      expect(toHex(signature)).toBe(vector.signature);
      expect(
        toHex(
          await getSeedDerivedCipherKey({
            vaultPath: vector.path,
            signer,
            network
          })
        )
      ).toBe(vector.cipherKey);
    }
  );

  test.each([networks.bitcoin, networks.testnet, networks.regtest])(
    'preserves the wallet storage key for $bech32',
    async network => {
      const expected =
        network === networks.bitcoin ? legacyKeys[0] : legacyKeys[3];
      expect(toHex(await getWalletDataCipherKey({ signer, network }))).toBe(
        expected?.cipherKey
      );
    }
  );

  test.each(legacyBackups)(
    'restores an existing $vaultMode backup with real derived keys',
    async fixture => {
      const networkId = 'REGTEST';
      const fundingTx = Transaction.fromHex(fixture.fundingTxHex);
      const explorer = {
        fetchTx: async (txId: string) => {
          if (txId !== fundingTx.getId())
            throw new Error('Unexpected fixture txid');
          return fixture.fundingTxHex;
        },
        fetchBlockStatus: async () => ({
          blockHash: '0'.repeat(64),
          blockHeight: 1,
          blockTime: 1700000000,
          irreversible: true
        })
      } as unknown as Explorer;
      const discovery = {
        fetch: async () => undefined,
        getHistory: ({ index }: { index?: number }) =>
          index === fixture.vaultIndex
            ? [fixture.vaultTxHex, fixture.backupTxHex].map(txHex => ({
                txHex,
                blockHeight: 1,
                irreversible: true
              }))
            : [],
        getExplorer: () => explorer
      } as unknown as DiscoveryInstance;
      const vaults = await fetchOnChainVaults({
        discovery,
        signer,
        networkId,
        firstIndexToCheck: fixture.vaultIndex
      });
      const { vaultId } = getVaultIdentity({
        signer,
        networkId,
        index: fixture.vaultIndex
      });
      const vault = vaults[vaultId];
      if (!vault) throw new Error('Legacy backup was not restored');
      expect(vault.vaultTxHex).toBe(fixture.vaultTxHex);
      expect(vault.vaultedAmount).toBe(fixtures.edge2edge.VAULTED_AMOUNT);
      expect(
        Object.values(vault.txMap)
          .map(tx => tx.txId)
          .sort()
      ).toEqual([...fixture.expectedTxIds].sort());
      expect(await createOnChainBackupTx({ vault, signer })).toBe(
        fixture.backupTxHex
      );
    }
  );
});
