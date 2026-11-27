export function restartAnimation(node: HTMLElement | null, animation = ''): void {
  if (!node) return;
  node.style.animation = 'none';
  void node.offsetWidth;
  node.style.animation = animation;
}
