type Handler = (event: Event) => void;
type Props = Record<string, string | number | boolean | Handler>;

export function elem<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = String(value);
    else if (key === "text") node.textContent = String(value);
    else if (key.startsWith("on") && typeof value === "function")
      node.addEventListener(key.slice(2), value);
    else if (key === "value") (node as HTMLInputElement).value = String(value);
    else if (key === "checked") (node as HTMLInputElement).checked = Boolean(value);
    else if (value !== false) node.setAttribute(key, String(value));
  }
  for (const child of children) node.append(child);
  return node;
}

export function controlRow(label: string, hint: string, control: HTMLElement): HTMLDivElement {
  const text = elem("div", {}, elem("span", { text: label }), elem("small", { text: hint }));
  return elem("div", { class: "setting-row" }, text, control);
}

export function slider(
  value: number,
  min: number,
  max: number,
  step: number,
  label: string,
  onInput: (value: number) => void,
): HTMLInputElement {
  return elem("input", {
    type: "range",
    "aria-label": label,
    min,
    max,
    step,
    value,
    oninput: (e) => onInput(Number((e.target as HTMLInputElement).value)),
  });
}

export function toggle(
  checked: boolean,
  label: string,
  onChange: (checked: boolean) => void,
): HTMLInputElement {
  return elem("input", {
    type: "checkbox",
    "aria-label": label,
    checked,
    onchange: (e) => onChange((e.target as HTMLInputElement).checked),
  });
}

export function select<T extends string>(
  value: T,
  options: readonly (readonly [T, string])[],
  label: string,
  onChange: (value: T) => void,
): HTMLSelectElement {
  return elem(
    "select",
    {
      "aria-label": label,
      onchange: (e) => onChange((e.target as HTMLSelectElement).value as T),
    },
    ...options.map(([v, text]) => elem("option", { value: v, text, selected: v === value })),
  );
}
