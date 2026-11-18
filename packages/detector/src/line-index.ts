export interface Position {
  /** 1-based line. */
  readonly line: number;
  /** 1-based column. */
  readonly column: number;
}

/** Returns the 0-based offset at which every line starts. `result[0]` is always 0. */
export function buildLineIndex(content: string): number[] {
  const starts = [0];
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10 /* \n */) {
      starts.push(i + 1);
    }
  }
  return starts;
}

/**
 * Converts an offset into a line/column pair with a binary search over line starts:
 * O(log n) per lookup instead of counting newlines from the beginning every time.
 */
export function locate(lineStarts: readonly number[], offset: number): Position {
  let low = 0;
  let high = lineStarts.length - 1;
  // Invariant: lineStarts[low] <= offset. We look for the last such index.
  while (low < high) {
    const mid = (low + high + 1) >>> 1;
    if ((lineStarts[mid] ?? Number.POSITIVE_INFINITY) <= offset) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return { line: low + 1, column: offset - (lineStarts[low] ?? 0) + 1 };
}
