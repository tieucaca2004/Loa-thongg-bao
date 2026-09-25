import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = join(__dirname, '..', '..');
const DIST = join(DESKTOP_ROOT, 'dist');

/**
 * Regression guard (Phase 12 Step 3) for the real defect found in Phase 11:
 * `preload.ts` compiled as ESM broke Electron's preload loader entirely
 * ("Cannot use import statement outside a module"), silently disabling
 * `window.atieu` and the whole renderer UI, on every platform including
 * Windows. This test builds the app for real and asserts the preload
 * artifact is exactly right — never let this regress silently again.
 *
 * Runs the actual `npm run build` (not a mock) so it catches the failure
 * mode whether it's reintroduced via tsconfig, package.json "type", the
 * build script, or main.ts's BrowserWindow options.
 */
describe('Phase 12: preload build regression guard', () => {
  it(
    'produces dist/preload.cjs as CommonJS, and never dist/preload.js',
    () => {
      rmSync(DIST, { recursive: true, force: true });
      // Via the platform shell: on Windows `npm` is an `npm.cmd` shim that
      // execFileSync cannot resolve (ENOENT) or spawn without a shell (EINVAL).
      execSync('npm run build', { cwd: DESKTOP_ROOT, stdio: 'pipe' });

      const preloadCjs = join(DIST, 'preload.cjs');
      const preloadJs = join(DIST, 'preload.js');

      expect(existsSync(preloadCjs)).toBe(true);
      expect(existsSync(preloadJs)).toBe(false);

      const content = readFileSync(preloadCjs, 'utf-8');
      // CommonJS markers Electron's preload loader can actually execute.
      expect(content).toMatch(/require\(['"]electron['"]\)/);
      // ESM syntax must NOT be present - that's exactly what broke it before.
      expect(content).not.toMatch(/^\s*import\s.+from\s/m);
      expect(content).not.toMatch(/^\s*export\s/m);

      // main.ts must point BrowserWindow's preload at the .cjs file.
      const mainSrc = readFileSync(join(DESKTOP_ROOT, 'src', 'main.ts'), 'utf-8');
      expect(mainSrc).toMatch(/preload\.cjs/);
      expect(mainSrc).not.toMatch(/preload\.js['"]/);

      // Leave no build artifacts behind - dist/ is a transient, gitignored
      // build output, not something this test should leave lying around.
      rmSync(DIST, { recursive: true, force: true });
    },
    30_000
  );
});
