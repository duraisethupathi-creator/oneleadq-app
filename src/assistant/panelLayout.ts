export function assistantPanelLayout(height: number, topInset: number, bottomInset: number, keyboardTop: number | null, dockHeight: number) {
  const top = Math.max(0, topInset) + 12;
  const visibleBottom = keyboardTop === null ? height : Math.max(0, Math.min(height, keyboardTop));
  const gap = keyboardTop === null ? dockHeight + Math.max(0, bottomInset) + 12 : 12;
  const maxHeight = Math.max(0, visibleBottom - top - gap);
  return { top, bottom: Math.max(0, height - visibleBottom) + gap, maxHeight };
}
