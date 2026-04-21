// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { useMemo } from 'react';
import { useStorage } from '../../common/hooks/useStorage';
import { MIN_FEE_RATE } from '../lib/fees';
import {
  defaultSettings,
  SETTINGS_GLOBAL_STORAGE,
  type Settings
} from '../lib/settings';
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
    if (mergedSettings.PRESIGNED_TRIGGER_FEERATE < MIN_FEE_RATE)
      throw new Error(
        `PRESIGNED_TRIGGER_FEERATE (${mergedSettings.PRESIGNED_TRIGGER_FEERATE}) must be >= MIN_FEE_RATE (${MIN_FEE_RATE})`
      );
    if (mergedSettings.MAX_TRIGGER_FEERATE < MIN_FEE_RATE)
      throw new Error(
        `MAX_TRIGGER_FEERATE (${mergedSettings.MAX_TRIGGER_FEERATE}) must be >= MIN_FEE_RATE (${MIN_FEE_RATE})`
      );
    if (mergedSettings.PRESIGNED_RESCUE_FEERATE < MIN_FEE_RATE)
      throw new Error(
        `PRESIGNED_RESCUE_FEERATE (${mergedSettings.PRESIGNED_RESCUE_FEERATE}) must be >= MIN_FEE_RATE (${MIN_FEE_RATE})`
      );
    // Return `settings` if complete, otherwise merge with `defaultSettings`
    return mergedSettings;
  }, [settings]);

  return {
    settings: derivedSettings,
    setSettings,
    settingsStorageStatus
  };
};
