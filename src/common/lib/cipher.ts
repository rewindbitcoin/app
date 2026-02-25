// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

//uses react-native-dotenv from bable.config.js and @rewindbitcoin/env
// @ts-expect-error @env is defined in bable.config.js
import { CIPHER_ADDITIONAL_DATA } from '@env';

import { sha256 } from '@noble/hashes/sha2';
import { TextEncoder } from './textencoder';

//This better give it an async signature in case it needs to be async in the future
export const getPasswordDerivedCipherKey = async (password: string) =>
  sha256(new TextEncoder().encode(password));

export const getManagedChacha = async (key: Uint8Array) => {
  //defer the load since this can really slow down initial loads in slow old
  //android devices.
  //const sodium = await import('react-native-libsodium');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sodium = require('react-native-libsodium');

  return {
    encrypt: (message: string | Uint8Array) => {
      const nonce = sodium.randombytes_buf(
        sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
      );
      if (key.length !== sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES)
        throw new Error(
          `key length is ${key.length} != ${sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES}`
        );

      const rawCipherMessage =
        sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
          message,
          CIPHER_ADDITIONAL_DATA, //additional data that can be verified (this is not encoded)
          null, //secret nonce
          nonce, //public nonce
          key,
          'uint8array' //Result type
        );
      const cipherMessage = new Uint8Array(
        nonce.length + rawCipherMessage.length
      );
      cipherMessage.set(nonce, 0);
      cipherMessage.set(rawCipherMessage, nonce.length);
      return cipherMessage;
    },
    decrypt: (cipherMessage: Uint8Array) => {
      // Extract the nonce from the beginning of the cipherMessage
      const nonce = cipherMessage.slice(
        0,
        sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
      );

      // The actual encrypted message is the part after the nonce
      const encryptedMessage = cipherMessage.slice(
        sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
      );

      if (key.length !== sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES) {
        throw new Error(
          `key length is ${key.length} != ${sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES}`
        );
      }

      // Decrypt the message
      const decryptedMessage =
        sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
          null, // secret nonce is null since it wasn't used in encryption
          encryptedMessage, // the encrypted part of the message
          CIPHER_ADDITIONAL_DATA, // additional data for verification
          nonce, // public nonce
          key
        );

      return decryptedMessage;
    }
  };
};

//import memoize from 'lodash.memoize';
//import { xchacha20poly1305 } from '@noble/ciphers/chacha';
//import { managedNonce } from '@noble/ciphers/webcrypto/utils';
//// Memoized function to get the ChaCha encoder instance
//export const getManagedChacha = memoize(
//  (key: Uint8Array) => {
//    const chacha = managedNonce(xchacha20poly1305)(key);
//    return chacha;
//  },
//  (key: Uint8Array) => [...key].join(',')
//);
