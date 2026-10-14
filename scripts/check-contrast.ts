import { contrastRatio } from '../src/shared/contrast';
import { contrastPairs } from '../src/shared/tokens';

const failures = contrastPairs
  .map((p) => ({ ...p, ratio: contrastRatio(p.fg, p.bg) }))
  .filter((p) => p.ratio < p.min);

for (const f of failures) {
  console.error(`FAIL ${f.name}: ${f.fg} on ${f.bg} = ${f.ratio.toFixed(2)}:1 (needs ${f.min}:1)`);
}
if (failures.length > 0) process.exit(1);
console.log(`All ${contrastPairs.length} pairs pass`);
