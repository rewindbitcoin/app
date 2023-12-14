//TODO:
//Use this for web: https://github.com/jakearchibald/idb-keyval
//Use this for react-native: https://github.com/ammarahm-ed/react-native-mmkv-storage
//  -> Using async (non-blocking) ?
//Is the SettingsContext well implemented? When I use the hook useSettings
//I believe this one is not re-rendered when the context changes, right?
import { MMKV } from 'react-native-mmkv';
export const storage = new MMKV({
  id: 'thunderden' //,
  //encryptionKey: 'thunderden' don't use encryption since it does not work on web - use 3rd party
});
