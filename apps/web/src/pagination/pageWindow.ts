/** Return a sliding window of page numbers (1-based), at most `max` entries. */
export function pageWindow(current: number, totalPages: number, max = 10): number[] {
  if (totalPages <= 0) {
    return [];
  }
  if (totalPages <= max) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const half = Math.floor(max / 2);
  let start = Math.max(1, current - half);
  let end = start + max - 1;
  if (end > totalPages) {
    end = totalPages;
    start = Math.max(1, end - max + 1);
  }
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}
