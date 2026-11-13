// Copyright (C) 2026 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

jest.mock('react', () => ({
  useMemo: jest.fn(compute => compute()),
  useEffect: jest.fn()
}));
jest.mock('@env', () => ({ VERSION: '33' }), { virtual: true });
jest.mock('expo-localization', () => ({ getLocales: () => [] }));
jest.mock('../dist/src/common/hooks/useStorage', () => ({
  useStorage: jest.fn()
}));

import { useEffect } from 'react';
import { useStorage } from '../dist/src/common/hooks/useStorage';
import { useSettings } from '../dist/src/app/hooks/useSettings';
import { defaultSettings, type Settings } from '../dist/src/app/lib/settings';

const legacyEndpoint = 'ssl://blockstream.info:700';
const newEndpoint = 'ssl://bitcoin-mainnet.blockstream.info:50002';
const setSettings = jest.fn(async () => {});
const storageStatus = {
  isSynchd: true,
  isDiskSynchd: true,
  errorCode: false as const
};

const loadSettings = (settings: Settings | undefined) =>
  jest
    .mocked(useStorage)
    .mockReturnValue([
      settings,
      setSettings,
      jest.fn(),
      jest.fn(),
      storageStatus
    ]);

const runEffects = () =>
  jest.mocked(useEffect).mock.calls.forEach(([effect]) => effect());

beforeEach(() => {
  jest.clearAllMocks();
});

test('new installations default to the working Blockstream TLS endpoint', () => {
  expect(defaultSettings.MAINNET_ELECTRUM_API).toBe(newEndpoint);
});

test('migrates the old endpoint before exposing settings and persists it', () => {
  const stored = {
    ...defaultSettings,
    MAINNET_ELECTRUM_API: legacyEndpoint,
    GAP_LIMIT: 42
  };
  loadSettings(stored);

  const result = useSettings();

  expect(result.settings).toEqual({
    ...stored,
    MAINNET_ELECTRUM_API: newEndpoint
  });
  expect(stored.MAINNET_ELECTRUM_API).toBe(legacyEndpoint);
  expect(setSettings).not.toHaveBeenCalled();

  runEffects();
  expect(setSettings).toHaveBeenCalledWith(result.settings);
  expect(result.settingsStorageStatus).toBe(storageStatus);
});

test.each([
  newEndpoint,
  'ssl://electrum.blockstream.info:50002',
  'ssl://my-electrum.example:700'
])('leaves an already updated or custom server untouched: %s', endpoint => {
  const stored = { ...defaultSettings, MAINNET_ELECTRUM_API: endpoint };
  loadSettings(stored);

  expect(useSettings().settings).toBe(stored);
  runEffects();

  expect(setSettings).not.toHaveBeenCalled();
});

test('does not write before settings have loaded', () => {
  loadSettings(undefined);

  expect(useSettings().settings).toBeUndefined();
  runEffects();

  expect(setSettings).not.toHaveBeenCalled();
});

test('does not repeatedly retry migration after a storage write error', () => {
  jest
    .mocked(useStorage)
    .mockReturnValue([
      { ...defaultSettings, MAINNET_ELECTRUM_API: legacyEndpoint },
      setSettings,
      jest.fn(),
      jest.fn(),
      { ...storageStatus, errorCode: 'WriteError' }
    ]);

  expect(useSettings().settings?.MAINNET_ELECTRUM_API).toBe(newEndpoint);
  runEffects();

  expect(setSettings).not.toHaveBeenCalled();
});
