import { useEffect, useState, useCallback, useContext, useRef } from 'react';
import { Platform } from 'react-native';
import {
  getAsync,
  setAsync,
  deleteAsync,
  Engine,
  SerializationFormat,
  assertSerializationFormat,
  StorageStatus,
  StorageErrorCode,
  getStorageErrorCode
} from '../lib/storage';
import { batchedUpdates } from '../lib/batchedUpdates';

/**
 * Usage of `useStorage`:
 *
 * When passing, "LOCAL", this hook is designed for managing local storage state
 * within a specific component, independent of other components. It differs from
 * passing "GLOBAL" in that it does not share state across the application.
 * Each invocation of `useStorage` with LOCAL maintains its own state, making it
 * ideal for component-specific data that does not need global synchronization.
 * See long explanation at the end of this file.
 *
 * Example:
 * const [value, setValue, deleteValue, clearCache, storageStatus: {errorCode, isSynchd}] =
 *    useStorage<DataType>('uniqueKey', serializationFormat, defaultValue);
 * - 'DataType' is a TypeScript type or interface representing your data structure.
 * - 'uniqueKey' is a unique identifier for your data in storage. If undefined is
 *   passed, then this hook behaves as a noop
 * - 'serializationFormat' is a parameter that defines the serialization method
 *   for storing the data. It can be one of the following types:
 *   'NUMBER', 'STRING', 'SERIALIZABLE', 'BOOLEAN', 'UINT8ARRAY'.
 *    Use 'SERIALIZABLE' for data types like Array.isArray arrays and objects
 *    that can be serialized using JSON.stringify.
 *    Note that serializationFormat is only used in iOS and Android (which use
 *    mmkv storage engine), while not used on web since it uses IndexedDB, which
 *    natively serializes all values using "structured serialisation".
 *    https://html.spec.whatwg.org/multipage/structured-data.html#structuredserializeinternal
 * - `defaultValue` is an optional argument that will be used as initialValue
 *    IF no value was retrieved from storage at the beginning.
 *
 * 'value': Represents the current state associated with 'uniqueKey'. It starts
 * as 'undefined' and is updated after fetching from storage. Changes to 'value'
 * in one component do not affect others using the same key.
 *
 * 'setValue': An async function to update the value in storage and in the
 * local state of the component. Use it when you need to store new data and
 * ensure it's saved before proceeding with other actions.
 * Similarly to useState, setValue assumes immutability. If you set an object that
 * has been mutated it won't be set. You need to pass a new object.
 *
 * deleteValue deletes the value from storage
 * clearCache forces the next call to read from storage (will not use memory)
 *
 * 'storageStatus: {isSynchd: boolean; errorCode: StorageErrorCode;
 * isDiskSynchd: boolean;}':
 * isSynchd     True once we have **any** value in memory for this key,
 *              either because we fetched it from storage or because we
 *              optimistically queued a write. Useful for hiding loading
 *              skeletons quickly.
 *              isSynchd will be true even after an unsuccessful read/write,
 *              meaning that we at least tried.
 * isDiskSynchd  True only after we have finished at least one real
 *              round‑trip with the backing store: read or write (successful or not).
 *              This is set even if the read/write operation fails.
 *              Lets callers know durability has been confirmed.
 *              errorCode can only be trusted when isDiskSynchd is true.
 * Useful for determining if 'value' is 'undefined' because it's yet to be
 * fetched or because it was never set in storage.
 * 'storageStatus.errorCode indicates whether the cipherKey (if used) could not
 * decrypt the message or if there were errors while using biometrics
 * (user cancelled or device problems)
 *
 * Note: using "LOCAL" does not cause re-renders in other components using the
 * same key. It's useful for data like form inputs or component-specific
 * settings. For shared global state, pass "GLOBAL".
 */

import { GlobalStorageContext } from '../contexts/GlobalStorageContext';

// Module-level global fetching state used in GLOBAL mode
const isGlobalFetching: { [key: string]: boolean } = {};

