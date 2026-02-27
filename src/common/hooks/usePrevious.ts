// Copyright (C) 2025 Jose-Luis Landabaso - https://rewindbitcoin.com
// Licensed under the GNU GPL v3 or later. See the LICENSE file for details.

import { useRef, useEffect } from 'react';

export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>(undefined);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  // Safe: this hook's contract is to expose the previous committed value from
  // a ref updated in effect, without adding extra state renders.
  // eslint-disable-next-line react-hooks/refs
  return ref.current;
}
