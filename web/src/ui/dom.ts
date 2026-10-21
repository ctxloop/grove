/** Creates an element with a class and optional text (textContent, never HTML). */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Keeps pointer input on an overlay control away from the canvas, so it never selects a tree. */
export function isolatePointer(node: HTMLElement): void {
  for (const type of ['click', 'mousedown', 'pointerdown']) {
    node.addEventListener(type, (e) => e.stopPropagation());
  }
}
