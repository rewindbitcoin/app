import type { NetworkId } from './network';
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

//`SIGNERS/${walletId}`
export const SOFTWARE = 'SOFTWARE' as const;
export const LEDGER = 'LEDGER' as const;
export type Signer = {
  signerId: number;
  signerName?: string;
  type: typeof SOFTWARE | typeof LEDGER;
  // For SOFTWARE
  mnemonic?: string;
  // For HWW indentification purposes:
  masterFingerprintHex?: string;
};
export type Signers = { [signerId: number]: Signer };

export type Wallet = {
  walletId: number;
  walletName?: string;
  version: string;
  networkId: NetworkId;
  /**
   * Signers are small string text which may contain the mnemonic (when using
   * software wallets, and therefore it is important to treat them specially)
   * how are signers encrypted?
   * 'NONE' using the normal storage, for debuggin/development purposes
   * 'PASSWORD' the user provides a password
   * 'SYSTEM', using Expo SecureStore (iOS & Android)
   */

  signersEncryption: 'SYSTEM' | 'PASSWORD' | 'NONE';
  /**
   * This is the encryption used for the rest of data (not signers).
   * This data may be Vaults for example, and therefore, the SecureEnclave of
   * the System is not usable (they are restricted fo 2KB).
   * Anyway this data is not so sensible.
   *
   * When using SIGNER_0_BIP32_DERIVED_PUBKEY, a well-known derivation path is
   * used as the seed for the pubKey, which is then used as the encryptionKey of
   * your data. The xprv of signer[0] is used combined with the well-known
   * derivation path.
   *
   * We keep 'NONE' just for debugging/development purposes
   */
  encryption: 'NONE' | 'SIGNER_0_BIP32_DERIVED_PUBKEY';
};

//`WALLETS`
export type Wallets = {
  [walletId: number]: Wallet;
};