type StorageState<T> = Record<string, T>;
export const useStorage = <T>(
  /**
   * Keys must and contain only alphanumeric characters, ".", "-", and "_"
   */
  key: string | undefined,
  serializationFormat: SerializationFormat,
  /** defaultValue is used to set an initial value if the storage does not
   * contain already a value. DO NOT confuse this parameter with an initial
   * value.
   */
  defaultValue: T | undefined = undefined,
  engine: Engine | undefined = undefined,
  cipherKey: Uint8Array | undefined = undefined,
  authenticationPrompt: string | undefined = undefined,
  type: 'GLOBAL' | 'LOCAL' = 'LOCAL'
): [
  T | undefined,
  (newValue: T) => Promise<void>,
  () => Promise<void>,
  () => void,
  StorageStatus
] => {
  if (engine === undefined) engine = Platform.OS === 'web' ? 'IDB' : 'MMKV';
  const context = useContext(GlobalStorageContext);
  if (context === null && type === 'GLOBAL')
    throw new Error(
      `useStorage type GLOBAL must be used within a StorageProvider`
    );
  const [localValueMap, setLocalValueMap] = useState<StorageState<unknown>>({});
  const [localErrorCodeMap, setLocalErrorCodeMap] = useState<
    Record<string, StorageErrorCode>
  >({});
  const [localDiskSynchedMap, setLocalDiskSynchedMap] = useState<
    Record<string, boolean>
  >({});

  const valueMap =
    type === 'GLOBAL' && context ? context.valueMap : localValueMap;
  const setValueMap =
    type === 'GLOBAL' && context ? context.setValueMap : setLocalValueMap;
  const errorCodeMap =
    type === 'GLOBAL' && context ? context.errorCodeMap : localErrorCodeMap;
  const setErrorCodeMap =
    type === 'GLOBAL' && context
      ? context.setErrorCodeMap
      : setLocalErrorCodeMap;
  const diskSynchedMap =
    type === 'GLOBAL' && context ? context.diskSynchedMap : localDiskSynchedMap;
  const setDiskSynchedMap =
    type === 'GLOBAL' && context
      ? context.setDiskSynchedMap
      : setLocalDiskSynchedMap;

  /** sets storage and state value */
  const setStorageValue = useCallback(
    async (newValue: T) => {
      if (newValue === undefined) {
        throw new Error(
          'Cannot set undefined value, since undefined is used to mark empty keys'
        );
      }

      if (key !== undefined) {
        let prevForKey: T | undefined;
        //let prevValue: typeof valueMap;
        //let prevError: typeof errorCodeMap;

        // We optimistically update the UI state first to ensure fast feedback and rendering.
        // The actual storage write is awaited *after* state update to avoid blocking UI.
        // If the storage write fails, we revert to the previous state to stay consistent.
        // The same error is re-thrown to allow parent logic to react (e.g. show toast).

        batchedUpdates(() => {
          setValueMap(prevState => {
            prevForKey = prevState[key] as T | undefined;
            //prevValue = prevState;
            return prevState[key] !== newValue
              ? { ...prevState, [key]: newValue }
              : prevState;
          });

          setErrorCodeMap(prevState => {
            //prevError = prevState;
            return prevState[key] !== false
              ? { ...prevState, [key]: false }
              : prevState;
          });
        });

        try {
          await setAsync(
            key,
            assertSerializationFormat(newValue, serializationFormat),
            engine,
            cipherKey,
            authenticationPrompt
          );
          setDiskSynchedMap(prev =>
            prev[key] ? prev : { ...prev, [key]: true }
          );
        } catch (err: unknown) {
          console.warn('setAsync failed on key', key, err);
          // Revert to previous state

          //batchedUpdates(() => {
          //  setValueMap(prevValue);
          //  setErrorCodeMap(prevError);
          //});
          console.warn(`Error setting key ${key}. Reverting changes...`, err);
          const errorCode = getStorageErrorCode(err);
          batchedUpdates(() => {
            // 1. roll back the optimistic value
            //setValueMap(prevValue); -> This can revert other keys too! better use prevForKey!
            setValueMap(prevState => {
              const nextState = { ...prevState };
              if (prevForKey === undefined) delete nextState[key];
              else nextState[key] = prevForKey;
              return nextState;
            });
            // 2. surface the error so UI / callers can react
            setErrorCodeMap(prev =>
              prev[key] !== errorCode ? { ...prev, [key]: errorCode } : prev
            );
            // 3. a valid round trip was done; even if errored
            setDiskSynchedMap(prev =>
              prev[key] ? prev : { ...prev, [key]: true }
            );
          });
          throw err;
        }
      }
    },
    [
      key,
      setValueMap,
      setErrorCodeMap,
      setDiskSynchedMap,
      serializationFormat,
      engine,
      cipherKey,
      authenticationPrompt
    ]
  );

  //Don't re-trigger unnecessary fetches
  const isLocalFetching = useRef<{ [key: string]: boolean }>({});
  const isFetching =
    type === 'GLOBAL' ? isGlobalFetching : isLocalFetching.current;

  //We only need to retrieve the value from the storage intially for each key
  //After having retrieved the initial value, then we will rely on
  //value set by setValue to not spam the storage with more requests that we
  //already know the result
  useEffect(() => {
    //fetch a value only if not ongoing and not done yet (successful or not)
    if (key !== undefined && !isFetching[key] && !diskSynchedMap[key]) {
      const fetchValue = async () => {
        try {
          const savedValue = await getAsync(
            key,
            serializationFormat,
            engine,
            cipherKey,
            authenticationPrompt
          );

          if (savedValue !== undefined) {
            // There was a previous stored value

            batchedUpdates(() => {
              //useState assumes immutability: https://react.dev/reference/react/useState
              setValueMap(prevState =>
                prevState[key] !== savedValue
                  ? { ...prevState, [key]: savedValue }
                  : prevState
              );
              setErrorCodeMap(prevState =>
                prevState[key] !== false
                  ? { ...prevState, [key]: false }
                  : prevState
              );
              setDiskSynchedMap(prev =>
                prev[key] ? prev : { ...prev, [key]: true }
              );
            });
          } else if (defaultValue !== undefined)
            //It was not set and we have a default value, so set it
            //value, errorCode and Persisted is handled in setStorageValue
            //depending on the write operation result
            await setStorageValue(defaultValue);
          else {
            // There was no previous stored value value and no defaultValue was passed:

            batchedUpdates(() => {
              //useState assumes immutability: https://react.dev/reference/react/useState
              setValueMap(prevState =>
                prevState[key] !== undefined ||
                !(
                  //isSynchd can also be marked with state[key] = undefined
                  (key in prevState)
                )
                  ? { ...prevState, [key]: undefined }
                  : prevState
              );
              setErrorCodeMap(prevState =>
                prevState[key] !== false
                  ? { ...prevState, [key]: false }
                  : prevState
              );
              // a valid round trip was done
              setDiskSynchedMap(prev =>
                prev[key] ? prev : { ...prev, [key]: true }
              );
            });
          }
        } catch (err: unknown) {
          console.warn('getAsync failed on key', key, err);
          console.warn(
            'Failed fetch',
            {
              key,
              engine,
              serializationFormat,
              usingCipherKey: !!cipherKey,
              authenticationPrompt
            },
            err
          );
          const errorCode = getStorageErrorCode(err);
          batchedUpdates(() => {
            setErrorCodeMap(prevState =>
              prevState[key] !== errorCode
                ? { ...prevState, [key]: errorCode }
                : prevState
            );
            // a valid round trip was done; even if errored
            setDiskSynchedMap(prev =>
              prev[key] ? prev : { ...prev, [key]: true }
            );
          });
        } finally {
          isFetching[key] = false;
        }
      };

      isFetching[key] = true;
      fetchValue();
    }
  }, [
    isFetching,
    key,
    authenticationPrompt,
    cipherKey,
    defaultValue,
    engine,
    serializationFormat,
    setStorageValue,
    setValueMap,
    setDiskSynchedMap,
    //valueMap,
    diskSynchedMap,
    setErrorCodeMap
  ]);

  /**
   * Call it to force a read from disk (not using valueMap or errorCodeMap)
   */
  const clearCache = useCallback(() => {
    batchedUpdates(() => {
      if (key) {
        setValueMap(prevState => {
          //if (key in prevState) { - Note: It's very important to set a New State
          //                          in any circumstance. Since clearCache is called
          //                          so that a new read from disk is tried. Thus,
          //                          if we would conditionally update state if
          //                          the key was set then, calling clearCache would
          //                          have no effect with 2 consecutive calls to clearCache.
          const { [key]: omitted, ...newState } = prevState;
          void omitted;
          return newState;
          //}
          //return prevState;
        });

        setErrorCodeMap(prevState => {
          const { [key]: omitted, ...newState } = prevState;
          void omitted;
          return newState;
        });

        setDiskSynchedMap(prev => {
          const { [key]: omitted, ...newState } = prev;
          void omitted;
          return newState;
        });
      }
    });
  }, [key, setValueMap, setErrorCodeMap, setDiskSynchedMap]);

  const deleteValue = useCallback(async () => {
    if (key) {
      await deleteAsync(key, engine, authenticationPrompt);
      clearCache();
    }
  }, [key, engine, authenticationPrompt, clearCache]);

  if (key === undefined)
    return [
      undefined,
      setStorageValue,
      deleteValue,
      clearCache,
      { isSynchd: false, errorCode: false, isDiskSynchd: false }
    ];
  else {
    if (key in valueMap && !(key in errorCodeMap))
      throw new Error(`errorCodeMap not set for ${key}`);
    //valueMap is not set when decrypt error, but we know it's synchd anyway
    const isSynchd = key in valueMap || key in errorCodeMap;
    const isDiskSynchd = !!diskSynchedMap[key];

    const errorCode = errorCodeMap[key] || false;
    return [
      valueMap[key] as T | undefined,
      setStorageValue,
      deleteValue,
      clearCache,
      { isSynchd, errorCode, isDiskSynchd }
    ];
  }
};

