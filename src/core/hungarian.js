// Hungarian algorithm (Kuhn–Munkres).
// Exact maximum-weight assignment in O(n^3). Used wherever a greedy match
// would get stuck in a local optimum.

// ---- Hungarian algorithm (max-weight assignment) ------------
export function hungarianMin(costMatrix) {
  const n = costMatrix.length;
  const m = n > 0 ? costMatrix[0].length : 0;
  if (n === 0 || m === 0) return new Array(n).fill(-1);
  const size = Math.max(n, m);
  const INF = 1e15;
  const cost = [];
  for (let i = 0; i < size; i++) {
    const row = new Array(size).fill(0);
    for (let j = 0; j < size; j++) if (i < n && j < m) row[j] = costMatrix[i][j];
    cost.push(row);
  }
  const N = size;
  const u = new Array(N + 1).fill(0);
  const v = new Array(N + 1).fill(0);
  const p = new Array(N + 1).fill(0);
  const way = new Array(N + 1).fill(0);
  for (let i = 1; i <= N; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(N + 1).fill(INF);
    const used = new Array(N + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF, j1 = -1;
      for (let j = 1; j <= N; j++) {
        if (!used[j]) {
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }
      }
      for (let j = 0; j <= N; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else { minv[j] -= delta; }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0 !== 0);
  }
  const assignment = new Array(n).fill(-1);
  for (let j = 1; j <= N; j++) {
    if (p[j] > 0) {
      const i = p[j] - 1, jj = j - 1;
      if (i < n && jj < m) assignment[i] = jj;
    }
  }
  return assignment;
}
export function hungarianMaxAssignment(weightMatrix) {
  const n = weightMatrix.length;
  if (n === 0) return { assignment: [], total: 0 };
  const cost = weightMatrix.map(row => row.map(w => -w));
  const assignment = hungarianMin(cost);
  let total = 0;
  for (let i = 0; i < n; i++) if (assignment[i] !== -1) total += weightMatrix[i][assignment[i]];
  return { assignment, total };
}
