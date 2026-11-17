// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

// Exercise the modal's real event handlers with isolated hook state. Native
// rendering and signing are stubbed; package math has its own regression tests.
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useState: (initial: unknown) => mockState(initial),
  useRef: (initial: unknown) => mockState({ current: initial })[0],
  useMemo: (compute: () => unknown, deps: unknown[]) => mockMemo(compute, deps),
  useCallback: (callback: unknown) => callback
}));
jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable'
}));
jest.mock('react-native-css-interop/jsx-runtime', () =>
  jest.requireActual('react/jsx-runtime')
);
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockTranslate })
}));
jest.mock('@expo/vector-icons', () => ({
  FontAwesome5: 'Icon',
  MaterialCommunityIcons: 'Icon'
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('react-native-qrcode-svg', () => ({
  __esModule: true,
  default: 'QRCode'
}));
jest.mock('../dist/src/common/ui', () => ({
  Modal: 'Modal',
  Button: 'Button',
  ActivityIndicator: 'ActivityIndicator',
  useToast: () => ({ show: jest.fn() })
}));
jest.mock('../dist/src/app/components/AdvancedTransactionOptions', () => ({
  AdvancedTransactionOptionsModal: 'Advanced'
}));
jest.mock('../dist/src/app/components/FeeInput', () => ({
  __esModule: true,
  default: 'FeeInput'
}));
jest.mock(
  '~/common/hooks/useFirstDefinedValue',
  () => ({ __esModule: true, default: (value: unknown) => value }),
  { virtual: true }
);
jest.mock('../dist/src/app/hooks/useLocalization', () => ({
  useLocalization: () => ({ locale: 'en', currency: 'USD' })
}));
jest.mock('../dist/src/app/hooks/useSettings', () => ({
  useSettings: () => ({ settings: mockSettings })
}));
jest.mock('../dist/src/app/hooks/useWallet', () => ({
  useWallet: () => mockWallet
}));
jest.mock('../dist/src/app/lib/vaults', () => ({
  getVaultMode: () => 'P2A_NON_TRUC'
}));
jest.mock('../dist/src/app/lib/vaultDescriptors', () => ({
  computeOutput: () => ({})
}));
jest.mock('../dist/src/app/lib/network', () => ({
  networkMapping: { TAPE: {} }
}));
jest.mock('../dist/src/app/lib/fees', () => ({
  MIN_FEE_RATE: 0.1,
  pickFeeEstimate: () => ({ feeEstimate: mockWallet.feeEstimates['1'] }),
  computeMaxAllowedFeeRate: () => 2000
}));
jest.mock('../dist/src/app/lib/format', () => ({
  formatBlocks: () => '10 minutes'
}));
jest.mock('../dist/src/app/lib/utxoPolicy', () => ({
  getVaultableUtxos: () => ({
    utxosData: mockWallet.utxosData.filter(
      utxo => !mockWallet.pendingUtxosData.includes(utxo)
    ),
    utxosAvailability: mockWallet.utxosData.map(utxoData =>
      mockWallet.pendingUtxosData.includes(utxoData)
        ? {
            status: 'temporarilyUnavailable',
            reason: 'unconfirmedV3Output',
            utxoData
          }
        : {
            status: 'selectable',
            utxoData
          }
    )
  }),
  withFrozenVaultUtxosForCoinControl: (value: unknown[]) => [
    ...value,
    {
      status: 'temporarilyUnavailable',
      reason: 'frozenVaultOutput',
      remainingBlocks: 10,
      utxoData: { tx: { getId: () => 'frozen' }, vout: 0 }
    }
  ]
}));
jest.mock('../dist/src/app/lib/vaultActionTx', () => ({
  getVaultActionBlocker: jest.fn(() => ({
    reason: null,
    minimumSelectableFeeRate: 0.1
  })),
  getP2ATriggerInfo: () => ({ feeRate: 0.1 }),
  getP2ARescueInfo: () => ({ feeRate: 0.1 }),
  getAdditionalOutputValue: () => 123,
  buildVaultActionDataForFeeRate: (args: {
    selectedFeeRate: number;
    vaultableWalletUtxosData?: unknown[];
    p2aBumpPlan?: { txosData: unknown[] };
  }) => {
    if (args.p2aBumpPlan?.txosData.length === 0 && args.selectedFeeRate > 0.1)
      return null;
    const needsWallet = args.selectedFeeRate > 20;
    if (needsWallet && !args.vaultableWalletUtxosData?.length) return null;
    if (
      args.selectedFeeRate > 100 &&
      (args.vaultableWalletUtxosData?.length ?? 0) < 2
    )
      return null;
    return {
      actionFee: 100,
      actionFeeRate: args.selectedFeeRate,
      walletSupplementUtxosData: needsWallet
        ? args.vaultableWalletUtxosData
        : 'walletSupplementUnneeded'
    };
  }
}));

import PresignedVaultAction, {
  type PresignedVaultActionProps
} from '../dist/src/app/components/vaults/modals/PresignedVaultAction';
import AddReserve from '../dist/src/app/components/vaults/modals/AddReserve';
import { getVaultActionBlocker } from '../dist/src/app/lib/vaultActionTx';
import type { UtxosData } from '../dist/src/app/lib/vaults';
import type { AddressScriptSelection } from '../dist/src/app/components/AddressScriptPicker';
import type { SubUnit } from '../dist/src/app/lib/settings';

const mockTranslate = jest.fn(
  (key: string, _options?: { amount?: string; feeRate?: number }) => key
);
const mockSettings = {
  SUB_UNIT: 'sat' as SubUnit,
  FIAT_MODE: false,
  INITIAL_CONFIRMATION_TIME: 7200
};
const fundingAmountByUnit = {
  btc: '0.00000123\u00A0₿',
  bit: '1.23\u00A0bits',
  sat: '123\u00A0sats',
  mbit: '0.00123\u00A0mBTC'
};
let mockSlots: unknown[];
let mockCursor: number;
function mockState(initial: unknown): [unknown, (value: unknown) => void] {
  const slot = mockCursor++;
  if (!(slot in mockSlots))
    mockSlots[slot] = typeof initial === 'function' ? initial() : initial;
  return [
    mockSlots[slot],
    value => {
      mockSlots[slot] = value;
    }
  ];
}
function mockMemo(compute: () => unknown, deps: unknown[]) {
  const slot = mockCursor++;
  const prior = mockSlots[slot] as
    | { deps: unknown[]; value: unknown }
    | undefined;
  if (!prior || deps.some((dep, i) => !Object.is(dep, prior.deps[i])))
    mockSlots[slot] = { deps, value: compute() };
  return (mockSlots[slot] as { value: unknown }).value;
}
const mockCoin = { tx: { getId: () => 'coin' }, vout: 0 };
const mockWallet = {
  btcFiat: undefined as number | undefined,
  feeEstimates: { '1': 2 },
  utxosData: [mockCoin],
  pendingUtxosData: [] as (typeof mockCoin)[],
  historyData: [],
  vaults: {},
  vaultsStatuses: {},
  accounts: {},
  discoveryReady: true,
  tipStatus: { blockHeight: 1 },
  getPreferredAccount: () => 'account'
};
type Node = {
  type: unknown;
  props: {
    children?: unknown;
    customButtons?: unknown;
    onPress?: unknown;
    onValueChange?: unknown;
    disabled?: unknown;
    onConfirmCoinSelection?: unknown;
    onClearCoinSelection?: unknown;
    onConfirmChangeAddress?: unknown;
    changeAddressSelection?: unknown;
    isVisible?: unknown;
    pickedUtxosData?: unknown;
    onModalHide?: unknown;
    initialValue?: unknown;
    onUseDefaults?: unknown;
    value?: unknown;
  };
};
function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  const node = value as Node;
  return [node, ...nodes(node.props.children)];
}
function find(tree: unknown, type: string, label?: string): Node {
  const node = nodes(tree).find(
    node =>
      node.type === type &&
      (label === undefined ||
        node.props.children === label ||
        (Array.isArray(node.props.children) &&
          node.props.children.includes(label)))
  );
  if (!node) throw new Error(`Missing ${type}: ${label}`);
  return node;
}
let props: PresignedVaultActionProps;
const render = () => {
  mockCursor = 0;
  return PresignedVaultAction(props) as unknown as Node;
};
const press = (node: Node) => (node.props.onPress as () => void)();
const setFee = (tree: Node, fee: number | null) =>
  (
    find(tree, 'FeeInput').props.onValueChange as (
      fee: number | null,
      type: string
    ) => void
  )(fee, 'USER');
const action = (tree: Node) =>
  find(
    tree.props.customButtons,
    'Button',
    'wallet.vault.triggerUnfreezeButton'
  );

beforeEach(() => {
  mockSlots = [];
  mockCursor = 0;
  mockWallet.utxosData = [mockCoin];
  mockWallet.pendingUtxosData = [];
  mockWallet.feeEstimates = { '1': 2 };
  mockWallet.btcFiat = undefined;
  mockSettings.SUB_UNIT = 'sat';
  mockSettings.FIAT_MODE = false;
  jest.clearAllMocks();
  props = {
    role: 'TRIGGER',
    lockBlocks: 1,
    vault: { networkId: 'TAPE' },
    vaultStatus: { triggerTxHex: 'trigger', triggerTxBlockHeight: 1 },
    p2aBumpPlan: { txosData: [{}], hasUnconfirmedUtxos: false },
    initialChildChange: { descriptor: 'change', index: 0 },
    p2aBumpPlanRefreshing: false,
    isVisible: true,
    onClose: jest.fn(),
    onAction: jest.fn()
  } as unknown as PresignedVaultActionProps;
});
function confirmScreen() {
  const intro = render();
  press(
    find(
      intro.props.customButtons,
      'Button',
      props.role === 'TRIGGER' ? 'continueButton' : 'imInDangerButton'
    )
  );
  return render();
}

test('an unfunded recommendation stays selected; a covered fee needs no permission and invalid input stays disabled', () => {
  mockWallet.feeEstimates = { '1': 1000 };
  let tree = confirmScreen();
  expect(find(tree, 'FeeInput').props.initialValue).toBe(1000);
  expect(action(tree).props.disabled).toBe(true);
  expect(find(tree, 'Text', 'coinControl.walletFunds')).toBeDefined();
  setFee(tree, 0.1);
  tree = render();
  expect(action(tree).props.disabled).toBe(false);
  expect(
    nodes(tree).some(node => node.props.children === 'coinControl.walletFunds')
  ).toBe(false);
  setFee(tree, null);
  expect(action(render()).props.disabled).toBe(true);
});

test('wallet funding uses the contextual Add button and keeps the funding action', () => {
  mockWallet.utxosData = [];
  jest
    .mocked(getVaultActionBlocker)
    .mockReturnValueOnce({ reason: null, minimumSelectableFeeRate: null });
  props = {
    ...props,
    p2aBumpPlan: { txosData: [], hasUnconfirmedUtxos: false },
    onWalletFundsMissing: jest.fn()
  };
  let tree = confirmScreen();
  expect(find(tree, 'FeeInput').props.initialValue).toBe(2);
  expect(action(tree).props.disabled).toBe(true);
  setFee(tree, 0.1);
  tree = render();
  expect(action(tree).props.disabled).toBe(false);
  expect(
    nodes(tree).some(
      node => node.props.children === 'wallet.vault.funding.addButton'
    )
  ).toBe(false);
  setFee(tree, 30);
  tree = render();
  expect(find(tree, 'Text', 'wallet.vault.funding.receive')).toBeDefined();
  for (const unit of ['btc', 'bit', 'sat', 'mbit'] as const) {
    mockSettings.SUB_UNIT = unit;
    render();
    expect(mockTranslate).toHaveBeenCalledWith(
      'wallet.vault.triggerUnfreeze.walletFundingHint',
      { amount: fundingAmountByUnit[unit] }
    );
  }
  mockWallet.btcFiat = 100000;
  mockSettings.FIAT_MODE = true;
  tree = render();
  expect(mockTranslate).toHaveBeenCalledWith(
    'wallet.vault.triggerUnfreeze.walletFundingHint',
    { amount: '0.00123\u00A0mBTC\u00A0≈ $0.12' }
  );
  press(find(tree, 'Button', 'wallet.vault.funding.addButton'));
  expect(props.onWalletFundsMissing).toHaveBeenCalledTimes(1);
  expect(props.onAction).not.toHaveBeenCalled();
});

test('parent-only rescue still offers funding to improve its fixed fee', () => {
  delete props.initialChildChange;
  jest
    .mocked(getVaultActionBlocker)
    .mockReturnValueOnce({ reason: null, minimumSelectableFeeRate: null });
  props = {
    ...props,
    role: 'RESCUE',
    p2aBumpPlan: { txosData: [], hasUnconfirmedUtxos: false },
    onReserveFundsMissing: jest.fn()
  } as PresignedVaultActionProps;
  const tree = confirmScreen();
  expect(
    find(tree, 'Button', 'wallet.vault.addReserveFundsButton')
  ).toBeDefined();
  press(find(tree, 'Button', 'wallet.vault.addReserveFundsButton'));
  (tree.props.onModalHide as () => void)();
  expect(find(render(), 'FeeInput')).toBeDefined();
});

test('slider changes reuse readiness calculations', () => {
  let tree = confirmScreen();
  const searches = jest.mocked(getVaultActionBlocker).mock.calls.length;
  for (const fee of [1, 2, 3, 4]) {
    setFee(tree, fee);
    tree = render();
  }
  expect(jest.mocked(getVaultActionBlocker).mock.calls.length).toBe(searches);
});

test('lowering and raising the fee preserves permission and manually selected coins', () => {
  let tree = confirmScreen();
  setFee(tree, 30);
  tree = render();
  const toggle = nodes(tree).find(
    node =>
      node.type === 'Pressable' &&
      nodes(node).some(
        child => child.props.children === 'coinControl.walletFunds'
      )
  );
  if (!toggle) throw new Error('Missing wallet permission');
  press(toggle);
  tree = render();
  (
    find(tree, 'Advanced').props.onConfirmCoinSelection as (
      coins: UtxosData
    ) => void
  )([mockCoin] as unknown as UtxosData);
  tree = render();
  setFee(tree, 2);
  tree = render();
  expect(find(tree, 'Text', 'coinControl.walletFunds')).toBeDefined();
  setFee(tree, 30);
  tree = render();
  expect(find(tree, 'Advanced').props.pickedUtxosData).toEqual([mockCoin]);
  expect(action(tree).props.disabled).toBe(false);
});

test('manual recovery only advises Auto when it works; stale and pending funds stay distinct', () => {
  const otherCoin = { tx: { getId: () => 'other' }, vout: 0 };
  mockWallet.utxosData = [mockCoin, otherCoin];
  props = { ...props, onWalletFundsMissing: jest.fn() };
  let tree = confirmScreen();
  setFee(tree, 30);
  tree = render();
  const toggle = nodes(tree).find(
    node =>
      node.type === 'Pressable' &&
      nodes(node).some(
        child => child.props.children === 'coinControl.walletFunds'
      )
  );
  if (!toggle) throw new Error('Missing wallet permission');
  press(toggle);
  tree = render();
  (
    find(tree, 'Advanced').props.onConfirmCoinSelection as (
      coins: UtxosData
    ) => void
  )([mockCoin] as unknown as UtxosData);
  const change = { address: 'address', descriptor: 'custom/1/*', index: 7 };
  (
    find(tree, 'Advanced').props.onConfirmChangeAddress as (
      value: AddressScriptSelection
    ) => void
  )(change);
  setFee(tree, 150);
  tree = render();
  expect(action(tree).props.disabled).toBe(true);
  expect(
    find(
      tree,
      'Text',
      'wallet.vault.triggerUnfreeze.pickedWalletSupplementUtxosInsufficient'
    )
  ).toBeDefined();
  mockWallet.utxosData = [];
  tree = render();
  expect(action(tree).props.disabled).toBe(true);
  expect(find(tree, 'Text', 'wallet.vault.funding.insufficient')).toBeDefined();
  expect(find(tree, 'Text', 'wallet.vault.funding.receive')).toBeDefined();
  expect(find(tree, 'Button', 'wallet.vault.funding.addButton')).toBeDefined();
  expect(
    nodes(tree).some(
      node =>
        node.props.children ===
        'wallet.vault.triggerUnfreeze.pickedWalletSupplementUtxosInsufficient'
    )
  ).toBe(false);
  mockWallet.pendingUtxosData = [mockCoin];
  mockWallet.utxosData = [mockCoin];
  tree = render();
  expect(find(tree, 'Text', 'wallet.vault.funding.receive')).toBeDefined();
  mockWallet.pendingUtxosData = [mockCoin, otherCoin];
  mockWallet.utxosData = [mockCoin, otherCoin];
  tree = render();
  expect(find(tree, 'Text', 'wallet.vault.funding.wait')).toBeDefined();
  expect(
    nodes(tree).some(
      node => node.props.children === 'wallet.vault.funding.addButton'
    )
  ).toBe(false);
  mockWallet.utxosData = [mockCoin, otherCoin];
  mockWallet.pendingUtxosData = [otherCoin];
  tree = render();
  expect(find(tree, 'Text', 'wallet.vault.funding.wait')).toBeDefined();
  expect(action(tree).props.disabled).toBe(true);
  const advanced = nodes(tree).find(
    node =>
      node.type === 'Pressable' &&
      nodes(node).some(child => child.props.children === 'coinControl.advanced')
  );
  if (!advanced)
    throw new Error('Missing Advanced while coins are insufficient');
  press(advanced);
  tree = render();
  expect(find(tree, 'Advanced').props.isVisible).toBe(true);
  expect(find(tree, 'Advanced').props.changeAddressSelection).toEqual(change);
  expect(typeof find(tree, 'Advanced').props.onConfirmChangeAddress).toBe(
    'function'
  );
  expect(
    nodes(tree).some(
      node =>
        node.type === 'Button' &&
        ['coinControl.chooseCoins', 'coinControl.auto'].includes(
          String(node.props.children)
        )
    )
  ).toBe(false);
  (find(tree, 'Advanced').props.onClearCoinSelection as () => void)();
  tree = render();
  expect(find(tree, 'Advanced').props.pickedUtxosData).toBeNull();
  expect(find(tree, 'Advanced').props.changeAddressSelection).toEqual(change);
});

test('an optional recommendation offers more coins, not a needless deposit', () => {
  mockWallet.feeEstimates = { '1': 150 };
  mockWallet.utxosData = [mockCoin, { tx: { getId: () => 'other' }, vout: 0 }];
  let tree = confirmScreen();
  setFee(tree, 30);
  tree = render();
  const toggle = nodes(tree).find(
    node =>
      node.type === 'Pressable' &&
      nodes(node).some(
        child => child.props.children === 'coinControl.walletFunds'
      )
  );
  if (!toggle) throw new Error('Missing wallet permission');
  press(toggle);
  tree = render();
  (
    find(tree, 'Advanced').props.onConfirmCoinSelection as (
      coins: UtxosData
    ) => void
  )([mockCoin] as unknown as UtxosData);
  tree = render();
  expect(
    find(
      tree,
      'Text',
      'wallet.vault.triggerUnfreeze.pickedWalletSupplementBelowRecommended'
    )
  ).toBeDefined();
  expect(find(tree, 'Text', 'coinControl.advanced')).toBeDefined();
  expect(
    nodes(tree).some(
      node =>
        node.type === 'Button' &&
        node.props.children === 'wallet.vault.funding.addButton'
    )
  ).toBe(false);
  expect(action(tree).props.disabled).toBe(false);
});

test('defaults clear wallet permission and manual selection', () => {
  let tree = confirmScreen();
  setFee(tree, 30);
  tree = render();
  const toggle = nodes(tree).find(
    node =>
      node.type === 'Pressable' &&
      nodes(node).some(
        child => child.props.children === 'coinControl.walletFunds'
      )
  );
  if (!toggle) throw new Error('Missing wallet permission');
  press(toggle);
  tree = render();
  (
    find(tree, 'Advanced').props.onConfirmCoinSelection as (
      coins: UtxosData
    ) => void
  )([mockCoin] as unknown as UtxosData);
  (find(tree, 'Advanced').props.onUseDefaults as () => void)();
  tree = render();
  expect(find(tree, 'Advanced').props.pickedUtxosData).toBeUndefined();
  expect(action(tree).props.disabled).toBe(true);
});

test('definitive close resets the fee and wallet permission', () => {
  let tree = confirmScreen();
  setFee(tree, 30);
  tree = render();
  const toggle = nodes(tree).find(
    node =>
      node.type === 'Pressable' &&
      nodes(node).some(
        child => child.props.children === 'coinControl.walletFunds'
      )
  );
  if (!toggle) throw new Error('Missing wallet permission');
  press(toggle);
  tree = render();
  (tree.props.onModalHide as () => void)();
  tree = confirmScreen();
  expect(find(tree, 'FeeInput').props.initialValue).toBe(2);
  setFee(tree, 30);
  expect(action(render()).props.disabled).toBe(true);
});

test('TRUC funding waits for confirmation instead of showing a deposit request', () => {
  const tree = AddReserve({
    role: 'RESCUE',
    vaultMode: 'P2A_TRUC',
    address: 'address',
    additionalSats: 0,
    targetFeeRate: 150,
    plan: { txosData: [], hasUnconfirmedUtxos: true },
    isRefreshing: false,
    onRefresh: jest.fn(),
    isVisible: true,
    onClose: jest.fn(),
    onModalHide: jest.fn()
  });
  expect(
    find(tree, 'Text', 'wallet.vault.rescue.reserveUnconfirmed')
  ).toBeDefined();
  expect(nodes(tree).some(node => node.type === 'QRCode')).toBe(false);
});

test('rescue retains the exact fee and confirmation step across funding', () => {
  const fund = jest.fn();
  props = {
    ...props,
    role: 'RESCUE',
    onReserveFundsMissing: fund
  } as PresignedVaultActionProps;
  let tree = confirmScreen();
  setFee(tree, 150);
  tree = render();
  press(find(tree, 'Button', 'wallet.vault.addReserveFundsButton'));
  expect(fund).toHaveBeenCalledWith(150);
  (tree.props.onModalHide as () => void)();
  props = { ...props, isVisible: false };
  render();
  props = { ...props, isVisible: true };
  tree = render();
  expect(find(tree, 'FeeInput').props.initialValue).toBe(150);
});

test.each(['loading', 'error'] as const)(
  'rescue funding remains visible during %s',
  plan => {
    const tree = AddReserve({
      role: 'RESCUE',
      vaultMode: 'P2A_NON_TRUC',
      address: undefined,
      additionalSats: undefined,
      targetFeeRate: 150,
      plan,
      isRefreshing: false,
      onRefresh: jest.fn(),
      isVisible: true,
      onClose: jest.fn(),
      onModalHide: jest.fn()
    });
    expect(nodes(tree).some(node => node.type === 'QRCode')).toBe(false);
    expect(
      find(tree, 'Button', 'wallet.vault.addReserve.checkFunds')
    ).toBeDefined();
  }
);

test('rescue funding respects units and keeps its exact QR amount; funded rescue does not ask for another deposit', () => {
  const fundingProps = {
    role: 'RESCUE' as const,
    vaultMode: 'P2A_NON_TRUC' as const,
    address: 'address',
    additionalSats: 0,
    targetFeeRate: 150,
    plan: { txosData: [], hasUnconfirmedUtxos: false },
    isRefreshing: false,
    onRefresh: jest.fn(),
    isVisible: true,
    onClose: jest.fn(),
    onModalHide: jest.fn()
  };
  const tree = AddReserve(fundingProps);
  expect(nodes(tree).some(node => node.type === 'QRCode')).toBe(false);
  expect(find(tree, 'Text', 'wallet.vault.addReserve.funded')).toBeDefined();
  mockWallet.btcFiat = 100000;
  mockSettings.FIAT_MODE = true;
  for (const unit of ['btc', 'bit', 'sat', 'mbit'] as const) {
    mockSettings.SUB_UNIT = unit;
    const tree = AddReserve({ ...fundingProps, additionalSats: 123 });
    expect(mockTranslate).toHaveBeenCalledWith(
      'wallet.vault.addReserve.rescueIntro',
      { amount: `${fundingAmountByUnit[unit]}\u00A0≈ $0.12` }
    );
    expect(find(tree, 'QRCode').props.value).toBe(
      'bitcoin:address?amount=0.00000123'
    );
    expect(mockTranslate).toHaveBeenCalledWith(
      'wallet.vault.addReserve.target',
      { feeRate: 150 }
    );
  }
});
