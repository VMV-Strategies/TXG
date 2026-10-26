// Development loop: rebuild on change and serve dist/.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let running = false;
let queued = false;
function rebuild() {
  if (running) return void (queued = true);
  running = true;
  const p = spawn(process.execPath, [path.join(root, 'scripts/build.mjs'), '--watch'], { stdio: 'inherit' });
  p.on('exit', () => {
    running = false;
    if (queued) {
      queued = false;
      rebuild();
    }
  });
}
rebuild();
fs.watch(path.join(root, 'src'), { recursive: true }, () => rebuild());
spawn(process.execPath, [path.join(root, 'scripts/serve.mjs'), path.join(root, 'dist'), process.env.PORT ?? '5173'], { stdio: 'inherit' });
