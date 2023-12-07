import memoize from 'lodash.memoize';
import { mnemonicToSeedSync } from 'bip39';
const { encode: olderEncode } = require('bip68');
import { networks, type Network } from 'bitcoinjs-lib';
import { scriptExpressions } from '@bitcoinerlab/descriptors';
import type { BIP32Interface } from 'bip32';
import { compilePolicy } from '@bitcoinerlab/miniscript';
import * as secp256k1 from '@bitcoinerlab/secp256k1';
import { DescriptorsFactory } from '@bitcoinerlab/descriptors';
const { Output, BIP32 } = DescriptorsFactory(secp256k1);

export const DUMMY_PUBKEY =
  '0330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c';
export const DUMMY_PUBKEY_2 =
  '038ffea936b2df76bf31220ebd56a34b30c6b86f40d3bd92664e2f5f98488dddfa';

export const DUMMY_SERVICE_ADDRESS = (network: Network) => {
  if (network === networks.bitcoin)
    return 'bc1qp2u85wn9cekkw3khr3trpsznakhhfkekpk2mld';
  else if (network === networks.regtest)
    return 'bcrt1qq7m6la3syc6wk5fglznegngxe5lhy8aajevva9';
  else if (network === networks.testnet)
    return 'tb1qm0k9mn48uqfs2w9gssvzmus4j8srrx5eje7wpf';
  else throw new Error('Network not supported');
};

export const createVaultDescriptor = (pubKey: string) => `wpkh(${pubKey})`;

export const DUMMY_VAULT_OUTPUT = memoize(
  (network: Network) =>
    new Output({
      descriptor: createVaultDescriptor(DUMMY_PUBKEY),
      network
    })
);
export const DUMMY_SERVICE_OUTPUT = memoize(
  (network: Network) =>
    new Output({
      descriptor: createServiceDescriptor(DUMMY_SERVICE_ADDRESS(network)),
      network
    })
);

const DUMMY_MASTERNODE = memoize(network =>
  BIP32.fromSeed(
    mnemonicToSeedSync(
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
    ),
    network
  )
);
export const DUMMY_CHANGE_OUTPUT = memoize(
  (network: Network) =>
    new Output({
      descriptor: createChangeDescriptor({
        masterNode: DUMMY_MASTERNODE(network),
        network
      }),
      index: 0,
      network
    })
);

export const DUMMY_PKH_OUTPUT = new Output({
  descriptor: `pkh(${DUMMY_PUBKEY})`
});

export const createServiceDescriptor = (address: string) => `addr(${address})`;

export const createColdDescriptor = (address: string) => `addr(${address})`;

export const createReceiveDescriptor = ({
  masterNode,
  network
}: {
  masterNode: BIP32Interface;
  network: Network;
}) =>
  scriptExpressions.wpkhBIP32({
    masterNode,
    network,
    account: 0,
    index: '*',
    change: 0
  });

export const createChangeDescriptor = ({
  masterNode,
  network
}: {
  masterNode: BIP32Interface;
  network: Network;
}) =>
  scriptExpressions.wpkhBIP32({
    masterNode,
    network,
    account: 0,
    index: '*',
    change: 1
  });

export const createTriggerDescriptor = ({
  unvaultKey,
  panicKey,
  lockBlocks
}: {
  unvaultKey: string;
  panicKey: string;
  lockBlocks: number;
}) => {
  //TODO: Do not compile the POLICY. hardcode the miniscript
  const POLICY = (older: number) =>
    `or(pk(@panicKey),99@and(pk(@unvaultKey),older(${older})))`;
  const older = olderEncode({ blocks: lockBlocks });
  const { miniscript, issane } = compilePolicy(POLICY(older));
  if (!issane) throw new Error('Policy not sane');

  const triggerDescriptor = `wsh(${miniscript
    .replace('@unvaultKey', unvaultKey)
    .replace('@panicKey', panicKey)})`;
  return triggerDescriptor;
};
