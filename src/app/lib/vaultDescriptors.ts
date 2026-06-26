// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import memoize from 'lodash.memoize';
//import type { BIP32Interface } from 'bip32';
import moize from 'moize';
import { mnemonicToSeedSync } from 'bip39';
import { toHex } from 'uint8array-tools';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { encode: olderEncode } = require('bip68');
import { networks, type Network } from 'bitcoinjs-lib';
import type { TFunction } from 'i18next';
import {
  scriptExpressions,
  keyExpressionBIP32
} from '@bitcoinerlab/descriptors';
import { Accounts, Signer, Signers, SOFTWARE } from './wallets';
import type { Account } from '@bitcoinerlab/discovery';
import { ensureDescriptorsFactoryInstance } from './descriptorsFactory';

const getNetworkCacheKey = (network: Network) =>
  `${network.bech32}:${network.pubKeyHash}:${network.scriptHash}:${network.wif}:${network.bip32.public}:${network.bip32.private}`;

export const DUMMY_PUBKEY =
  '0330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c';
export const DUMMY_PUBKEY_2 =
  '038ffea936b2df76bf31220ebd56a34b30c6b86f40d3bd92664e2f5f98488dddfa';

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

export const DUMMY_VAULT_OUTPUT = memoize((network: Network) => {
  const { Output } = ensureDescriptorsFactoryInstance();
  return new Output({
    descriptor: createVaultDescriptor(DUMMY_PUBKEY),
    network
  });
});
export const DUMMY_BACKUP_OUTPUT = memoize((network: Network) => {
  const { Output } = ensureDescriptorsFactoryInstance();
  return new Output({
    descriptor: createVaultDescriptor(DUMMY_PUBKEY_2),
    network
  });
});
export const DUMMY_TRIGGER_RESERVE_OUTPUT = memoize((network: Network) => {
  const { Output } = ensureDescriptorsFactoryInstance();
  return new Output({
    descriptor: createVaultDescriptor(DUMMY_PUBKEY_2),
    network
  });
});
export const DUMMY_CHANGE_DESCRIPTOR = (account: string) =>
  account.replace(/\/0\/\*/g, '/1/0');

export const DUMMY_CHANGE_OUTPUT = memoize(
  (account: string, network: Network) => {
    const { Output } = ensureDescriptorsFactoryInstance();
    return new Output({
      descriptor: account.replace(/\/0\/\*/g, '/1/*'),
      index: 0,
      network
    });
  }
);
export const computeOutput = moize(
  (
    descriptorWithIndex: { descriptor: string; index: number },
    network: Network
  ) => {
    const { Output } = ensureDescriptorsFactoryInstance();
    return new Output({ ...descriptorWithIndex, network });
  },
  {
    maxSize: 256,
    transformArgs: args => {
      const [descriptorWithIndex, network] = args as [
        { descriptor: string; index: number },
        Network
      ];
      return [
        descriptorWithIndex.descriptor,
        descriptorWithIndex.index,
        getNetworkCacheKey(network)
      ];
    }
  }
);

export const DUMMY_PKH_OUTPUT = memoize(() => {
  const { Output } = ensureDescriptorsFactoryInstance();
  return new Output({
    descriptor: `pkh(${DUMMY_PUBKEY})`
  });
});

export const createVaultDescriptor = (pubKey: string) => `wpkh(${pubKey})`;

export const createAddressDescriptor = (address: string) => `addr(${address})`;

export const createAddressOutput = moize(
  (address: string, network: Network) => {
    const { Output } = ensureDescriptorsFactoryInstance();
    return new Output({
      descriptor: createAddressDescriptor(address),
      network
    });
  }
);

export const createColdDescriptor = (address: string) => `addr(${address})`;

export const createSoftwareSignerFromMnemonic = (
  mnemonic: string,
  network: Network
): Signer => {
  const masterNode = getMasterNode(mnemonic, network);
  return {
    masterFingerprint: toHex(masterNode.fingerprint),
    type: SOFTWARE,
    mnemonic
  };
};

/** Async because in the future i may have some signing server that will
 * guarantee randomness...*/
export const createP2WPKHAddress = async ({
  mnemonic,
  network,
  change,
  index
}: {
  mnemonic: string;
  network: Network;
  change: 0 | 1;
  index: number;
}) => {
  const descriptor = createP2WPKHDescriptor({ mnemonic, network, change });
  return getDescriptorAddress({ descriptor, network, index });
};

export const createP2WPKHDescriptor = ({
  mnemonic,
  network,
  change
}: {
  mnemonic: string;
  network: Network;
  change: 0 | 1;
}) =>
  scriptExpressions.wpkhBIP32({
    masterNode: getMasterNode(mnemonic, network),
    network,
    account: 0,
    index: '*',
    change
  });

