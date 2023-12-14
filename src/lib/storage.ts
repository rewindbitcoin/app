//TODO:
//Use this for web: https://github.com/jakearchibald/idb-keyval
//Use this for react-native: https://github.com/ammarahm-ed/react-native-mmkv-storage
//  -> Using async (non-blocking) ?
//Is the SettingsContext well implemented? When I use the hook useSettings
//I believe this one is not re-rendered when the context changes, right?
import { MMKVLoader } from 'react-native-mmkv-storage';
export const storage = new MMKVLoader().initialize();
