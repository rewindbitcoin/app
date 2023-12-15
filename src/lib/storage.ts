//TODO:
//Use this for web: https://github.com/jakearchibald/idb-keyval
//Use this for react-native: https://github.com/ammarahm-ed/react-native-mmkv-storage
//  -> Using async (non-blocking) ?
//Is the SettingsContext well implemented? When I use the hook useSettings
//I believe this one is not re-rendered when the context changes, right?
import { MMKVLoader } from 'react-native-mmkv-storage';
export const storage = new MMKVLoader().initialize();

import { useEffect, useState } from 'react';

/**
 * Usage of `useLocalStateStorage`:
 *
 * This hook is designed for managing local storage state within a specific component,
 * independent of other components. It differs from `useGlobalStateStorage`
 * in that it does not share state across the application. Each invocation
 * of `useLocalStateStorage` maintains its own state, making it ideal for
 * component-specific data that does not need global synchronization.
 * See long explanation at the end of this file.
 *
 * Example:
 * const [value, setValue, isSynchd] = useLocalStateStorage<DataType>('uniqueKey');
 * - 'DataType' is a TypeScript type or interface representing your data structure.
 * - 'uniqueKey' is a unique identifier for your data in storage.
 *
 * 'value': Represents the current state associated with 'uniqueKey'. It starts
 * as 'undefined' and is updated after fetching from storage. Changes to 'value'
 * in one component do not affect others using the same key.
 *
 * 'setValue': An async function to update the value in storage and in the
 * local state of the component. Use it when you need to store new data and
 * ensure it's saved before proceeding with other actions.
 *
 * 'isSynchd': A boolean indicating if the data has been fetched from storage.
 * Useful for determining if 'value' is 'undefined' because it's yet to be
 * fetched or because it was never set in storage.
 *
 * Note: Unlike `useGlobalStateStorage`, `useLocalStateStorage` does not cause
 * re-renders in other components using the same key. It's useful for data
 * like form inputs or component-specific settings. For shared global state,
 * refer to `useGlobalStateStorage`. More information on the differences between
 * these hooks can be found in the documentation in str/lib/storage.
 */

export const useLocalStateStorage = <T>(
  key: string
): [T | undefined, (newValue: T) => Promise<void>, boolean] => {
  const [value, setValue] = useState<T | undefined>();
  const [isSynchd, setIsSynchd] = useState(false);

  useEffect(() => {
    const fetchValue = async () => {
      const savedValue = await storage.getStringAsync(key);
      let parsedValue: T | undefined;

      if (typeof savedValue === 'string') {
        try {
          parsedValue = JSON.parse(savedValue);
        } catch (error) {
          parsedValue = savedValue as T;
        }
      } else
        throw new Error(
          `non-string types not contemplated in useStorage: ${savedValue}`
        );
      setValue(parsedValue);
      setIsSynchd(true);
    };
    fetchValue();
  }, [key]);

  const setNewValue = async (newValue: T) => {
    await storage.setStringAsync(
      key,
      typeof newValue === 'string' ? newValue : JSON.stringify(newValue)
    );
    setValue(newValue);
  };

  return [value, setNewValue, isSynchd];
};

/**
 * Differences and Recommendations for useGlobalStateStorage vs useLocalStateStorage:
 *
 * Similarities:
 * - Both synchronize state with persistent storage.
 * - Same interface: [value, setValue, isSynchd].
 * - Handle fetching and updating data in storage.
 * - Asynchronous setValue function.
 *
 * Differences:
 * - State Scope:
 *   - useGlobalStateStorage: Manages global state across components.
 *   - useLocalStateStorage: Manages state specific to each component.
 * - Re-rendering Behavior:
 *   - useGlobalStateStorage: Can cause more re-renders across components.
 *   - useLocalStateStorage: Restricts re-renders to the owning component.
 * - Use Cases:
 *   - useGlobalStateStorage: Ideal for global data like settings.
 *   - useLocalStateStorage: Suitable for component-specific data.
 *
 * Choosing Between Hooks:
 * - Use useGlobalStateStorage for:
 *   - Shared state like app settings. Example: If one module updates a setting,
 *     it immediately propagates to all modules using useGlobalStateStorage.
 *   - Global data that changes infrequently to minimize re-renders.
 * - Use useLocalStateStorage for:
 *   - State specific to a component or domain that doesn't affect others.
 *   - Example: Vault speciffic information. This avoids unnecessary re-renders
 *     in other parts of the app.
 *   - Note: Other components using useLocalStateStorage with the same key
 *     won't be notified of changes. This is important to take into account.
 *
 * Consequences:
 * - useGlobalStateStorage with frequently changing data can cause performance issues.
 * - useLocalStateStorage for global data might lead to inconsistencies.
 *
 * Summary:
 * Choose based on data scope, re-rendering impact, and whether components need to
 * be aware of each other's state changes. This enhances app performance and consistency.
 */