type StandardAccountDescriptorParams = Parameters<
  typeof scriptExpressions.wpkhBIP32
>[0];

// Standard wallet account types, ordered by preference when the wallet already
// has account history. This order does not choose the first account for a new
// wallet; DEFAULT_STANDARD_ACCOUNT is the explicit default for that case.
export const ORDERED_STANDARD_ACCOUNT_SCRIPT_DEFINITIONS = [
  {
    scriptType: 'tr',
    purpose: 86,
    expandedExpression: 'tr(@0)',
    descriptorPrefix: 'tr(',
    getAddressPickerLabel: (t: TFunction) => t('addressPicker.scripts.taproot'),
    getCoinControlGroupLabel: (t: TFunction) => t('coinControl.groups.taproot'),
    createDescriptor: (params: StandardAccountDescriptorParams) =>
      scriptExpressions.trBIP32(params)
  },
  {
    scriptType: 'wpkh',
    purpose: 84,
    expandedExpression: 'wpkh(@0)',
    descriptorPrefix: 'wpkh(',
    getAddressPickerLabel: (t: TFunction) =>
      t('addressPicker.scripts.nativeSegwit'),
    getCoinControlGroupLabel: (t: TFunction) =>
      t('coinControl.groups.nativeSegwit'),
    createDescriptor: (params: StandardAccountDescriptorParams) =>
      scriptExpressions.wpkhBIP32(params)
  },
  {
    scriptType: 'shWpkh',
    purpose: 49,
    expandedExpression: 'sh(wpkh(@0))',
    descriptorPrefix: 'sh(wpkh(',
    getAddressPickerLabel: (t: TFunction) =>
      t('addressPicker.scripts.wrappedSegwit'),
    getCoinControlGroupLabel: (t: TFunction) =>
      t('coinControl.groups.wrappedSegwit'),
    createDescriptor: (params: StandardAccountDescriptorParams) =>
      scriptExpressions.shWpkhBIP32(params)
  },
  {
    scriptType: 'pkh',
    purpose: 44,
    expandedExpression: 'pkh(@0)',
    descriptorPrefix: 'pkh(',
    getAddressPickerLabel: (t: TFunction) => t('addressPicker.scripts.legacy'),
    getCoinControlGroupLabel: (t: TFunction) => t('coinControl.groups.legacy'),
    createDescriptor: (params: StandardAccountDescriptorParams) =>
      scriptExpressions.pkhBIP32(params)
  }
] as const;

export type StandardAccountScriptType =
  (typeof ORDERED_STANDARD_ACCOUNT_SCRIPT_DEFINITIONS)[number]['scriptType'];
type StandardAccountScriptDefinition =
  (typeof ORDERED_STANDARD_ACCOUNT_SCRIPT_DEFINITIONS)[number];

export const DEFAULT_STANDARD_ACCOUNT = {
  scriptType: 'wpkh',
  accountNumber: 0
} as const satisfies {
  scriptType: StandardAccountScriptType;
  accountNumber: number;
};

export const getStandardAccountScriptDefinition = (
  scriptType: StandardAccountScriptType
) => {
  const definition = ORDERED_STANDARD_ACCOUNT_SCRIPT_DEFINITIONS.find(
    definition => definition.scriptType === scriptType
  );
  if (!definition)
    throw new Error(`Unknown standard account script type: ${scriptType}`);
  return definition;
};

export const getStandardAccountScriptType = (descriptor: string) =>
  ORDERED_STANDARD_ACCOUNT_SCRIPT_DEFINITIONS.find(definition =>
    descriptor.startsWith(definition.descriptorPrefix)
  )?.scriptType;

const getScriptDefinitionsForAccountsWithoutHistory = () => {
  const defaultDefinition = getStandardAccountScriptDefinition(
    DEFAULT_STANDARD_ACCOUNT.scriptType
  );
  const nonDefaultDefinitions =
    ORDERED_STANDARD_ACCOUNT_SCRIPT_DEFINITIONS.filter(
      definition =>
        definition.scriptType !== DEFAULT_STANDARD_ACCOUNT.scriptType
    );
  return [defaultDefinition, ...nonDefaultDefinitions];
};

export const isDefaultStandardAccount = ({
  scriptType,
  accountNumber
}: {
  scriptType: StandardAccountScriptType;
  accountNumber: number;
}) =>
  scriptType === DEFAULT_STANDARD_ACCOUNT.scriptType &&
  accountNumber === DEFAULT_STANDARD_ACCOUNT.accountNumber;

