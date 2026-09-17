// Bun hoists the SDK's zod v4 to the workspace root and, unlike npm, does not
// give @nomicfoundation/hardhat-zod-utils a copy satisfying its zod ^3 peer
// dependency — every hardhat CLI invocation then crashes inside config
// validation ("keyValidator._parse is not a function"). Link hardhat's own
// nested zod v3 into the package so its peer import resolves correctly.
// No-op when the tree already resolves zod v3 (e.g. installed with npm).
import { createRequire } from 'node:module';
import { mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const majorOf = packageJsonPath => Number(require(packageJsonPath).version.split('.')[0]);

let zodUtilsDir;
try {
  zodUtilsDir = dirname(require.resolve('@nomicfoundation/hardhat-zod-utils/package.json'));
} catch {
  process.exit(0); // hardhat not installed — nothing to fix
}

const requireFromZodUtils = createRequire(resolve(zodUtilsDir, 'noop.js'));
try {
  if (majorOf(requireFromZodUtils.resolve('zod/package.json')) === 3) process.exit(0);
} catch {
  // zod not resolvable at all — fall through and link one in
}

const hardhatDir = dirname(require.resolve('hardhat/package.json'));
const requireFromHardhat = createRequire(resolve(hardhatDir, 'noop.js'));
const hardhatZod = dirname(requireFromHardhat.resolve('zod/package.json'));
if (majorOf(resolve(hardhatZod, 'package.json')) !== 3) {
  console.error('[fix-hardhat-zod] No zod v3 copy found in the hardhat tree; cannot fix.');
  process.exit(1);
}

const link = resolve(zodUtilsDir, 'node_modules/zod');
mkdirSync(dirname(link), { recursive: true });
rmSync(link, { recursive: true, force: true });
symlinkSync(hardhatZod, link, 'junction');
console.log(`[fix-hardhat-zod] Linked ${link} -> ${hardhatZod}`);
