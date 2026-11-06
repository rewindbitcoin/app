// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

jest.mock(
  '@env',
  () => ({ CIPHER_ADDITIONAL_DATA: 'rewind-web-cipher-test' }),
  {
    virtual: true
  }
);
jest.mock('../dist/src/common/lib/textencoder', () => ({
  TextEncoder: jest.requireActual('util').TextEncoder
}));
jest.mock('react-native-libsodium', () => ({}), { virtual: true });

import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { getManagedChacha } from '../dist/src/common/lib/cipher';

const sodium = jest.requireMock('react-native-libsodium');
const realSodium: typeof import('libsodium-wrappers') =
  jest.requireActual('libsodium-wrappers');
const key = Uint8Array.from({ length: 32 }, (_, i) => i);
const nonce = Uint8Array.from({ length: 24 }, (_, i) => i + 32);
const messageText = 'Rewind: Español 日本語 🔑';
const message = Uint8Array.from(Buffer.from(messageText));
const aad = Buffer.from('rewind-web-cipher-test');

beforeAll(async () => {
  await realSodium.ready;
});

beforeEach(() => {
  Object.assign(sodium, realSodium);
});

describe('Sodium initialization and ciphertext compatibility', () => {
  test('does not expose the cipher before Sodium is ready', async () => {
    let resolveReady!: () => void;
    sodium.ready = new Promise<void>(resolve => {
      resolveReady = resolve;
    });
    let initialized = false;
    const pending = getManagedChacha(key).then(cipher => {
      initialized = true;
      return cipher;
    });
    await Promise.resolve();
    expect(initialized).toBe(false);
    resolveReady();
    const cipher = await pending;
    expect(initialized).toBe(true);
    expect(cipher.decrypt(cipher.encrypt(message))).toEqual(message);
  });

  test('propagates a Sodium initialization failure', async () => {
    const error = new Error('Sodium initialization failed');
    sodium.ready = Promise.reject(error);
    // Keep this a controlled regression even against the pre-fix factory.
    void sodium.ready.catch(() => undefined);
    await expect(getManagedChacha(key)).rejects.toBe(error);
  });

  test('preserves nonce-prefixed XChaCha20-Poly1305 ciphertext bytes', async () => {
    sodium.randombytes_buf = () => nonce;
    const cipher = await getManagedChacha(key);
    const legacyCiphertext = new Uint8Array([
      ...nonce,
      ...xchacha20poly1305(key, nonce, aad).encrypt(message)
    ]);
    expect(cipher.encrypt(message)).toEqual(legacyCiphertext);
    expect(cipher.encrypt(messageText)).toEqual(legacyCiphertext);
    expect(cipher.decrypt(legacyCiphertext)).toEqual(message);
  });

  test('roundtrips arbitrary binary data after initialization', async () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    const cipher = await getManagedChacha(key);
    expect(cipher.decrypt(cipher.encrypt(bytes))).toEqual(bytes);
  });

  test('rejects ciphertext encrypted with a different key', async () => {
    const cipher = await getManagedChacha(key);
    const other = await getManagedChacha(new Uint8Array(32).fill(255));
    expect(() => other.decrypt(cipher.encrypt(message))).toThrow();
  });

  test('rejects modified ciphertext', async () => {
    const cipher = await getManagedChacha(key);
    const ciphertext = cipher.encrypt(message);
    ciphertext[24] = ciphertext[24]! ^ 1;
    expect(() => cipher.decrypt(ciphertext)).toThrow();
  });

  test('retains the key-length check', async () => {
    const cipher = await getManagedChacha(new Uint8Array(31));
    expect(() => cipher.encrypt(message)).toThrow('key length is 31 != 32');
  });
});