const getPurposeOrder = (
  definitions: readonly StandardAccountScriptDefinition[]
) => {
  const purposeOrder: { [key: number]: number } = {};
  definitions.forEach((definition, index) => {
    purposeOrder[definition.purpose] = index;
  });
  return purposeOrder;
};

const usedPurposeOrder = getPurposeOrder(
  ORDERED_STANDARD_ACCOUNT_SCRIPT_DEFINITIONS
);
const defaultPurposeOrder = getPurposeOrder(
  getScriptDefinitionsForAccountsWithoutHistory()
);

export const createStandardAccountDescriptor = moize(
  ({
    signer,
    network,
    scriptType,
    account
  }: {
    signer: Signer;
    network: Network;
    scriptType: StandardAccountScriptType;
    account: number;
  }) => {
    if (signer.type !== SOFTWARE)
      throw new Error(`Signer type ${signer.type} not supported`);
    const mnemonic = signer.mnemonic;
    if (!mnemonic) throw new Error(`mnemonic not provided for ${signer.type}`);

    const params = {
      masterNode: getMasterNode(mnemonic, network),
      network,
      account,
      index: '*' as const,
      change: 0 as const
    };

    return getStandardAccountScriptDefinition(scriptType).createDescriptor(
      params
    ) as Account;
  },
  {
    maxSize: 64,
    transformArgs: args => {
      const [{ signer, network, scriptType, account }] = args as [
        {
          signer: Signer;
          network: Network;
          scriptType: StandardAccountScriptType;
          account: number;
        }
      ];
      return [
        signer.mnemonic,
        getNetworkCacheKey(network),
        scriptType,
        account
      ];
    }
  }
);

