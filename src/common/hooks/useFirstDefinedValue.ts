// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { useRef } from 'react';

/**
 * A custom hook that returns the first defined (non-undefined) value observed
 * for the given input. This hook is ideal for stabilizing fluctuating values, such
 * as API responses or network data, which prevents UI elements like sliders from
 * flickering by providing a stable reference value.
 *
 * It initializes with `undefined` and updates its stored value only once, when
 * the input value transitions from `undefined` to a defined state. Subsequent
 * changes to the input do not affect the stored value unless `resetKey`
 * changes, ensuring consistency throughout each cache-key lifecycle.
 *
 * @param {T | undefined} value - The input value to monitor and cache if it is
 * the first non-undefined value.
 * @param resetKey - Optional key that clears the cached value when it changes.
 * @returns {T | undefined} - The first defined value encountered, or undefined
 * if no defined value has been observed.
 *
 * @example
 * const btcFiat = useFirstDefinedValue<number | undefined>(btcFiatRealTime);
 * const feeEstimates = useFirstDefinedValue<FeeEstimates | undefined>(
 * feeEstimatesRealTime);
 */
export default function useFirstDefinedValue<T>(
  value: T | undefined,
  resetKey?: unknown
): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  const resetKeyRef = useRef<unknown>(resetKey);
  // eslint-disable-next-line react-hooks/refs
  if (!Object.is(resetKeyRef.current, resetKey)) {
    // Safe: explicit reset requested by the caller's cache key.
    // eslint-disable-next-line react-hooks/refs
    ref.current = undefined;
    // eslint-disable-next-line react-hooks/refs
    resetKeyRef.current = resetKey;
  }
  // Safe: this hook intentionally latches the first defined value once and
  // keeps it stable to avoid UI flicker and state-triggered retriggers.
  // eslint-disable-next-line react-hooks/refs
  if (ref.current === undefined && value !== undefined) {
    // Safe: one-time write from undefined -> defined.
    // eslint-disable-next-line react-hooks/refs
    ref.current = value;
  }
  // Safe: return the latched value without introducing extra state updates.
  // eslint-disable-next-line react-hooks/refs
  return ref.current;
}
