import { formatUnits } from 'viem';

/** Token amount for display. Compact enough for a HUD, exact enough to trust. */
export const formatAmount = (value: bigint, decimals: number): string => {
  const text = formatUnits(value, decimals);
  const asNumber = Number(text);
  if (!Number.isFinite(asNumber)) return text;

  return asNumber.toLocaleString(undefined, {
    maximumFractionDigits: asNumber >= 1000 ? 0 : 4,
  });
};

export const formatPercent = (ratio: number, digits = 1): string =>
  `${(ratio * 100).toFixed(digits)}%`;
