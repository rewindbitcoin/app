// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { useRef } from 'react';
import { shallowEqualArrays } from 'shallow-equal';

/**
 * Detects and flags changes in an array of values compared to its last state
 * using a shallow equality check. Once a change is detected, the hook
 * continues to return `true` permanently for the remainder of the component's
 * lifecycle. Additionally, it provides an immediate detection response before
 * state updates complete, useful for immediate reactions within the same
 * rendering cycle.
 *
 * @param {T[]} values - The array of values to monitor for changes.
 * @returns {boolean} - Returns true immediately if any value in the array has
 * changed since the last render, and continues to return true permanently once
 * a change has been detected.
 */
export default function useArrayChangeDetector<T>(values: T[]): boolean {
  const initialValuesRef = useRef<T[]>(values);
  const changeDetectedRef = useRef<boolean>(false);

  // Safe: this latch is monotonic (false -> true only once per mount), so
  // reading it in render is deterministic and intentionally avoids extra state.
  // eslint-disable-next-line react-hooks/refs
  if (changeDetectedRef.current) return true;
  else {
    // Safe: compare against the initial snapshot synchronously to allow
    // immediate interruption behavior in the same render pass.
    // eslint-disable-next-line react-hooks/refs
    const hasChange = !shallowEqualArrays(initialValuesRef.current, values);
    if (hasChange) {
      // Safe: one-way latch write that prevents flipping back to false.
      // eslint-disable-next-line react-hooks/refs
      changeDetectedRef.current = hasChange;
    }
    return hasChange;
  }
}
