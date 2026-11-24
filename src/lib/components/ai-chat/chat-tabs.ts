/**
 * Which tab gets focus once `closedKey` is closed: the current one if it is
 * not the one closing, else the right neighbour, else the left. Undefined
 * means no tab is left.
 */
export function nextActiveAfterClose(
  keys: string[],
  activeKey: string,
  closedKey: string,
): string | undefined {
  if (closedKey !== activeKey) {
    return activeKey;
  }

  const index = keys.indexOf(closedKey);

  return keys[index + 1] ?? keys[index - 1];
}
