import memoize from 'lodash.memoize';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { managedNonce } from '@noble/ciphers/webcrypto/utils';

// Memoized function to get the ChaCha encoder instance
export const getManagedChacha = memoize(
  (key: Uint8Array) => {
    const chacha = managedNonce(xchacha20poly1305)(key);
    return chacha;
  },
  (key: Uint8Array) => [...key].join(',')
);
