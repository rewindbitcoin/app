import { useMemo } from 'react';
import { useStorage } from '../../common/hooks/useStorage';
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
  //FIXME: new defaults:
  //FIXME: old wallets won't inherit them, so what?
  if (settings) settings.PRESIGNED_FEE_RATE_CEILING = 100;
  if (settings) settings.INITIAL_LOCK_BLOCKS = 3 * 24 * 6;
  if (settings) settings.MIN_RECOVERABLE_RATIO = 2 / 3;
  if (settings) settings.SERVICE_FEE_RATE = 0.004; //0.0095;

  // Use `useMemo` to compute `derivedSettings` only when `settings` changes
  const derivedSettings = useMemo(() => {
    if (!settings) return settings;
    // Check if all default properties are present in `settings`
    const isSettingsComplete = Object.keys(defaultSettings).every(
      key => key in settings
    );
    // Return `settings` if complete, otherwise merge with `defaultSettings`
    return isSettingsComplete ? settings : { ...defaultSettings, ...settings };
  }, [settings]);

  return {
    settings: derivedSettings,
    setSettings,
    settingsStorageStatus
  };
};