/**
 * Differences and Recommendations for "LOCAL" vs "GLOBAL":
 *
 * Similarities:
 * - Both synchronize state with persistent storage.
 * - Same interface.
 * - Handle fetching and updating data in storage.
 * - Asynchronous setValue function.
 *
 * Differences:
 * - State Scope:
 *   - GLOBAL: Manages global state across components.
 *   - LOCAL: Manages state specific to each component.
 * - Re-rendering Behavior:
 *   - GLOBAL: Can cause more re-renders across components.
 *   - LOCAL: Restricts re-renders to the owning component.
 * - Use Cases:
 *   - GLOBAL: Ideal for global data like settings.
 *   - LOCAL: Suitable for component-specific data.
 *
 * Choosing Between Hooks:
 * - Use GLOBAL for:
 *   - Shared state like app settings. Example: If one module updates a setting,
 *     it immediately propagates to all modules using useStorage(... "GLOBAL").
 *   - Global data that changes infrequently to minimize re-renders.
 * - Use LOCAL for:
 *   - State specific to a component or domain that doesn't affect others.
 *   - Example: Vault specific information. This avoids unnecessary re-renders
 *     in other parts of the app.
 *   - Note: Other components using useStorage(key, ....,. "LOCAL") with the
 *     same key won't be notified of changes. This is important to take into
 *     account.
 *
 * Consequences:
 * - GLOBAL: with frequently changing data can cause performance issues.
 * - LOCAL useLocalStateStorage for global data might lead to inconsistencies.
 *
 * Summary:
 * Choose based on data scope, re-rendering impact, and whether components need to
 * be aware of each other's state changes. This enhances app performance and consistency.
 */
