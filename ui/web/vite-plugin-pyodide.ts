import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { readFileSync, copyFileSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import type { Plugin, Connect } from 'vite';

const LOCAL_ASSETS = ['pyodide.asm.js', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'];

const INIT_PACKAGES = ['micropip', 'numpy', 'scipy', 'pandas', 'pydantic'];

type LockPackage = { depends?: string[]; file_name: string; package_type?: string };
type PyodideLock = { packages: Record<string, LockPackage> };

/** Lock keys use hyphens; depends[] often uses import names with underscores. */
function resolvePackageKey(lock: PyodideLock, name: string): string | null {
    if (lock.packages[name]) return name;
    const hyphenated = name.replace(/_/g, '-');
    if (lock.packages[hyphenated]) return hyphenated;
    return null;
}

function bootstrapArtifacts(lock: PyodideLock): string[] {
    const files = new Set<string>();
    const visit = (name: string) => {
        const key = resolvePackageKey(lock, name);
        if (!key) return;
        const pkg = lock.packages[key];
        for (const dep of pkg.depends ?? []) visit(dep);
        files.add(pkg.file_name);
    };
    for (const name of INIT_PACKAGES) visit(name);
    return [...files];
}

const CDN_BASE = 'https://cdn.jsdelivr.net/pyodide/v0.29.3/full/';

const MIME: Record<string, string> = {
    '.js': 'application/javascript',
    '.wasm': 'application/wasm',
    '.zip': 'application/zip',
    '.json': 'application/json',
    '.whl': 'application/zip'
};

function setHeaders(res: Connect.ServerResponse) {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
}

function contentTypeFor(file: string): string {
    const ext = '.' + file.split('.').pop()!;
    return MIME[ext] ?? 'application/octet-stream';
}

async function fetchWheelBytes(fileName: string): Promise<Buffer> {
    const res = await fetch(CDN_BASE + fileName);
    if (!res.ok) {
        throw new Error(`CDN ${res.status} for ${fileName}`);
    }
    return Buffer.from(await res.arrayBuffer());
}

async function ensureWheelCached(wheelDir: string, fileName: string): Promise<void> {
    const dest = join(wheelDir, fileName);
    if (existsSync(dest)) return;
    mkdirSync(wheelDir, { recursive: true });
    writeFileSync(dest, await fetchWheelBytes(fileName));
}

function serveFile(res: Connect.ServerResponse, filePath: string, file: string): void {
    res.setHeader('Content-Type', contentTypeFor(file));
    setHeaders(res);
    res.end(readFileSync(filePath));
}

export function copyPyodidePlugin(): Plugin {
    const require = createRequire(import.meta.url);
    const pyodideDir = dirname(require.resolve('pyodide/package.json'));
    const wheelDir = join(pyodideDir, '.livn-wheels');
    const lock: PyodideLock = JSON.parse(readFileSync(join(pyodideDir, 'pyodide-lock.json'), 'utf8'));
    const bootstrapWheels = bootstrapArtifacts(lock);

    return {
        name: 'copy-pyodide-assets',

        configureServer(server) {
            // Pre-cache bootstrap wheels so micropip/numpy load without a live CDN hop.
            void Promise.all(bootstrapWheels.map((f) => ensureWheelCached(wheelDir, f))).catch((err) => {
                console.warn('[pyodide] wheel pre-cache failed:', err);
            });

            server.middlewares.use('/pyodide', (req, res, next) => {
                void (async () => {
                    const file = (req.url ?? '/').replace(/^\//, '').split('?')[0];
                    if (!file) {
                        next();
                        return;
                    }

                    const filePath = join(pyodideDir, file);
                    if (existsSync(filePath)) {
                        serveFile(res, filePath, file);
                        return;
                    }

                    const cachedWheel = join(wheelDir, file);
                    if (existsSync(cachedWheel)) {
                        serveFile(res, cachedWheel, file);
                        return;
                    }

                    try {
                        const bytes = await fetchWheelBytes(file);
                        mkdirSync(wheelDir, { recursive: true });
                        writeFileSync(cachedWheel, bytes);
                        res.setHeader('Content-Type', contentTypeFor(file));
                        setHeaders(res);
                        res.end(bytes);
                    } catch (err) {
                        if (!res.headersSent) {
                            res.statusCode = 502;
                            res.end(`CDN fetch failed: ${err}`);
                        }
                    }
                })();
            });
        },

        async writeBundle(options) {
            const outDir = options.dir ?? 'build';
            const dest = join(outDir, 'pyodide');
            mkdirSync(dest, { recursive: true });
            for (const name of LOCAL_ASSETS) {
                copyFileSync(join(pyodideDir, name), join(dest, name));
            }
            for (const wheel of bootstrapWheels) {
                await ensureWheelCached(dest, wheel);
            }
        }
    };
}
