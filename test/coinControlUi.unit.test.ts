// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

// Isolate native rendering while exercising real picker, footer, and close handlers.
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  memo: (component: unknown) => component,
  useState: (initial: unknown) => mockState(initial),
  useRef: (initial: unknown) => mockState({ current: initial })[0],
  useMemo: (compute: () => unknown) => compute(),
  useCallback: (callback: unknown) => callback,
  useEffect: () => undefined
}));
jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  Pressable: 'Pressable',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Dimensions: { get: () => ({ height: 800 }) },
  Platform: {
    OS: 'android',
    select: (options: { default: unknown }) => options.default
  }
}));
jest.mock('react-native-css-interop/jsx-runtime', () =>
  jest.requireActual('react/jsx-runtime')
);
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: mockTranslate })
}));
jest.mock('../dist/src/common/ui', () => ({
  Modal: 'Modal',
  Button: 'Button',
  useToast: () => ({ show: jest.fn() })
}));
jest.mock('../dist/src/common/components/Button', () => ({ Button: 'Button' }));
jest.mock('../dist/src/common/theme', () => ({
  useTheme: () => ({ colors: { white: '#ffffff', primary: '#000000' } })
}));
jest.mock('../dist/src/app/components/LabelEditor', () => ({
  __esModule: true,
  default: 'LabelEditor'
}));
jest.mock('../dist/src/app/components/AddressScriptPicker', () => ({
  AddressScriptPickerPanel: 'AddressPicker'
}));
jest.mock('../dist/src/app/hooks/useSettings', () => ({
  useSettings: () => ({ settings: { SUB_UNIT: 'sat' } })
}));
jest.mock('../dist/src/app/hooks/useLocalization', () => ({
  useLocalization: () => ({ locale: 'en', currency: 'USD' })
}));
jest.mock('../dist/src/app/hooks/useWallet', () => ({
  useWallet: () => ({ historyData: [] })
}));
jest.mock('../dist/src/app/lib/network', () => ({ networkMapping: {} }));
jest.mock('../dist/src/app/lib/vaultDescriptors', () => ({}));
jest.mock('../dist/src/app/lib/labels', () => ({
  getWalletLabelText: () => ''
}));
jest.mock('../dist/src/app/lib/addressNoteLabels', () => ({
  getOutputAddressNoteText: () => ''
}));
jest.mock('../dist/src/app/lib/format', () => ({
  getShortOutpoint: () => 'outpoint'
}));
jest.mock('../dist/src/app/lib/vaults', () => ({
  utxosDataBalance: (
    coins: Array<{ tx: { outs: Array<{ value: bigint }> }; vout: number }>
  ) =>
    coins.reduce((sum, coin) => sum + Number(coin.tx.outs[coin.vout]?.value), 0)
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('react-native-modal', () => ({
  __esModule: true,
  default: 'NativeModal'
}));
jest.mock('@expo/vector-icons', () => ({}));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: 'Gradient' }));
jest.mock('expo-font', () => ({ useFonts: () => [true] }));
jest.mock('@expo-google-fonts/ubuntu', () => ({}));
jest.mock('polished', () => ({ rgba: () => '' }));
jest.mock('react-native-extra-dimensions-android', () => ({
  getRealWindowHeight: () => 800
}));
jest.mock('react-native-gesture-handler', () => ({
  Gesture: { Pan: () => mockPan },
  GestureDetector: 'GestureDetector',
  GestureHandlerRootView: 'GestureHandlerRootView',
  ScrollView: 'ScrollView'
}));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: {
    View: 'AnimatedView',
    createAnimatedComponent: (component: unknown) => component
  },
  useSharedValue: (initial: unknown) => mockState({ value: initial })[0],
  useAnimatedStyle: (compute: () => unknown) => compute(),
  runOnJS: (callback: unknown) => callback,
  withSpring: (value: unknown) => mockSpring(value),
  withTiming: (value: unknown) => value
}));

import {
  AdvancedTransactionOptionsModal,
  AdvancedTransactionOptionsPanel
} from '../dist/src/app/components/AdvancedTransactionOptions';
import { CoinControlPanel } from '../dist/src/app/components/CoinControl';
import { Modal } from '../dist/src/common/components/Modal';
import type { UtxosData } from '../dist/src/app/lib/vaults';
import type { UtxoAvailability } from '../dist/src/app/lib/utxoPolicy';

