/**
 * Performs a binary search to find the lowest number for which a given function
 * returns true, within a range [0, MAX]. The search is limited by a maximum
 * number of iterations, and indicates whether the found value is exact or
 * a result of reaching the iteration limit.
 *
 * @param MAX - The upper bound of the search range.
 * @param isTrueFor - A function that takes a number and returns a boolean,
 *                    indicating whether the condition is met.
 * @param maxIterations - The maximum number of iterations for the search.
 * @returns An object containing:
 *           - value: The lowest number for which isTrueFor returns true, or undefined
 *                    if not found within the specified iterations.
 *           - isExact: A boolean indicating whether the returned value is exact or
 *                      if the search stopped due to reaching the max iterations.
 *
 * Constraints and Effective Use Cases:
 * - isTrueFor should behave predictably, ideally returning false below a
 *   certain threshold, and true at or above it.
 * - Effective when the range [0, MAX] is large and the exact threshold value
 *   is unknown but follows the specified pattern.
 * - More efficient than a linear search, especially for large MAX values.
 * - maxIterations allows control over computational resources, useful for
 *   performance-constrained environments.
 * - Not suitable for non-threshold behavior in isTrueFor, as it may not
 *   converge correctly or might return undefined.
 */
export function findLowestTrueBinarySearch(
  MAX: number,
  isTrueFor: (val: number) => boolean,
  maxIterations: number
): { value: number | undefined; isExact: boolean } {
  let start = 0;
  let end = MAX;
  let smallestTrue = -1;
  let iterations = 0;

  while (start <= end) {
    if (++iterations > maxIterations) {
      return {
        value: smallestTrue !== -1 ? smallestTrue : undefined,
        isExact: false
      };
    }

    const mid = Math.floor((start + end) / 2);

    if (isTrueFor(mid)) {
      smallestTrue = mid;
      end = mid - 1;
    } else {
      start = mid + 1;
    }
  }

  return {
    value: smallestTrue !== -1 ? smallestTrue : undefined,
    isExact: true
  };
}
