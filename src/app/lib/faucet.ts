import type { Signers } from './wallets';
import { Network, networks } from 'bitcoinjs-lib';
import * as secp256k1 from '@bitcoinerlab/secp256k1';
import { DescriptorsFactory } from '@bitcoinerlab/descriptors';
import { createDefaultReceiveDescriptor } from './vaultDescriptors';
import type { Locale } from '../../i18n-locales/init';
const { Output } = DescriptorsFactory(secp256k1);
export const faucetFirstReceive = async (
  signers: Signers,
  network: Network,
  faucetAPI: string,
  locale: Locale
) => {
  const signer = signers?.[0];
  if (!signer) throw new Error('signer unavailable');
  if (network !== networks.regtest)
    throw new Error('Cannot faucet non-regtest networks');
  const firstReceiveAddr = new Output({
    descriptor: await createDefaultReceiveDescriptor({ signer, network }),
    network,
    index: 0
  }).getAddress();
  console.log({
    firstReceiveAddr,
    body: new URLSearchParams({ address: firstReceiveAddr })
  });
  const response = await fetch(faucetAPI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `address=${encodeURIComponent(firstReceiveAddr)}&locale=${encodeURIComponent(locale)}`
  });

  // Check if the request was successful
  if (!response.ok) {
    const errorResponse = await response.json();
    throw new Error(
      `Failed to faucet address: ${errorResponse.error || 'Unknown error'}`
    );
  }

  // Parse the JSON body of the response
  const result = await response.json();
  if (!result.ok) throw new Error(`Faucet failed: ${result.error}`);

  return {
    txId: result.txId,
    info: result.info // May contain 'CACHED' or other additional information
  };
};
