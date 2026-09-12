/** FNV-1a de 32 bits en hexadecimal. Determinista y suficiente: la igualdad de
 *  ventanas se re-verifica comparando las claves, asi que una colision no
 *  produce un falso positivo, solo una comparacion extra. */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
