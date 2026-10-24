/** Disjoint sets over 0..n-1 (path compression), each set knowing whether it is grounded. */
export function unionFind(n: number, grounded: (i: number) => boolean = () => false) {
  const parent = Array.from({ length: n }, (_, i) => i)
  const ground = Array.from({ length: n }, (_, i) => grounded(i))
  const find = (i: number): number => {
    let root = i
    while (parent[root] !== root) root = parent[root] ?? root
    for (let j = i; parent[j] !== root;) {
      const next = parent[j] ?? root
      parent[j] = root
      j = next
    }
    return root
  }
  return {
    find,
    isGrounded: (i: number) => ground[find(i)] ?? false,
    union: (a: number, b: number) => {
      const [ra, rb] = [find(a), find(b)]
      if (ra === rb) return
      parent[ra] = rb
      ground[rb] = (ground[rb] ?? false) || (ground[ra] ?? false)
    },
  }
}
