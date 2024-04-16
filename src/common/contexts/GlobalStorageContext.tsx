//See docs in "useStorage.ts"

import React, { useState, createContext, ReactNode } from 'react';
import { StorageErrorCode } from '../lib/storage';

type StorageState<T> = Record<string, T>;
type ProviderValue<T> = {
  valueMap: StorageState<T>;
  setValueMap: React.Dispatch<React.SetStateAction<StorageState<T>>>;
  errorCodeMap: Record<string, StorageErrorCode>;
  setErrorCodeMap: React.Dispatch<
    React.SetStateAction<Record<string, StorageErrorCode>>
  >;
};
export const GlobalStorageContext =
  createContext<ProviderValue<unknown> | null>(null);

export const GlobalStorageProvider: React.FC<{ children: ReactNode }> = ({
  children
}) => {
  const [valueMap, setValueMap] = useState<StorageState<unknown>>({});
  const [errorCodeMap, setErrorCodeMap] = useState<
    Record<string, StorageErrorCode>
  >({});

  return (
    <GlobalStorageContext.Provider
      value={{ valueMap, setValueMap, errorCodeMap, setErrorCodeMap }}
    >
      {children}
    </GlobalStorageContext.Provider>
  );
};
