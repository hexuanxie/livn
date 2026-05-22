import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Connect, type Plugin } from 'vite';
import { copyPyodidePlugin } from './vite-plugin-pyodide';
import { generateDemoBioChunk, isDemoBioRec } from './src/lib/demoBioChunk';
import { readFileSync, existsSync, openSync, readSync, closeSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

function attachMiddleware(plugin: Plugin, middleware: Connect.NextHandleFunction): Plugin {
    return {
        ...plugin,
        configureServer(server) {
            server.middlewares.use(middleware);
        },
        configurePreviewServer(server) {
            server.middlewares.use(middleware);
        },
    };
}

// Serve graph.json (and other metadata) from systems/graphs/ for Pyodide
const graphsDir = resolve(__dirname, '../../systems/graphs');

// Serve binary signal chunks from bio_data recordings
const bioDataRoot = resolve(__dirname, '../../bio_data');

function serveBioData(): Plugin {
    const middleware: Connect.NextHandleFunction = (req, res, next) => {
        if (!req.url?.startsWith('/bio-api/chunk')) return next();

        const url = new URL(req.url, 'http://localhost');
        const rec = url.searchParams.get('rec') ?? '';
        const offsetS = parseFloat(url.searchParams.get('offset_s') ?? '0');
        const durS = parseFloat(url.searchParams.get('dur_s') ?? '5');
        const dsF = Math.max(1, parseInt(url.searchParams.get('downsample') ?? '100', 10));
        const chStart = Math.max(0, parseInt(url.searchParams.get('ch_start') ?? '0', 10));
        const chEnd = Math.min(512, parseInt(url.searchParams.get('ch_end') ?? '32', 10));

        if (chEnd <= chStart) {
            res.statusCode = 400;
            res.end('Bad ch range');
            return;
        }

        if (isDemoBioRec(rec)) {
            const chunk = generateDemoBioChunk({
                rec,
                offsetS,
                durS,
                downsample: dsF,
                chStart,
                chEnd,
            });
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader(
                'Access-Control-Expose-Headers',
                'X-N-Channels,X-N-Samples,X-Sample-Rate,X-Ch-Start'
            );
            res.setHeader('X-N-Channels', String(chunk.chCount));
            res.setHeader('X-N-Samples', String(chunk.nSamples));
            res.setHeader('X-Sample-Rate', String(chunk.effHz));
            res.setHeader('X-Ch-Start', String(chunk.chStart));
            res.end(Buffer.from(chunk.data.buffer));
            return;
        }

        const datPath = resolve(
            bioDataRoot,
            rec,
            'continuous',
            'Acquisition_Board-100.Rhythm Data',
            'continuous.dat'
        );
        if (!datPath.startsWith(bioDataRoot) || !existsSync(datPath)) {
            res.statusCode = 404;
            res.end('Not found');
            return;
        }

        const N_CH = 512;
        const SR = 30000;
        const BIT_VOLTS = 0.195;
        const N_SAMPLES = 9212672;
        const ROW_BYTES = N_CH * 2;

        const offsetSample = Math.max(0, Math.floor(offsetS * SR));
        const nSamples = Math.min(Math.floor(durS * SR), N_SAMPLES - offsetSample);
        const chCount = chEnd - chStart;
        const nOut = Math.floor(nSamples / dsF);

        const rowBuf = Buffer.allocUnsafe(ROW_BYTES);
        const out = new Float32Array(chCount * nOut);

        let fd = -1;
        try {
            fd = openSync(datPath, 'r');
            for (let si = 0; si < nOut; si++) {
                readSync(fd, rowBuf, 0, ROW_BYTES, (offsetSample + si * dsF) * ROW_BYTES);
                for (let ci = 0; ci < chCount; ci++) {
                    out[ci * nOut + si] = rowBuf.readInt16LE((chStart + ci) * 2) * BIT_VOLTS;
                }
            }
            closeSync(fd);
        } catch (e) {
            if (fd >= 0) try {
                closeSync(fd);
            } catch { /* ignore */ }
            res.statusCode = 500;
            res.end(String(e));
            return;
        }

        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader(
            'Access-Control-Expose-Headers',
            'X-N-Channels,X-N-Samples,X-Sample-Rate,X-Ch-Start'
        );
        res.setHeader('X-N-Channels', String(chCount));
        res.setHeader('X-N-Samples', String(nOut));
        res.setHeader('X-Sample-Rate', String(Math.round(SR / dsF)));
        res.setHeader('X-Ch-Start', String(chStart));
        res.end(Buffer.from(out.buffer));
    };

    return attachMiddleware({ name: 'serve-bio-data' }, middleware);
}

function serveGraphFiles(): Plugin {
    const middleware: Connect.NextHandleFunction = (req, res, next) => {
        if (!req.url?.startsWith('/files/')) return next();
        const relPath = req.url.slice('/files/'.length);
        const filePath = join(graphsDir, relPath);
        if (!filePath.startsWith(graphsDir)) {
            res.statusCode = 403;
            res.end('Forbidden');
            return;
        }
        if (!existsSync(filePath)) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Not found' }));
            return;
        }
        const data = readFileSync(filePath);
        res.setHeader('Content-Type', 'application/json');
        res.end(data);
    };
    return attachMiddleware({ name: 'serve-graph-files' }, middleware);
}

