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
