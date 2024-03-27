import type { NetworkId } from './network';
import type { Engine as StorageEngine } from '../../common/lib/storage';
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

//descriptor is an external-ranged descriptor. It is used (optionally) to save
//the name of each account
export type AccountNames = { [descriptor: string]: string };

//This interface is used to save all the signers associated with a Wallet.
//Signers are stored with this key: `SIGNERS_${walletId}`
export type Signers = {
  [masterFingerprint: string]: Signer;
};

export type Wallet = {
  creationEpoch: number;
  walletId: number;
  walletName?: string;
  version: string;
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
   * When using SEED_DERIVED, getCipherKey is used. A signature in a a well-known
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