// ── Experiments file-server endpoints (/experiments, /dataset_manifest, /dataset_file) ──
// Mirrors ui/server.py's _load_experiments / dataset_manifest / dataset_file,
// so the Vite dev server handles these without needing the separate Python process.
const GLOBAL_ROOTS_FILE = join(homedir(), '.livn', 'roots.json');
const MAX_DATASET_BYTES = 100 * 1024 * 1024;

function defaultExperimentRoot(): string {
    // Walk up from this file looking for pyproject.toml
    let dir = resolve(__dirname, '../..');
    while (dir !== resolve(dir, '..')) {
        if (existsSync(join(dir, 'pyproject.toml'))) return join(dir, 'livn_experiments');
        dir = resolve(dir, '..');
    }
    return join(homedir(), 'livn_experiments');
}

function loadExperiments(): object[] {
    const roots: string[] = [];
    try { roots.push(...JSON.parse(readFileSync(GLOBAL_ROOTS_FILE, 'utf8'))); } catch { /* no registry yet */ }
    const envRoot = process.env.LIVN_EXPERIMENT_ROOT;
    if (envRoot) {
        const abs = resolve(envRoot);
        if (!roots.includes(abs)) roots.push(abs);
    }
    if (roots.length === 0) roots.push(defaultExperimentRoot());

    const experiments: object[] = [];
    const seen = new Set<string>();
    for (const root of roots) {
        const registryPath = join(root, 'experiments.json');
        if (!existsSync(registryPath)) continue;
        let registry: Record<string, { path?: string; created_at?: string }>;
        try { registry = JSON.parse(readFileSync(registryPath, 'utf8')); } catch { continue; }

        for (const [name, info] of Object.entries(registry)) {
            const expPath = info.path ?? join(root, name);
            if (seen.has(expPath)) continue;
            seen.add(expPath);

            let n_shards = 0;
            if (existsSync(expPath)) {
                n_shards = readdirSync(expPath)
                    .filter(f => f.startsWith('data-') && f.endsWith('.arrow')).length;
            }

            let metadata: unknown = null;
            const metaPath = join(expPath, 'metadata.json');
            if (existsSync(metaPath)) {
                try { metadata = JSON.parse(readFileSync(metaPath, 'utf8')); } catch { /* skip */ }
            }

            experiments.push({ name, root, path: expPath, created_at: info.created_at ?? null, n_shards, metadata });
        }
    }
    return experiments;
}

function resolveDatasetDir(path: string): [string, string] | null {
    const abs = resolve(path);
    const known = new Set((loadExperiments() as Array<{ path: string }>).map(e => resolve(e.path)));
    if (!known.has(abs)) return null;
    return [abs, join(abs, 'dataset')];
}

function serveExperiments(): Plugin {
    const middleware: Connect.NextHandleFunction = (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');

        if (url.pathname === '/experiments') {
            const data = JSON.stringify(loadExperiments());
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(data);
            return;
        }

        if (url.pathname === '/dataset_manifest') {
            const path = url.searchParams.get('path') ?? '';
            if (!path) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Missing path' }));
                return;
            }
            const resolved = resolveDatasetDir(path);
            if (!resolved) {
                res.statusCode = 403;
                res.end(JSON.stringify({ error: 'Unknown experiment path' }));
                return;
            }
            const [, dsDir] = resolved;
            if (!existsSync(dsDir)) {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: 'No dataset found. Was save_dataset=True used?' }));
                return;
            }
            const files = readdirSync(dsDir).filter((f) => !f.startsWith('.'));
            const total_bytes = files.reduce((s, f) => s + statSync(join(dsDir, f)).size, 0);
            if (total_bytes > MAX_DATASET_BYTES) {
                const mb = (total_bytes / 1024 / 1024).toFixed(1);
                res.statusCode = 413;
                res.end(JSON.stringify({ error: `Dataset too large (${mb} MB). Limit is 100 MB.` }));
                return;
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ files, total_bytes }));
            return;
        }

        if (url.pathname === '/dataset_file') {
            const path = url.searchParams.get('path') ?? '';
            const filename = url.searchParams.get('file') ?? '';
            if (
                !path ||
                !filename ||
                filename.includes('/') ||
                filename.includes('\\') ||
                filename.startsWith('.')
            ) {
                res.statusCode = 400;
                res.end('Bad request');
                return;
            }
            const resolved = resolveDatasetDir(path);
            if (!resolved) {
                res.statusCode = 403;
                res.end('Forbidden');
                return;
            }
            const [, dsDir] = resolved;
            const filePath = resolve(dsDir, filename);
            if (!filePath.startsWith(resolve(dsDir))) {
                res.statusCode = 403;
                res.end('Forbidden');
                return;
            }
            if (!existsSync(filePath)) {
                res.statusCode = 404;
                res.end('Not found');
                return;
            }
            res.setHeader('Content-Type', 'application/octet-stream');
            res.end(readFileSync(filePath));
            return;
        }

        next();
    };
    return attachMiddleware({ name: 'serve-experiments' }, middleware);
}

export default defineConfig({
    plugins: [serveGraphFiles(), serveBioData(), serveExperiments(), copyPyodidePlugin(), sveltekit()],
    server: {
        headers: {
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp'
        },
        proxy: {
            '/hsds': {
                target: 'http://localhost:5101',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/hsds/, '')
            }
        }
    },
    optimizeDeps: {
        exclude: ['pyodide']
    }
});
