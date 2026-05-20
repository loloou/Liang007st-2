export type RatioCheckResult = {
  actualRatio: string
  expectedRatio: string
  diff: number
  mismatch: boolean
}

function gcd(a: number, b: number): number {
  const x = Math.abs(Math.trunc(a))
  const y = Math.abs(Math.trunc(b))
  if (y === 0) return x || 1
  return gcd(y, x % y)
}

function formatRatio(width: number, height: number): string {
  if (width <= 0 || height <= 0) return `${width}:${height}`
  const g = gcd(width, height)
  return `${Math.round(width / g)}:${Math.round(height / g)}`
}

export function checkImageRatio(
  actualWidth: number,
  actualHeight: number,
  expectedWidth: number,
  expectedHeight: number,
  threshold = 0.05,
): RatioCheckResult {
  const actualRatioVal = actualWidth / actualHeight
  const expectedRatioVal = expectedWidth / expectedHeight
  const diff = Math.abs(actualRatioVal - expectedRatioVal) / expectedRatioVal

  return {
    actualRatio: formatRatio(actualWidth, actualHeight),
    expectedRatio: formatRatio(expectedWidth, expectedHeight),
    diff,
    mismatch: diff > threshold,
  }
}
