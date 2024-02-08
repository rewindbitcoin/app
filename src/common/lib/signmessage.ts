//Based on this
//https://github.com/bitcoinjs/bitcoinjs-message/blob/master/index.js
import varuint from 'varuint-bitcoin';
import { crypto } from 'bitcoinjs-lib';
import { signRecoverable } from '@bitcoinerlab/secp256k1';

interface SignatureOptions {
  segwitType?: 'p2wpkh' | 'p2sh(p2wpkh)';
}

function encodeSignature(
  signature: Uint8Array,
  recovery: number,
  compressed: boolean,
  segwitType?: 'p2wpkh' | 'p2sh(p2wpkh)'
) {
  if (segwitType !== undefined) {
    recovery += 8;
    if (segwitType === 'p2wpkh') recovery += 4;
  } else {
    if (compressed) recovery += 4;
  }
  return Buffer.concat([Buffer.alloc(1, recovery + 27), signature]);
}

function magicHash(message: string | Buffer) {
  if (!Buffer.isBuffer(message)) {
    message = Buffer.from(message, 'utf8');
  }

  const messagePrefix = Buffer.from('\u0018Bitcoin Signed Message:\n', 'utf8');
  const messageVISize = varuint.encodingLength(message.length);
  const buffer = Buffer.allocUnsafe(
    messagePrefix.length + messageVISize + message.length
  );
  messagePrefix.copy(buffer, 0);
  varuint.encode(message.length, buffer, messagePrefix.length);
  message.copy(buffer, messagePrefix.length + messageVISize);
  return crypto.hash256(buffer);
}

export function signMessage(
  message: string | Buffer,
  privateKey: Buffer,
  compressed: boolean,
  sigOptions?: SignatureOptions
) {
  const hash = magicHash(message);
  const { signature, recoveryId } = signRecoverable(hash, privateKey);

  return encodeSignature(
    signature,
    recoveryId,
    compressed,
    sigOptions?.segwitType
  );
}
