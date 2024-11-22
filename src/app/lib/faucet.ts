import type { Accounts } from './wallets';
import { Network, networks } from 'bitcoinjs-lib';
import * as secp256k1 from '@bitcoinerlab/secp256k1';
import { DescriptorsFactory } from '@bitcoinerlab/descriptors';
import { getMainAccount } from './vaultDescriptors';
const { Output } = DescriptorsFactory(secp256k1);
export const faucetFirstReceive = async (
  accounts: Accounts,
  network: Network,
  faucetAPI: string,
  networkTimeout: number
) => {
  if (network !== networks.regtest)
    throw new Error('Cannot faucet non-regtest networks');
  const descriptor = getMainAccount(accounts, network); //account is external
  const index = 0;
  const firstReceiveAddr = new Output({
    descriptor,
    network,
    index
  }).getAddress();
  const response = await fetch(faucetAPI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    //Here we could pass the locale so that error messages returned by the server
    //are formatted in the users language. Not really useful anyway since the
    //error is finally never shown to the user anyway...
    //This is how this could be done:
    //const languageTag = locale === 'default' ? getLocales()[0]!.languageTag : locale;
    //body:`address=${encodeURIComponent(firstReceiveAddr)}&locale=${encodeURIComponent(languageTag)}`
    body: `address=${encodeURIComponent(firstReceiveAddr)}`,
    signal: AbortSignal.timeout(networkTimeout)
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
    address: firstReceiveAddr,
    descriptor,
    index,
    info: result.info // May contain 'CACHED' or other additional information
  };
};
