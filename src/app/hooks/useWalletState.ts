// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { useState, useCallback } from 'react';
export function useWalletState<T>(): [
  Record<number, T | undefined>,
  (walletId: number, newWalletIdState: T | undefined) => void,
  (walletId: number) => void
] {
  const [walletsState, setWalletsState] = useState<
    Record<number, T | undefined>
  >({});
  const setStateByWalletId = useCallback(
    (walletId: number, newWalletIdState: T | undefined) => {
      // Update the global state only if the new state for this specific walletId
      // is different from the previous one. We perform a check for immutability
      // at the walletId level, similar to how useState treats its updates.
      // Additionally, we avoid updating if the states are both Uint8Array and equivalent,
      // ensuring unnecessary re-renders are minimized and performance is optimized.
      setWalletsState(prevWalletsState => {
        const prevWalletIdState = prevWalletsState[walletId];
        if (prevWalletIdState === newWalletIdState) return prevWalletsState;

        // Deep comparison if both states are Uint8Array
        if (
          prevWalletIdState instanceof Uint8Array &&
          newWalletIdState instanceof Uint8Array
        ) {
          if (
            prevWalletIdState.length === newWalletIdState.length &&
            prevWalletIdState.every(
              (value, index) => value === newWalletIdState[index]
            )
          )
            return prevWalletsState;
        }

        return { ...prevWalletsState, [walletId]: newWalletIdState };
      });
    },
    []
  );
  const clearStateByWalletId = useCallback((walletId: number) => {
    setWalletsState(prevWalletsState => {
      if (walletId in prevWalletsState) {
        const { [walletId]: omitted, ...newWalletsState } = prevWalletsState;
        void omitted;
        return newWalletsState;
      } else return prevWalletsState;
    });
  }, []);
  return [walletsState, setStateByWalletId, clearStateByWalletId];
}
