// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { useEffect, useMemo } from 'react';
import { useStorage } from '../../common/hooks/useStorage';
import { MIN_FEE_RATE } from '../lib/fees';
import {
  defaultSettings,
  SETTINGS_GLOBAL_STORAGE,
  type Settings
} from '../lib/settings';

const LEGACY_MAINNET_ELECTRUM_API = 'ssl://blockstream.info:700';

export const useSettings = () => {
  const [settings, setSettings, , , settingsStorageStatus] =
    useStorage<Settings>(
      SETTINGS_GLOBAL_STORAGE,
      'SERIALIZABLE',
      defaultSettings,
      undefined,
      undefined,
      undefined,
      'GLOBAL'
    );

  // Use `useMemo` to compute `derivedSettings` only when `settings` changes
  const derivedSettings = useMemo(() => {
    if (!settings) return settings;
    // Check if all default properties are present in `settings`
    const isSettingsComplete = Object.keys(defaultSettings).every(
      key => key in settings
    );
    const mergedSettings = isSettingsComplete
      ? settings
      : { ...defaultSettings, ...settings };
    //Soem safeguards
    if (
      mergedSettings.TAPE_FEE_ESTIMATE_OVERRIDE < 0 ||
      (mergedSettings.TAPE_FEE_ESTIMATE_OVERRIDE > 0 &&
        mergedSettings.TAPE_FEE_ESTIMATE_OVERRIDE < MIN_FEE_RATE)
    )
      throw new Error(
        `TAPE_FEE_ESTIMATE_OVERRIDE (${mergedSettings.TAPE_FEE_ESTIMATE_OVERRIDE}) must be 0 or >= MIN_FEE_RATE (${MIN_FEE_RATE})`
      );
    // Replace only the unreachable legacy default, not custom servers.
    return mergedSettings.MAINNET_ELECTRUM_API === LEGACY_MAINNET_ELECTRUM_API
      ? {
          ...mergedSettings,
          MAINNET_ELECTRUM_API: defaultSettings.MAINNET_ELECTRUM_API
        }
      : mergedSettings;
  }, [settings]);

  useEffect(() => {
    if (
      settings?.MAINNET_ELECTRUM_API === LEGACY_MAINNET_ELECTRUM_API &&
      derivedSettings &&
      !settingsStorageStatus.errorCode
    ) {
      setSettings(derivedSettings).catch(error =>
        console.warn('Failed to migrate the mainnet Electrum endpoint', error)
      );
    }
  }, [settings, derivedSettings, setSettings, settingsStorageStatus.errorCode]);

  return {
    settings: derivedSettings,
    setSettings,
    settingsStorageStatus
  };
};
