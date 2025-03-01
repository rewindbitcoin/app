import memoize from 'lodash.memoize';
import type { BIP32Interface } from 'bip32';
import moize from 'moize';
import { mnemonicToSeedSync } from 'bip39';
const { encode: olderEncode } = require('bip68');
import { networks, type Network } from 'bitcoinjs-lib';
import {
  scriptExpressions,
  keyExpressionBIP32
} from '@bitcoinerlab/descriptors';
import { compilePolicy } from '@bitcoinerlab/miniscript';
import * as secp256k1 from '@bitcoinerlab/secp256k1';
import { DescriptorsFactory } from '@bitcoinerlab/descriptors';
const { Output, BIP32, expand } = DescriptorsFactory(secp256k1);
import { Accounts, Signer, Signers, SOFTWARE } from './wallets';
import type { Account } from '@bitcoinerlab/discovery';

export const DUMMY_PUBKEY =
  '0330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c';
export const DUMMY_PUBKEY_2 =
  '038ffea936b2df76bf31220ebd56a34b30c6b86f40d3bd92664e2f5f98488dddfa';

export const DUMMY_SERVICE_ADDRESS = memoize((network: Network) => {
  if (network === networks.bitcoin)
    return 'bc1qp2u85wn9cekkw3khr3trpsznakhhfkekpk2mld';
  else if (network === networks.regtest)
    return 'bcrt1qq7m6la3syc6wk5fglznegngxe5lhy8aajevva9';
  else if (network === networks.testnet)
    return 'tb1qm0k9mn48uqfs2w9gssvzmus4j8srrx5eje7wpf';
  else throw new Error('Network not supported');
});

export const DUMMY_COLD_ADDRESS = memoize((network: Network) => {
  if (network === networks.bitcoin)
    return 'bc1qp2u85wn9cekkw3khr3trpsznakhhfkekpk2mld';
  else if (network === networks.regtest)
    return 'bcrt1qq7m6la3syc6wk5fglznegngxe5lhy8aajevva9';
  else if (network === networks.testnet)
    return 'tb1qm0k9mn48uqfs2w9gssvzmus4j8srrx5eje7wpf';
  else throw new Error('Network not supported');
});

export const DUMMY_SEND_ADDRESS = memoize((network: Network) => {
  if (network === networks.bitcoin)
    return 'bc1qp2u85wn9cekkw3khr3trpsznakhhfkekpk2mld';
  else if (network === networks.regtest)
    return 'bcrt1qq7m6la3syc6wk5fglznegngxe5lhy8aajevva9';
  else if (network === networks.testnet)
    return 'tb1qm0k9mn48uqfs2w9gssvzmus4j8srrx5eje7wpf';
  else throw new Error('Network not supported');
});

export const DUMMY_PKH_ADDRESS = memoize((network: Network) => {
  if (network === networks.bitcoin) return '1HoY94QENW9KijWkN2fqSHZXCpa8bd9ENi';
  else if (network === networks.regtest)
    return 'mpmckE36w9mPpricj6aPY3jkG2VcXxGEb8';
  else if (network === networks.testnet)
    return 'mpmckE36w9mPpricj6aPY3jkG2VcXxGEb8';
  else throw new Error('Network not supported');
});

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
export const DUMMY_CHANGE_DESCRIPTOR = (account: string) =>
  account.replace(/\/0\/\*/g, '/1/0');

export const DUMMY_CHANGE_OUTPUT = memoize(
  (account: string, network: Network) => {
    return new Output({
      descriptor: account.replace(/\/0\/\*/g, '/1/*'),
      index: 0,
      network
    });
  }
);
export const computeChangeOutput = memoize(
  (
    changeDescriptorWithIndex: { descriptor: string; index: number },
    network: Network
  ) => {
    return new Output({
      ...changeDescriptorWithIndex,
      network
    });
  }
);
export const computeReceiveOutput = memoize(
  (
    receiveDescriptorWithIndex: { descriptor: string; index: number },
    network: Network
  ) => {
    return new Output({ ...receiveDescriptorWithIndex, network });
  }
);

export const DUMMY_PKH_OUTPUT = new Output({
  descriptor: `pkh(${DUMMY_PUBKEY})`
});

export const createVaultDescriptor = (pubKey: string) => `wpkh(${pubKey})`;

export const createServiceDescriptor = (address: string) => `addr(${address})`;

export const createServiceOutput = moize(
  (serviceAddress: string, network: Network) =>
    new Output({
      descriptor: createServiceDescriptor(serviceAddress),
      network
    })
);

export const createColdDescriptor = (address: string) => `addr(${address})`;

/** Async because in the future i may have some signing server that will
 * guarantee randomness...*/
export const createColdAddress = async (mnemonic: string, network: Network) => {
  const masterNode = getMasterNode(mnemonic, network);
  const descriptor = scriptExpressions.wpkhBIP32({
    masterNode,
    network,
    account: 0,
    index: 0,
    change: 1
  });
  return new Output({ descriptor, network }).getAddress();
};

export const getMasterNode = moize((mnemonic: string, network: Network) =>
  BIP32.fromSeed(mnemonicToSeedSync(mnemonic), network)
);

