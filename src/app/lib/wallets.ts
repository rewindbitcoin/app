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
  signerName?: string;
  type: typeof SOFTWARE | typeof LEDGER;
  // For SOFTWARE
  mnemonic?: string;
  // For HWW indentification purposes:
  masterFingerprintHex?: string;
};
export type Signers = Array<Signer>;

export type Wallet = {
  walletId: number;
  walletName?: string;
  version: string;
  networkId: NetworkId;
  /**
   * When using BIP32_PUBKEY, a well-known path is used as the seed for
   * the pubKey, which is then used as the encryptionKey of your data.
   * When using USER, the user must remember the key.
   */
  encryptionKeyInput: 'NONE' | 'USER' | 'BIP32_PUBKEY';
};

//`WALLETS`
export type Wallets = {
  [walletId: number]: Wallet;
};