type Node = {
  type: unknown;
  props: Record<string, unknown> & {
    children?: unknown;
    customButtons?: unknown;
    disabled?: unknown;
    closeOnBackButton?: unknown;
    pickedUtxosData?: unknown;
    onBackButtonPress?: unknown;
  };
};
let mockSlots: unknown[], mockCursor: number;
function mockState(initial: unknown): [unknown, (value: unknown) => void] {
  const index = mockCursor++;
  if (!(index in mockSlots))
    mockSlots[index] = typeof initial === 'function' ? initial() : initial;
  return [
    mockSlots[index],
    value => {
      mockSlots[index] =
        typeof value === 'function' ? value(mockSlots[index]) : value;
    }
  ];
}
const mockTranslate = jest.fn(
  (key: string, options?: { selectedCount?: number; count?: number }) =>
    key === 'coinControl.useSelectedCount'
      ? `${key} (${options?.selectedCount})`
      : key
);
const mockSpring = jest.fn(value => value);
const mockPan = {
  enabled: () => mockPan,
  minDistance: () => mockPan,
  onStart: () => mockPan,
  onUpdate: (callback: (event: { translationY: number }) => void) => {
    mockPanUpdate = callback;
    return mockPan;
  },
  onEnd: (callback: (_event: unknown, success: boolean) => void) => {
    mockPanEnd = callback;
    return mockPan;
  },
  onFinalize: () => mockPan
};
let mockPanEnd: (_event: unknown, success: boolean) => void;
let mockPanUpdate: (event: { translationY: number }) => void;
const coins = Array.from({ length: 40 }, (_, index) => ({
  tx: { getId: () => `coin-${index}`, outs: [{ value: BigInt(1000 + index) }] },
  vout: 0
})) as unknown as UtxosData;
let props: {
  isVisible: boolean;
  entryScreen: 'coinSelection';
  btcFiat: undefined;
  utxosAvailability: UtxoAvailability[];
  pickedUtxosData: UtxosData | null;
  onConfirmCoinSelection: jest.Mock;
  onClose: jest.Mock;
};
const nodes = (value: unknown): Node[] => {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  const node = value as Node;
  return [node, ...nodes(node.props.children)];
};
const find = (tree: unknown, type: unknown, label?: string): Node => {
  const node = nodes(tree).find(
    node =>
      node.type === type &&
      (label === undefined || node.props.children === label)
  );
  if (!node) throw new Error(`Missing node: ${String(type)} ${label}`);
  return node;
};
const call = (node: Node, handler: string, ...args: unknown[]) =>
  (node.props[handler] as (...args: unknown[]) => unknown)(...args);
const component = (type: unknown, properties: unknown): Node =>
  (type as (properties: unknown) => Node)(properties);
const render = () => {
  mockCursor = 0;
  return component(AdvancedTransactionOptionsModal, props);
};
const rows = (tree: Node) =>
  component(CoinControlPanel, find(tree, CoinControlPanel).props);
const toggle = (tree: Node, index: number) =>
  call(
    nodes(rows(tree)).filter(node => node.type === 'Pressable')[index] as Node,
    'onPress'
  );
const apply = (tree: Node, count: number) =>
  find(
    tree.props.customButtons,
    'Button',
    `coinControl.useSelectedCount (${count})`
  );

beforeEach(() => {
  mockSlots = [];
  mockCursor = 0;
  jest.clearAllMocks();
  props = {
    isVisible: true,
    entryScreen: 'coinSelection',
    btcFiat: undefined,
    utxosAvailability: coins.map(utxoData => ({
      status: 'selectable',
      utxoData
    })),
    pickedUtxosData: null,
    onConfirmCoinSelection: jest.fn(),
    onClose: jest.fn()
  };
});

test('a long coin list leaves count, total, Cancel, and Apply in the modal footer; only Apply commits', () => {
  let tree = render();
  expect(apply(tree, 0).props.disabled).toBe(true);
  expect(
    nodes(rows(tree)).filter(node => node.type === 'Pressable')
  ).toHaveLength(40);
  expect(
    nodes(tree.props.children).some(
      node => node.props.children === 'coinControl.backToAdvancedOptions'
    )
  ).toBe(false);
  expect(
    nodes(rows(tree)).some(node =>
      String(node.props.children).includes('coinControl.useSelectedCount')
    )
  ).toBe(false);
  toggle(tree, 0);
  tree = render();
  toggle(tree, 1);
  tree = render();
  expect(apply(tree, 2).props.disabled).toBe(false);
  expect(mockTranslate).toHaveBeenCalledWith('coinControl.selectedCoins', {
    count: 2
  });
  expect(
    nodes(tree.props.customButtons).some(
      node =>
        Array.isArray(node.props.children) &&
        node.props.children.includes('2,001\u00A0sats')
    )
  ).toBe(true);
  expect(props.onConfirmCoinSelection).not.toHaveBeenCalled();
  call(apply(tree, 2), 'onPress');
  expect(props.onConfirmCoinSelection).toHaveBeenCalledWith([
    coins[0],
    coins[1]
  ]);
  expect(props.onClose).toHaveBeenCalledTimes(1);
});