/** Async because some signers will be async */
const createDefaultReceiveDescriptor = async ({
  signer,
  network
}: {
  signer: Signer;
  network: Network;
}) => {
  if (signer.type === SOFTWARE) {
    const mnemonic = signer.mnemonic;
    if (!mnemonic) throw new Error(`mnemonic not provided for ${signer.type}`);
    return scriptExpressions.wpkhBIP32({
      masterNode: getMasterNode(mnemonic, network),
      network,
      account: 0,
      index: '*',
      change: 0
    });
  } else throw new Error(`Signer type ${signer.type} not supported`);
};

const createDefaultChangeDescriptorFromMasterNode = (
  masterNode: BIP32Interface,
  network: Network
) =>
  scriptExpressions.wpkhBIP32({
    masterNode,
    network,
    account: 0,
    index: '*',
    change: 1
  });

/** Async because some signers will be async */
const createDefaultChangeDescriptor = async ({
  signer,
  network
}: {
  signer: Signer;
  network: Network;
}) => {
  if (signer.type === SOFTWARE) {
    const mnemonic = signer.mnemonic;
    if (!mnemonic) throw new Error(`mnemonic not provided for ${signer.type}`);
    return createDefaultChangeDescriptorFromMasterNode(
      getMasterNode(mnemonic, network),
      network
    );
  } else throw new Error(`Signer type ${signer.type} not supported`);
};

export const createUnvaultKey = async ({
  signer,
  network
}: {
  signer: Signer;
  network: Network;
}) => {
  if (signer.type === SOFTWARE) {
    const mnemonic = signer.mnemonic;
    if (!mnemonic) throw new Error(`mnemonic not provided for ${signer.type}`);
    const unvaultKey = keyExpressionBIP32({
      masterNode: getMasterNode(mnemonic, network),
      originPath: "/0'",
      keyPath: '/0'
    });
    return unvaultKey;
  } else throw new Error(`Signer type ${signer.type} not supported`);
};

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

export const getDefaultDescriptors = async (
  signers: Signers,
  network: Network
) => {
  const signer = signers[0];
  if (!signer) throw new Error('signer unavailable');
  const changeDescriptorRanged = await createDefaultChangeDescriptor({
    signer,
    network
  });
  const receiveDescriptorRanged = await createDefaultReceiveDescriptor({
    signer,
    network
  });
  return [receiveDescriptorRanged, changeDescriptorRanged];
};
export const getDefaultAccount = async (signers: Signers, network: Network) => {
  const signer = signers[0];
  if (!signer) throw new Error('signer unavailable');
  const receiveDescriptorRanged = await createDefaultReceiveDescriptor({
    signer,
    network
  });
  return receiveDescriptorRanged as Account;
};

/**
 * Retrieves the main Bitcoin account from a list of account descriptors.
 *
 * @param accounts - The list of Bitcoin account descriptors.
 * @param network - The network configuration (mainnet or testnet).
 * @returns The descriptor of the main account.
 * @throws Will throw an error if no main account is found.
 *
 * This function evaluates the descriptors to find the main account based on the
 * purpose and the largest account number, prioritizing:
 * - 'wpkh(@0)' (BIP84) > 'sh(wpkh(@0))' (BIP49) > 'pkh(@0)' (BIP44).
 * - Largest account number within the same purpose category.
 */

export const getMainAccount = moize(
  (accounts: Accounts, network: Network): string => {
    const mainCandidates: {
      descriptor: string;
      purpose: number;
      accountNumber: number;
    }[] = [];

    Object.keys(accounts).forEach(descriptor => {
      const expansion = expand({ descriptor, network });
      const expandedExpression = expansion.expandedExpression;
      const expansionMapValues = Object.values(expansion.expansionMap || {})[0];

      if (expansionMapValues) {
        const { keyPath, originPath } = expansionMapValues;
        const originPathElements = originPath?.split('/');
        const [, purposeH, coinTypeH, accountNumberH] =
          originPathElements || [];
        const purpose = purposeH === undefined ? -1 : parseInt(purposeH);
        const accountNumber =
          accountNumberH === undefined ? -1 : parseInt(accountNumberH);

        if (
          originPathElements?.length === 4 && // 4 is right, 1st el is empty
          keyPath === '/0/*' &&
          accountNumberH === `${accountNumber}'` &&
          purposeH === `${purpose}'` &&
          [44, 49, 84].includes(purpose) &&
          coinTypeH === (network === networks.bitcoin ? "0'" : "1'") &&
          ((purpose === 44 && expandedExpression === 'pkh(@0)') ||
            (purpose === 49 && expandedExpression === 'sh(wpkh(@0))') ||
            (purpose === 84 && expandedExpression === 'wpkh(@0)'))
        ) {
          mainCandidates.push({ descriptor, purpose, accountNumber });
        }
      }
    });

    if (mainCandidates.length === 0)
      throw new Error('Could not get the main account');

    const purposeOrder: { [key: number]: number } = { 84: 0, 49: 1, 44: 2 };
    // Sort by purpose preference and then by account number
    mainCandidates.sort((a, b) => {
      // wpkh > sh(wpkh) > pkh
      const purposeAOrder = purposeOrder[a.purpose];
      const purposeBOrder = purposeOrder[b.purpose];
      if (purposeAOrder === undefined || purposeBOrder === undefined)
        throw new Error('purposeOrder did not take all possible cases');
      const purposeComparison = purposeAOrder - purposeBOrder;
      if (purposeComparison !== 0) return purposeComparison;
      //Second ordering criteria is accountNumber: larger account number is preferred
      return b.accountNumber - a.accountNumber;
    });

    return mainCandidates[0]!.descriptor;
  }
);
