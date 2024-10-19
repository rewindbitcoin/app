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

  return {
    settings,
    setSettings,
    settingsStorageStatus
  };
};
