export const fromBlocks = (
  blocks: number,
  min: number,
  max: number,
  mode: 'days' | 'blocks'
) => {
  if (mode === 'blocks') return blocks;
  const minDays = Math.ceil(min / (6 * 24));
  const maxDays = Math.floor(max / (6 * 24));
  const days = Math.round(blocks / (6 * 24));
  return Math.min(maxDays, Math.max(minDays, days));
};
export const toBlocks = (value: number, fromMode: 'days' | 'blocks') => {
  if (fromMode === 'blocks') return value;
  return value * 6 * 24;
};