test('unchanged selection exits directly; closing a draft asks before discarding and allows continued editing', () => {
  props.pickedUtxosData = [coins[0]] as UtxosData;
  let tree = render();
  expect(call(tree, 'onClose')).toBe(true);
  expect(props.onClose).toHaveBeenCalledTimes(1);
  props.onClose.mockClear();
  toggle(tree, 1);
  tree = render();
  expect(tree.props.closeOnBackButton).toBe(true);
  expect(call(tree, 'onClose')).toBe(false);
  tree = render();
  expect(
    find(
      tree.props.customButtons,
      'Text',
      'coinControl.discardSelectionChanges'
    )
  ).toBeDefined();
  expect(props.onClose).not.toHaveBeenCalled();
  call(
    find(tree.props.customButtons, 'Button', 'coinControl.keepEditing'),
    'onPress'
  );
  tree = render();
  expect(apply(tree, 2)).toBeDefined();
  expect(call(tree, 'onClose')).toBe(false);
  tree = render();
  // Back while the confirmation is visible cancels that confirmation, not the draft.
  expect(call(tree, 'onClose')).toBe(false);
  tree = render();
  expect(apply(tree, 2)).toBeDefined();
  call(tree, 'onClose');
  tree = render();
  call(
    find(tree.props.customButtons, 'Button', 'coinControl.discardChanges'),
    'onPress'
  );
  expect(props.onClose).toHaveBeenCalledTimes(1);
  expect(props.onConfirmCoinSelection).not.toHaveBeenCalled();
});

test('Cancel restores the previous selection on reentry and unavailable coins cannot be applied', () => {
  props.pickedUtxosData = [coins[0]] as UtxosData;
  let tree = render();
  toggle(tree, 1);
  tree = render();
  call(find(tree.props.customButtons, 'Button', 'cancelButton'), 'onPress');
  tree = render();
  const overview = component(
    AdvancedTransactionOptionsPanel,
    find(tree, AdvancedTransactionOptionsPanel).props
  );
  call(find(overview, 'Button', 'coinControl.chooseCoins'), 'onPress');
  tree = render();
  expect(apply(tree, 1)).toBeDefined();
  expect(find(tree, CoinControlPanel).props.pickedUtxosData).toEqual([
    coins[0]
  ]);
  props.utxosAvailability = props.utxosAvailability.map(row => ({
    status: 'temporarilyUnavailable',
    reason: 'unconfirmedV3Output',
    utxoData: row.utxoData
  }));
  tree = render();
  expect(apply(tree, 0).props.disabled).toBe(true);
  expect(
    nodes(rows(tree))
      .filter(node => node.type === 'Pressable')
      .every(node => node.props.disabled === true)
  ).toBe(true);
  expect(props.onConfirmCoinSelection).not.toHaveBeenCalled();
});

test('the modal routes Android back and drag through the veto and restores a canceled drag', () => {
  const close = jest.fn(() => false);
  const tree = component(Modal, {
    title: 'Picker',
    isVisible: true,
    closeOnBackButton: true,
    onClose: close,
    children: null
  });
  expect(tree.type).toBe('NativeModal');
  call(tree, 'onBackButtonPress');
  mockPanUpdate({ translationY: 150 });
  mockPanEnd(undefined, true);
  expect(close).toHaveBeenCalledTimes(2);
  expect(mockSpring).toHaveBeenCalledWith(0);
  // Other modals do not gain Android back dismissal unless explicitly enabled.
  mockSlots = [];
  mockCursor = 0;
  const ordinary = component(Modal, {
    title: 'Other',
    isVisible: true,
    onClose: jest.fn(),
    children: null
  });
  expect(ordinary.props.onBackButtonPress).toBeUndefined();
});