export const parseStandardAccount = (
  account: Account
): {
  accountNumber: number;
  scriptType: StandardAccountScriptType;
} => {
  const accountNumberMatch = account.match(/\/(\d+)'\]/);
  if (!accountNumberMatch?.[1])
    throw new Error(`Cannot read account number from descriptor: ${account}`);
  const accountNumber = Number(accountNumberMatch[1]);
  if (!Number.isSafeInteger(accountNumber) || accountNumber < 0)
    throw new Error(`Invalid account number in descriptor: ${account}`);
  const scriptType = getStandardAccountScriptType(account);
  if (!scriptType)
    throw new Error(`Unknown standard account script type: ${account}`);
  return { accountNumber, scriptType };
};

export const getDescriptorAddress = ({
  descriptor,
  network,
  index
}: {
  descriptor: string;
  network: Network;
  index: number;
}) => {
  const { Output } = ensureDescriptorsFactoryInstance();
  return new Output({ descriptor, index, network }).getAddress();
};

/** Async because in the future i may have some signing server that will
 * guarantee randomness...*/
export const createColdAddress = async (mnemonic: string, network: Network) =>
  createP2WPKHAddress({ mnemonic, network, change: 1, index: 0 });

// BIP39 seed derivation is expensive on mobile. Vault creation alternates
// between the wallet signer and the ephemeral vault signer, so keep both hot
// and leave space for a few other recent signers.
export const getMasterNode = moize(
  (mnemonic: string, network: Network) => {
    const { BIP32 } = ensureDescriptorsFactoryInstance();
    return BIP32.fromSeed(mnemonicToSeedSync(mnemonic), network);
  },
  { maxSize: 10 }
);

/** Async because some signers will be async */
const createDefaultReceiveDescriptor = async ({
  signer,
  network
}: {
  signer: Signer;
  network: Network;
}) => {
  return createStandardAccountDescriptor({
    signer,
    network,
    scriptType: DEFAULT_STANDARD_ACCOUNT.scriptType,
    account: DEFAULT_STANDARD_ACCOUNT.accountNumber
  });
};

//const createDefaultChangeDescriptorFromMasterNode = (
//  masterNode: BIP32Interface,
//  network: Network
//) =>
//  scriptExpressions.wpkhBIP32({
//    masterNode,
//    network,
//    account: 0,
//    index: '*',
//    change: 1
//  });

/** Async because some signers will be async */
//const createDefaultChangeDescriptor = async ({
//  signer,
//  network
//}: {
//  signer: Signer;
//  network: Network;
//}) => {
//  if (signer.type === SOFTWARE) {
//    const mnemonic = signer.mnemonic;
//    if (!mnemonic) throw new Error(`mnemonic not provided for ${signer.type}`);
//    return createDefaultChangeDescriptorFromMasterNode(
//      getMasterNode(mnemonic, network),
//      network
//    );
//  } else throw new Error(`Signer type ${signer.type} not supported`);
//};

export const createUnvaultKeyExpression = async ({
  signer,
  network
}: {
  signer: Signer;
  network: Network;
}) => {
  if (signer.type === SOFTWARE) {
    const mnemonic = signer.mnemonic;
    if (!mnemonic) throw new Error(`mnemonic not provided for ${signer.type}`);
    const unvaultKeyExpression = keyExpressionBIP32({
      masterNode: getMasterNode(mnemonic, network),
      originPath: "/0'",
      keyPath: '/0'
    });
    return unvaultKeyExpression;
  } else throw new Error(`Signer type ${signer.type} not supported`);
};

export const createTriggerDescriptor = ({
  unvaultKeyExpression,
  panicKeyExpression,
  lockBlocks
}: {
  unvaultKeyExpression: string;
  panicKeyExpression: string;
  lockBlocks: number;
}) => {
  const older = olderEncode({ blocks: lockBlocks });
  const triggerDescriptor = `wsh(andor(pk(${unvaultKeyExpression}),older(${older}),pkh(${panicKeyExpression})))`;
  return triggerDescriptor;
};

//export const getDefaultDescriptors = async (
//  signers: Signers,
//  network: Network
//) => {
//  const signer = signers[0];
//  if (!signer) throw new Error('signer unavailable');
//  const changeDescriptorRanged = await createDefaultChangeDescriptor({
//    signer,
//    network
//  });
//  const receiveDescriptorRanged = await createDefaultReceiveDescriptor({
//    signer,
//    network
//  });
//  return [receiveDescriptorRanged, changeDescriptorRanged];
//};
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
 * Selects the wallet account to use for automatic receive/change defaults.
 *
 * `getAccountHasHistory` decides whether an account is used. For normal wallet
 * accounts, used means the receive range or the change range has history.
 *
 * Used accounts win over unused accounts. Used accounts are ordered by
 * ORDERED_STANDARD_ACCOUNT_SCRIPT_DEFINITIONS; if more than one used account has
 * the same script, the highest account number wins. If no account is used, the
 * configured default standard account wins.
 */
export const selectPreferredAccount = ({
  accounts,
  network,
  getAccountHasHistory
}: {
  accounts: Accounts;
  network: Network;
  getAccountHasHistory: (account: Account) => boolean;
}): Account => {
  const mainCandidates: {
    descriptor: string;
    purpose: number;
    accountNumber: number;
    isUsed: boolean;
  }[] = [];

  const { expand } = ensureDescriptorsFactoryInstance();
  Object.keys(accounts).forEach(descriptor => {
    const expansion = expand({ descriptor, network });
    const expandedExpression = expansion.expandedExpression;
    const expansionMapValues = Object.values(expansion.expansionMap || {})[0];

    if (expansionMapValues) {
      const { keyPath, originPath } = expansionMapValues;
      const originPathElements = originPath?.split('/');
      const [, purposeH, coinTypeH, accountNumberH] = originPathElements || [];
      const purpose = purposeH === undefined ? -1 : parseInt(purposeH);
      const accountNumber =
        accountNumberH === undefined ? -1 : parseInt(accountNumberH);

      const definition = ORDERED_STANDARD_ACCOUNT_SCRIPT_DEFINITIONS.find(
        definition =>
          definition.purpose === purpose &&
          definition.expandedExpression === expandedExpression
      );

      if (
        originPathElements?.length === 4 && // 4 is right, 1st el is empty
        keyPath === '/0/*' &&
        accountNumberH === `${accountNumber}'` &&
        purposeH === `${purpose}'` &&
        definition &&
        coinTypeH === (network === networks.bitcoin ? "0'" : "1'")
      ) {
        mainCandidates.push({
          descriptor,
          purpose,
          accountNumber,
          isUsed: getAccountHasHistory(descriptor as Account)
        });
      }
    }
  });

  if (mainCandidates.length === 0)
    throw new Error('Could not get the main account');

  const hasUsedAccount = mainCandidates.some(candidate => candidate.isUsed);
  mainCandidates.sort((a, b) => {
    if (hasUsedAccount && a.isUsed !== b.isUsed) return a.isUsed ? -1 : 1;
    const purposeOrder =
      hasUsedAccount && a.isUsed && b.isUsed
        ? usedPurposeOrder
        : defaultPurposeOrder;
    const purposeAOrder = purposeOrder[a.purpose];
    const purposeBOrder = purposeOrder[b.purpose];
    if (purposeAOrder === undefined || purposeBOrder === undefined)
      throw new Error('purposeOrder did not take all possible cases');
    const purposeComparison = purposeAOrder - purposeBOrder;
    if (purposeComparison !== 0) return purposeComparison;
    return hasUsedAccount && a.isUsed && b.isUsed
      ? b.accountNumber - a.accountNumber
      : a.accountNumber - b.accountNumber;
  });

  return mainCandidates[0]!.descriptor as Account;
};
