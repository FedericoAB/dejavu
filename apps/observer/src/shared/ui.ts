export function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string) {
  const node = document.createElement(tag)
  if (text) node.textContent = text
  if (className) node.className = className
  return node
}
export function button(label: string, action: () => void, secondary = false) {
  const node = element('button', label, secondary ? 'secondary' : '')
  node.type = 'button'
  node.onclick = action
  return node
}
export function card(...nodes: Node[]) { const node = element('section', undefined, 'card'); node.append(...nodes); return node }
export function input(label: string, type = 'text') {
  const node = element('input'); node.type = type; node.autocomplete = 'off'
  const wrapper = element('label', label); wrapper.append(node)
  return { wrapper, node }
}
