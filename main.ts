/* The Quiet Archive — entrypoint (make.fun program/v1).
   Copies the game and its screenshots into the output directory and writes
   the dossier with the kit's own library. No network, no randomness: two
   runs write identical bytes. Outside the grader, MAKEFUN_OUTPUT_DIR
   stands in for /output. */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';
const root = dirname(fileURLToPath(import.meta.url));

for (const needed of ['game', 'screenshots']) {
  if (!existsSync(join(root, needed))) {
    throw new Error(`main.ts: ${needed}/ is missing from the repository root`);
  }
}
if (!existsSync(join(root, 'game', 'index.html'))) {
  throw new Error('main.ts: game/index.html is missing');
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
cpSync(join(root, 'game'), join(outDir, 'game'), { recursive: true });
cpSync(join(root, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
const shots = readdirSync(join(outDir, 'screenshots')).length;
console.log(`The Quiet Archive: wrote ${shots} screenshots, game/ and dossier.json to ${outDir}`);
