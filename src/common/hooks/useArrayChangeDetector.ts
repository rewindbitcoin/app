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

  if (changeDetectedRef.current) return true;
  else {
    const hasChange = !shallowEqualArrays(initialValuesRef.current, values);
    if (hasChange) changeDetectedRef.current = hasChange;
    return hasChange;
  }
}
