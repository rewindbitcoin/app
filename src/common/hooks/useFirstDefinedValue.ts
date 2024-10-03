import { useRef } from 'react';

/**
 * A custom hook that returns the first defined (non-undefined) value observed
 * for the given input. This hook is ideal for stabilizing fluctuating values, such
 * as API responses or network data, which prevents UI elements like sliders from
 * flickering by providing a stable reference value.
 *
 * It initializes with `undefined` and updates its stored value only once, when
 * the input value transitions from `undefined` to a defined state. Subsequent
 * changes to the input do not affect the stored value, ensuring consistency
 * throughout the component's lifecycle.
 *
 * @param {T | undefined} value - The input value to monitor and cache if it is
 * the first non-undefined value.
 * @returns {T | undefined} - The first defined value encountered, or undefined
 * if no defined value has been observed.
 *
 * @example
 * const btcFiat = useFirstDefinedValue<number | undefined>(btcFiatRealTime);
 * const feeEstimates = useFirstDefinedValue<FeeEstimates | undefined>(
 * feeEstimatesRealTime);
 */
export default function useFirstDefinedValue<T>(
  value: T | undefined
): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  if (ref.current === undefined && value !== undefined) {
    ref.current = value;
  }
  return ref.current;
}
