import type { NetworkId } from './network';
import type { Engine as StorageEngine } from '../../common/lib/storage';
import type { Account } from '@bitcoinerlab/discovery';
import { type TFunction } from 'i18next';
/*
TODO:
To generate the random well-known key for thunder den, we used:

  function generateRandomNumber() {
    let randomParts = new Uint32Array(5);
    window.crypto.getRandomValues(randomParts);

    // Each part is a 32-bit number, combined to form a 160-bit number
    return {
        part1: randomParts[0],
        part2: randomParts[1],
        part3: randomParts[2],
        part4: randomParts[3],
        part5: randomParts[4]
    };
  }
  let randomNumber = generateRandomNumber();
  console.log(randomNumber);

  part1 : 88551025
  part2 : 1821456116
  part3 : 904787242
  part4 : 1855666376
  part5 : 1464383631
*/

//`SIGNERS_${walletId}`
export const SOFTWARE = 'SOFTWARE' as const;
export const LEDGER = 'LEDGER' as const;
export type Signer = {
  masterFingerprint: string; // Needs to be set because for HWW we dont have the mnemonic
  signerName?: string;
  type: typeof SOFTWARE | typeof LEDGER;
  // For SOFTWARE
  mnemonic?: string;
};

/**
 * These will keep the list of the non-vault descriptors used in a wallet.
 * F.ex.: Legacy, Nested, Native or all of them.
 * Note that only the external descriptor is saved (per convention an external
 * descriptor represents an Account).
 * the discard prop can be set in a settings panel when the user decides that
 * a former detected account should not be part of this wallet anymore.
 *
 * The wallet accounts are only set once. It is done initially in the first
 * sync (in WalletContext). Accounts are set using several heuristics explained
 * below. After inially set, Object.keys(accounts).length will be true and they
 * will never again be set.
 *
 * How are initial accounts set?
 * - When the wallet signer corresponds a a Hardware Wallet, then
 * accounts are automatically set to Segwit, account #0 (see createDefaultReceiveDescriptor)
 *
 *  - When the wallet signer is a Software Wallet then discovery.fetchStandardAccounts
 *  is called and all the usedAccounts are automatically added into Accounts.
 *
 *  In Hardware Wallets, it is not possible to call discovery.fetch since it has
 *  not been implemented yet to accept HWW signers. When this is implemented then
 *  a common strategy can be used. In the meanwhile the best we can do is to
 *  default to Segwit, account#0 for HWW signers.
 */

export type Accounts = {
  [account: Account]: { discard: boolean; name?: string };
};

//This interface is used to save all the signers associated with a Wallet.
//Signers are stored with this key: `SIGNERS_${walletId}`
export type Signers = {
  [masterFingerprint: string]: Signer;
};

type Notifications = {
  [watchtowerAPI: string]: {
    [vaultId: string]: {
      firstAttemptAt?: number;
      /**
       * set to true once we know the user knows a vault was triggered
       * handleWatchtowerNotification will notify the watchtower based on this flag
       */
      acked: boolean;
    };
  };
};

export type Wallet = {
  creationEpoch: number;
  walletId: number;
  walletUUID: string;
  walletName?: string;
  version: string;
  /**
   * Show in the Wallet header a warning explaining tests wallets use fake
   * real value. allow the user to dismiss this warning.
   */
  testWalletWarningDismissed?: boolean;
  /**
   * Store notifications received from watchtowers
   */
  notifications?: Notifications;
  //TODO - Implement seed confirmation later (not on wallet creation - so that
  //you can create a wallet express without requiring user to validate the
  //mnemonic. This only applies to new walletes (not imported ones)
  seedBackupDone?: boolean;
  networkId: NetworkId;
  /**
   * Signers are small string text which may contain the mnemonic (when using
   * software wallets, and therefore it is important to treat them specially).
   * If the SECURESTORE storage engine cannot be used, signersEncryption should
   * be 'PASSWORD'
   */

  signersEncryption: 'PASSWORD' | 'NONE';
  signersStorageEngine: StorageEngine;
  /**
   * This is the encryption used for the rest of data (not signers).
   * This data may be Vaults for example, and therefore, the SecureEnclave of
   * the System is not usable (they are restricted fo 2KB).
   * Anyway this data is not so sensible.
   *
   * When using SEED_DERIVED, getSeedDerivedCipherKey is used. A signature in a a well-known
   * derivation path.
   *
   * We keep 'NONE' just for debugging/development purposes
   */
  encryption: 'NONE' | 'SEED_DERIVED';

  //The storageEngine for the rest of data will be the same used to
  //this data (<Wallets>), so no need to save it
};

//`WALLETS`
export type Wallets = {
  [walletId: number]: Wallet;
};

export const walletTitle = (wallet: Wallet, wallets: Wallets, t: TFunction) =>
  wallet.walletName ||
  (Object.entries(wallets).length === 1
    ? t('wallets.mainWallet')
    : t('wallets.walletId', { id: wallet.walletId + 1 }));
