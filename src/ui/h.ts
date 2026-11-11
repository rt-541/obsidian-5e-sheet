type Child = Node | string | number | null | undefined | false;
export interface Attrs {
  cls?: string; text?: string; title?: string;
  data?: Record<string, string>; attrs?: Record<string, string>;
  on?: { [K in keyof HTMLElementEventMap]?: (e: HTMLElementEventMap[K]) => void };
}

/** Build DOM safely: strings always become text nodes, never HTML. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, a: Attrs = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (a.cls) el.className = a.cls;
  if (a.text !== undefined) el.textContent = a.text;
  if (a.title) el.title = a.title;
  for (const [k, v] of Object.entries(a.data ?? {})) el.dataset[k] = v;
  for (const [k, v] of Object.entries(a.attrs ?? {})) el.setAttribute(k, v);
  for (const [k, f] of Object.entries(a.on ?? {})) el.addEventListener(k, f as EventListener);
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(typeof c === "number" ? String(c) : c);
  return el;
}
export const sgn = (n: number) => (n >= 0 ? "+" : "") + n;
export const clear = (el: HTMLElement) => { while (el.firstChild) el.removeChild(el.firstChild); };
