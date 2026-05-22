import { loadPyodide as _loadPyodide, type PyodideInterface } from 'pyodide';
import type { CultureSpec } from './cultureGeneration';
import { DEFAULT_CULTURE_SPEC } from './cultureGeneration';
import type { BioRecording, EnvSnapshot } from './types';
import { get } from 'svelte/store';
import { pyodideReady, hsdsConnected, backendInfo, loading, lastError, lastExecTime, updateStores, snapshotLog, pendingCommand } from './stores';

let pyodide: PyodideInterface | null = null;
let idbfsMounted = false;
let initPromise: Promise<void> | null = null;
let envBootstrapPromise: Promise<void> | null = null;

function logSnap(msg: string) {
    const ts = new Date().toLocaleTimeString();
    snapshotLog.update((log) => [...log.slice(-19), `[${ts}] ${msg}`]);
}

export function initPyodide(onLog: (msg: string) => void): Promise<void> {
    if (pyodide) {
        onLog('Pyodide already loaded');
        pyodideReady.set(true);
        return Promise.resolve();
    }
    if (initPromise) return initPromise;
    initPromise = _initPyodide(onLog).catch(e => { initPromise = null; throw e; });
    return initPromise;
}

async function _initPyodide(onLog: (msg: string) => void): Promise<void> {

    onLog('Loading Pyodide runtime…');

    // Cache pyodide assets in production only (dev uses Vite wheel proxy; SW can mask 502s)
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => { });
    }

    pyodide = await _loadPyodide({
        indexURL: '/pyodide/',
        // Load micropip during init (required before any `import micropip` in runPythonAsync)
        packages: ['micropip'],
    });

    // Verify micropip is importable (loadPackage alone can fail silently via CDN/SW issues)
    await pyodide.runPythonAsync('import micropip');

    await pyodide.loadPackage([
        'numpy', 'scipy', 'pandas', 'pydantic-core', 'pydantic',
        'fsspec', 'httpcore', 'httpx', 'pyyaml', 'packaging', 'requests', 'pyarrow',
    ]);

    onLog('Installing livn…');
    const manifest = await fetch('/wheel.json').then(r => r.json());
    // Fetch wheel bytes in JS and write to Pyodide's virtual filesystem
    const wheelBytes = new Uint8Array(await fetch(`/${manifest.filename}`).then(r => r.arrayBuffer()));
    pyodide!.FS.writeFile(`/${manifest.filename}`, wheelBytes);
    await pyodide!.runPythonAsync(`
import os
os.environ['TQDM_DISABLE'] = '1'
import micropip
await micropip.install(['gymnasium', 'pyfive', 'huggingface_hub', 'httpcore', 'httpx'])
await micropip.install('emfs:///${manifest.filename}', deps=False)
    `);

    // Mount IDBFS at /systems/graphs to persist downloaded systems across page loads
    onLog('Restoring cached systems…');
    await mountIDBFS();

    // Probe HSDS
    if (await tryConfigureHSDS()) {
        onLog('HSDS backend connected');
        hsdsConnected.set(true);
        backendInfo.set('HSDS');
    } else {
        onLog('Using pyfive backend (local)');
        backendInfo.set('pyfive (local)');
    }

    await registerDemoCultureRuntime();

    pyodideReady.set(true);
    onLog('Ready');
}

/** Initialize Pyodide once and run any queued env setup (e.g. demo culture on env open). */
export function ensureEnvBootstrap(onLog: (msg: string) => void = () => {}): Promise<void> {
    if (!envBootstrapPromise) {
        envBootstrapPromise = (async () => {
            await initPyodide(onLog);
            let code = get(pendingCommand);
            while (code) {
                pendingCommand.set(null);
                await executeCode(code);
                code = get(pendingCommand);
            }
        })().catch((e) => {
            envBootstrapPromise = null;
            throw e;
        });
    }
    return envBootstrapPromise;
}

/** Python helpers for built-in demo culture (console: load_demo_culture()). */
const DEMO_CULTURE_RUNTIME_PY = `
import numpy as _np

def _mea_grid(shape, rect_x, rect_y, disk_r, pitch):
    if pitch <= 0:
        return []
    xmin = 0.0 if shape == 'rectangle' else -float(disk_r)
    xmax = float(rect_x) if shape == 'rectangle' else float(disk_r)
    ymin = 0.0 if shape == 'rectangle' else -float(disk_r)
    ymax = float(rect_y) if shape == 'rectangle' else float(disk_r)
    sx = _np.ceil(xmin / pitch) * pitch
    sy = _np.ceil(ymin / pitch) * pitch
    coords = []
    x = float(sx)
    while x <= xmax + 1e-6:
        y = float(sy)
        while y <= ymax + 1e-6:
            if shape != 'disk' or _np.hypot(x, y) <= float(disk_r):
                coords.append([x, y])
            y += float(pitch)
        x += float(pitch)
    return coords

class _BuiltinCultureSystem:
    def __init__(self, spec):
        self._spec = spec
        self.name = spec['name']
        self.uri = 'builtin://' + spec['name']
        rng = _np.random.default_rng(int(spec['seed']))
        total = int(spec['total_neurons'])
        exc_ratio = float(spec['exc_ratio'])
        n_exc = int(round(total * exc_ratio))
        n_inh = total - n_exc
        self._pop_counts = {'EXC': n_exc, 'INH': n_inh}
        z = 0.0

        if spec['shape'] == 'rectangle':
            rx, ry = float(spec['rect_x']), float(spec['rect_y'])
            self._bbox = _np.array([[0.0, 0.0, z], [rx, ry, z]], dtype=_np.float64)
            exc_xy = _np.column_stack([rng.uniform(0, rx, n_exc), rng.uniform(0, ry, n_exc)])
            inh_xy = _np.column_stack([rng.uniform(0, rx, n_inh), rng.uniform(0, ry, n_inh)])
        else:
            dr = float(spec['disk_radius'])

            def _disk_pts(n):
                u = rng.random(n)
                theta = rng.uniform(0, 2 * _np.pi, n)
                r = _np.sqrt(u) * dr
                return _np.column_stack([r * _np.cos(theta), r * _np.sin(theta)])

            self._bbox = _np.array([[-dr, -dr, z], [dr, dr, z]], dtype=_np.float64)
            exc_xy = _disk_pts(n_exc)
            inh_xy = _disk_pts(n_inh)

        self._coords = {}
        gid = 0
        for pop, n, xy in [('EXC', n_exc, exc_xy), ('INH', n_inh, inh_xy)]:
            gids = _np.arange(gid, gid + n, dtype=_np.float64)
            gid += n
            zs = _np.full(n, z, dtype=_np.float64)
            self._coords[pop] = _np.column_stack([gids, xy[:, 0], xy[:, 1], zs])

    @property
    def populations(self):
        return list(self._pop_counts.keys())

    @property
    def num_neurons(self):
        return int(sum(self._pop_counts.values()))

    @property
    def bounding_box(self):
        return self._bbox

    def coordinate_array(self, population, all=True):
        return self._coords[population]

    def default_model(self):
        from livn.models.rcsd import ReducedCalciumSomaDendrite
        return ReducedCalciumSomaDendrite()

    def default_io(self):
        from livn.io import MEA
        mea = self._spec.get('mea_coords') or []
        if not mea:
            return MEA()
        n = len(mea)
        coords = _np.zeros((n, 4), dtype=_np.float64)
        coords[:, 0] = _np.arange(n, dtype=_np.float64)
        for i, pt in enumerate(mea):
            coords[i, 1] = float(pt[0])
            coords[i, 2] = float(pt[1])
            coords[i, 3] = 0.0
        return MEA(electrode_coordinates=coords, input_radius=50, output_radius=80)

def load_demo_culture(
    seed=42,
    total_neurons=10000,
    exc_ratio=0.8,
    rect_x=4000.0,
    rect_y=4000.0,
    mea_pitch=200.0,
    shape='rectangle',
    disk_radius=2000.0,
    name='demo_culture',
):
    """Load the built-in 2D E/I demo culture into global env (no HuggingFace)."""
    global env
    spec = {
        'name': name,
        'seed': int(seed),
        'total_neurons': int(total_neurons),
        'exc_ratio': float(exc_ratio),
        'rect_x': float(rect_x),
        'rect_y': float(rect_y),
        'mea_pitch': float(mea_pitch),
        'shape': shape,
        'disk_radius': float(disk_radius),
        'mea_coords': _mea_grid(shape, rect_x, rect_y, disk_radius, mea_pitch),
    }
    _system = _BuiltinCultureSystem(spec)
    from livn.env import Env
    env = Env(_system)
    print(
        f"Demo culture ready: {env.system.num_neurons} neurons, "
        f"{env.io.num_channels} electrodes — try env.system, env.io, env.run(...)"
    )
    return env
`;

async function registerDemoCultureRuntime(): Promise<void> {
    await pyodide!.runPythonAsync(DEMO_CULTURE_RUNTIME_PY);
}

/** Console code to load the demo culture (same path as clicking Demo Culture on System tab). */
export function builtinCultureSetupCode(spec: CultureSpec = DEFAULT_CULTURE_SPEC): string {
    const shape = spec.shape === 'disk' ? 'disk' : 'rectangle';
    return [
        '# Demo culture (in-browser, no HuggingFace)',
        'env = load_demo_culture(',
        `    seed=${spec.seed},`,
        `    total_neurons=${spec.totalNeurons},`,
        `    exc_ratio=${spec.excRatio},`,
        `    rect_x=${spec.rectX},`,
        `    rect_y=${spec.rectY},`,
        `    mea_pitch=${spec.meaPitch},`,
        `    shape='${shape}',`,
        `    disk_radius=${spec.diskRadius},`,
        ')',
    ].join('\n');
}

/** Console code for a blank env (no culture, no dataset). */
export function emptyEnvironmentSetupCode(): string {
    return [
        '# Empty environment — design via Build tab or Console',
        'env = None',
        "if 'loaded_dataset' in globals():",
        '    loaded_dataset = None',
        "print('Empty environment ready. Use the Build tab to design a culture, or the Console to load a system.')",
    ].join('\n');
}

async function tryConfigureHSDS(): Promise<boolean> {
    // HSDS is proxied through Vite at /hsds/* → localhost:5101/*
    // This makes h5pyd requests same-origin, avoiding CORS/Wasm issues.
    const params = new URLSearchParams(window.location.search);
    const directEndpoint = params.get('hsds') ?? 'http://localhost:5101';
    const proxyEndpoint = `${window.location.origin}/hsds`;
    try {
        const resp = await fetch(`${proxyEndpoint}/about`);
        if (resp.ok) {
            // Patch Pyodide's urllib to use browser fetch, then configure h5pyd
            await pyodide!.runPythonAsync(`
import os, json
# Use the same-origin proxy endpoint so h5pyd requests go through Vite
os.environ["LIVN_HSDS"] = json.dumps({
    "endpoint": "${proxyEndpoint}",
    "username": "admin",
    "password": "admin",
    "files_endpoint": "${window.location.origin}/files"
})
`);
            await pyodide!.runPythonAsync(`
import micropip
await micropip.install('h5pyd')
`);
            return true;
        }
    } catch {
        // HSDS not available — pyfive fallback
    }
    return false;
}

/** Mount an IndexedDB-backed FS at the systems cache directory */
async function mountIDBFS(): Promise<void> {
    if (!pyodide || idbfsMounted) return;
    try {
        const FS = pyodide.FS;
        // Pyodide cwd is /home/pyodide; predefined() downloads to ./systems/graphs/
        const base = '/home/pyodide/systems';
        const mount = `${base}/graphs`;
        try { FS.mkdir(base); } catch { /* exists */ }
        try { FS.mkdir(mount); } catch { /* exists */ }
        FS.mount(FS.filesystems.IDBFS, {}, mount);
        // Populate from IndexedDB (true = load from persistent store)
        await new Promise<void>((resolve, reject) => {
            FS.syncfs(true, (err: Error | null) => {
                if (err) reject(err); else resolve();
            });
        });
        idbfsMounted = true;
        // Log what was restored
        try {
            const entries = FS.readdir(mount).filter((e: string) => e !== '.' && e !== '..');
            if (entries.length > 0) {
                logSnap(`IDBFS restored: ${entries.join(', ')}`);
            }
        } catch { /* ignore */ }
    } catch (e) {
        logSnap(`IDBFS mount failed: ${String(e).slice(0, 200)}`);
    }
}

/** Flush in-memory FS changes to IndexedDB */
async function syncFSToDisk(): Promise<void> {
    if (!pyodide || !idbfsMounted) return;
    try {
        await new Promise<void>((resolve, reject) => {
            pyodide!.FS.syncfs(false, (err: Error | null) => {
                if (err) reject(err); else resolve();
            });
        });
    } catch { /* best-effort */ }
}

async function snapshotEnv(): Promise<EnvSnapshot | null> {
    logSnap('snapshotEnv() called');
    try {
        const result = await pyodide!.runPythonAsync(`
import json as _json
import numpy as _np
from js import Object as _JsObject
from pyodide.ffi import to_js

def _snapshot():
    env = globals().get('env')
    if env is None:
        return 'NO_ENV'

    snap = {}
    _diag = []

    # System
    if hasattr(env, 'system') and env.system is not None:
        s = env.system
        coords = {}
        for pop in s.populations:
            arr = _np.ascontiguousarray(s.coordinate_array(pop), dtype=_np.float64).flatten()
            coords[pop] = to_js(arr)

        snap['system'] = to_js({
            'name': s.name,
            'populations': to_js(list(s.populations)),
            'num_neurons': int(s.num_neurons),
            'bounding_box': to_js(_np.ascontiguousarray(s.bounding_box, dtype=_np.float64).flatten()),
            'pop_coords': to_js(coords),
        }, dict_converter=_JsObject.fromEntries)
        _diag.append(f'system={s.name} neurons={s.num_neurons}')
    else:
        _diag.append('system=None')

    # IO
    if hasattr(env, 'io') and env.io is not None:
        io_obj = env.io
        snap['io'] = to_js({
            'type': type(io_obj).__name__,
            'num_channels': int(io_obj.num_channels),
            'electrode_coordinates': to_js(
                _np.ascontiguousarray(io_obj.electrode_coordinates, dtype=_np.float64).flatten()
            ),
        }, dict_converter=_JsObject.fromEntries)
        _diag.append(f'io={type(io_obj).__name__} channels={io_obj.num_channels}')
    else:
        _diag.append('io=None')

    # Model
    if hasattr(env, 'model') and env.model is not None:
        snap['model'] = to_js({
            'type': type(env.model).__name__
        }, dict_converter=_JsObject.fromEntries)

    # Return diagnostic string if snap is empty
    if not snap:
        return 'EMPTY:' + ','.join(_diag)

    return to_js(snap, dict_converter=_JsObject.fromEntries)

_snapshot()
	`);

        if (typeof result === 'string') {
            logSnap(`snapshot returned string: ${result}`);
            return null;
        }

        logSnap(`snapshot OK: keys=[${result ? Object.keys(result).join(',') : 'null'}]`);
        return result as EnvSnapshot | null;
    } catch (e) {
        logSnap(`snapshot ERROR: ${String(e).slice(0, 500)}`);
        throw e;
    }
}

let datasetsInstalled = false;

/** Pyodide lock packages needed before Hugging Face `datasets` (hub is micropip-only). */
const PYODIDE_DATASET_PACKAGES = [
    'pyarrow', 'xxhash', 'lzma', 'tqdm', 'fsspec', 'httpcore', 'httpx', 'pyyaml', 'packaging', 'requests',
] as const;

const MICROPIP_DATASET_DEPS = [
    'pyarrow', 'huggingface_hub', 'httpcore', 'httpx', 'pyyaml', 'packaging', 'requests',
] as const;

const ENSURE_PYARROW_PY = `
try:
    import pyarrow as _pa
except ImportError:
    import micropip
    await micropip.install('pyarrow')
    import pyarrow as _pa
`;

const BUILTIN_DATASET_SPECS: Record<string, { n_rows: number; duration: number; n_neurons: number; seed: number }> = {
    demo: { n_rows: 3, duration: 1000, n_neurons: 10, seed: 42 },
};

const TQDM_THREAD_MAP_PATCH = `
import tqdm.contrib.concurrent as _tcc
# Pyodide has no threads; datasets uses thread_map for parallel map
_tcc.thread_map = lambda fn, iterable, *a, **kw: list(map(fn, iterable))
`;

async function ensureHFDatasetsReady(): Promise<void> {
    await initPyodide(() => {});
    const py = pyodide!;
    // Load pyarrow first (large wheel; other dataset deps are smaller)
    await py.loadPackage('pyarrow');
    await py.runPythonAsync(ENSURE_PYARROW_PY);
    await py.loadPackage([...PYODIDE_DATASET_PACKAGES].filter((p) => p !== 'pyarrow'));
    await py.runPythonAsync(TQDM_THREAD_MAP_PATCH);
    if (!datasetsInstalled) {
        const micropipDeps = MICROPIP_DATASET_DEPS.map((d) => JSON.stringify(d)).join(', ');
        await py.runPythonAsync(`
import micropip
await micropip.install([${micropipDeps}])
await micropip.install('datasets')
`);
        datasetsInstalled = true;
    }
    await py.runPythonAsync(ENSURE_PYARROW_PY);
}

/** Synthetic demo dataset — no file server; same idea as demo/neural1 bio recording. */
export async function loadBuiltinDataset(name: string): Promise<void> {
    const spec = BUILTIN_DATASET_SPECS[name];
    if (!spec) throw new Error(`Unknown built-in experiment: ${name}`);

    await ensureHFDatasetsReady();
    await pyodide!.runPythonAsync(`
import numpy as _np
from datasets import Dataset as _Dataset

_rng = _np.random.default_rng(${spec.seed})
_rows = []
for _ in range(${spec.n_rows}):
    _n = int(_rng.integers(12, 35))
    _it = _rng.integers(0, ${spec.n_neurons}, size=_n).astype(_np.int32).tolist()
    _tt = _rng.uniform(0, ${spec.duration}, size=_n).astype(_np.float32).tolist()
    _rows.append({
        'duration': ${spec.duration},
        'it': _it,
        'tt': _tt,
        'iv': [],
        'vv': [],
    })
loaded_dataset = _Dataset.from_list(_rows)
print(f"loaded_dataset ready: {loaded_dataset.num_rows} rows, features: {list(loaded_dataset.features)}")
`);
}

export async function loadHFDataset(
    name: string,
    expPath: string,
    serverBase: string
): Promise<void> {
    await initPyodide(() => {});
    const py = pyodide!;

    // 1. Fetch manifest (size-checked by server)
    const manifestUrl = `${serverBase}/dataset_manifest?path=${encodeURIComponent(expPath)}`;
    const mr = await fetch(manifestUrl);
    if (!mr.ok) {
        const body = await mr.json().catch(() => ({ error: `HTTP ${mr.status}` }));
        throw new Error((body as { error?: string }).error ?? `HTTP ${mr.status}`);
    }
    const { files } = await mr.json() as { files: string[] };

    // 2. Write dataset files to Pyodide FS
    const fsDir = `/datasets/${name}`;
    try { py.FS.mkdir('/datasets'); } catch { /* exists */ }
    try { py.FS.mkdir(fsDir); } catch { /* exists */ }

    for (const file of files) {
        const fileUrl = `${serverBase}/dataset_file?path=${encodeURIComponent(expPath)}&file=${encodeURIComponent(file)}`;
        const bytes = new Uint8Array(await (await fetch(fileUrl)).arrayBuffer());
        py.FS.writeFile(`${fsDir}/${file}`, bytes);
    }

    await ensureHFDatasetsReady();

    // Load from disk — patch out ThreadPoolExecutor first (Pyodide has no threads)
    await py.runPythonAsync(`
import datasets as _ds
loaded_dataset = _ds.load_from_disk(${JSON.stringify(fsDir)})
print(f"loaded_dataset ready: {loaded_dataset.num_rows} rows, features: {list(loaded_dataset.features)}")
`);
}

export function isBuiltinExperiment(exp: { kind?: string; root: string }): boolean {
    return exp.kind === 'builtin' || exp.root === 'built-in';
}

export async function loadExperimentDataset(exp: {
    name: string;
    path: string;
    kind?: string;
    root: string;
}): Promise<void> {
    if (isBuiltinExperiment(exp)) {
        await loadBuiltinDataset(exp.name);
    } else {
        await loadHFDataset(exp.name, exp.path, '');
    }
}

export type RowData = {
    duration: number;
    spikes: Record<number, number[]>;
    voltages: Record<number, number[]>;
};

/** Generate a culture in-browser (SystemGenerator defaults, no HuggingFace). */
export async function loadBuiltinCulture(spec: CultureSpec = DEFAULT_CULTURE_SPEC): Promise<void> {
    await initPyodide(() => {});
    await executeCode(builtinCultureSetupCode(spec));
}

export async function loadExpSystem(sysName: string): Promise<void> {
    if (!pyodide) throw new Error('Pyodide not initialized');
    await pyodide.runPythonAsync(`
from livn.env import Env
from livn.system import predefined
env = Env(predefined(${JSON.stringify(sysName)}))
`);
}

export async function getExpRowData(rowIdx: number, gids: number[]): Promise<RowData> {
    if (!pyodide) throw new Error('Pyodide not initialized');
    const result = await pyodide.runPythonAsync(`
import json as _json
import numpy as _np
import math as _math
_row  = loaded_dataset[${rowIdx}]
_gset = set(${JSON.stringify(gids)})
_it   = list(_row.get('it') or [])
_tt   = list(_row.get('tt') or [])
_spk  = {g: [] for g in _gset}
for _n, _t in zip(_it, _tt):
    _g = int(_n)
    if _g in _spk:
        _tf = float(_t)
        if not _math.isnan(_tf):
            _spk[_g].append(_tf)

_iv   = list(_row.get('iv') or [])
_vv   = list(_row.get('vv') or [])
_volt = {g: [] for g in _gset}
for _idx, _g in enumerate(_iv):
    _gi = int(_g)
    if _gi in _volt and _idx < len(_vv):
        _trace = _np.nan_to_num(_np.array(_vv[_idx], dtype=float), nan=0.0, posinf=0.0, neginf=0.0)
        _volt[_gi] = [float(v) for v in _trace]

_json.dumps({
    'duration': int(_row['duration']),
    'spikes':   {str(k): v for k, v in _spk.items()},
    'voltages': {str(k): v for k, v in _volt.items()},
})
`);
    return JSON.parse(result as string) as RowData;
}

let matplotlibReady = false;

export async function exportChartPng(
    gid: number,
    pop: string,
    chartType: 'spikes' | 'voltage',
    spikes: number[],
    voltages: number[],
    duration: number
): Promise<string> {
    if (!pyodide) throw new Error('Pyodide not initialized');
    if (!matplotlibReady) {
        await pyodide.loadPackage('matplotlib');
        matplotlibReady = true;
    }
    const result = await pyodide.runPythonAsync(`
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as _plt
import io as _io
import base64 as _b64

_spikes   = ${JSON.stringify(spikes)}
_voltages = ${JSON.stringify(voltages)}
_duration = ${duration}
_gid      = ${gid}
_pop      = ${JSON.stringify(pop)}
_type     = ${JSON.stringify(chartType)}

_dark = '#0d0d1a'
_fig, _ax = _plt.subplots(figsize=(10, 2.5), facecolor=_dark)
_ax.set_facecolor(_dark)
for _sp in _ax.spines.values(): _sp.set_color('#444')
_ax.tick_params(colors='#888')
_ax.set_xlabel('Time (ms)', color='#888')
_ax.xaxis.label.set_color('#888')
_ax.yaxis.label.set_color('#888')

if _type == 'spikes':
    _col = '#4fc3f7' if _pop == 'EXC' else '#ef5350' if _pop == 'INH' else '#aaaaaa'
    for _t in _spikes:
        _ax.axvline(_t, color=_col, linewidth=0.8, alpha=0.85)
    _ax.set_xlim(0, _duration)
    _ax.set_ylim(0, 1)
    _ax.set_yticks([])
    _ax.set_title(f'GID {_gid} ({_pop}) — Spikes', color='#ccc', fontsize=11)
else:
    import numpy as _np
    _t_ax = _np.linspace(0, _duration, len(_voltages))
    _ax.plot(_t_ax, _voltages, color='#ffb74d', linewidth=0.9)
    _ax.set_xlim(0, _duration)
    _ax.set_ylabel('mV', color='#888')
    _ax.set_title(f'GID {_gid} ({_pop}) — Voltage', color='#ccc', fontsize=11)

_plt.tight_layout()
_buf = _io.BytesIO()
_fig.savefig(_buf, format='png', dpi=150, bbox_inches='tight', facecolor=_dark)
_plt.close(_fig)
_buf.seek(0)
_b64.b64encode(_buf.getvalue()).decode()
`);
    return `data:image/png;base64,${result as string}`;
}

export type ElectrodeData = {
    duration: number;
    hasLfp: boolean;
    lfp: number[];
    spikeTimes: number[];
};

export type RecordingBackend = 'hf' | 'bio';

let recordingBackend: RecordingBackend = 'hf';

interface AcquiredBioState {
    apiPath: string;
    durationMs: number;
    channels: number;
}

let acquiredBioState: AcquiredBioState | null = null;

const BIO_WIN_DUR_S = 5;
const BIO_DOWNSAMPLE = 100;

export function setRecordingBackend(backend: RecordingBackend): void {
    recordingBackend = backend;
}

export function setAcquiredBio(bio: BioRecording): void {
    acquiredBioState = {
        apiPath: bio.apiPath,
        durationMs: bio.durS * 1000,
        channels: bio.channels,
    };
    recordingBackend = 'bio';
}

export function clearAcquiredBio(): void {
    acquiredBioState = null;
}

export function getRecordingBackend(): RecordingBackend {
    return recordingBackend;
}

export async function getTrialNeuronData(rowIdx: number, gids: number[]): Promise<RowData> {
    if (recordingBackend === 'bio') {
        const dur = acquiredBioState?.durationMs ?? 1000;
        return { duration: dur, spikes: {}, voltages: {} };
    }
    return getExpRowData(rowIdx, gids);
}

async function fetchBioElectrodeData(
    electrodeId: number,
    timeCursorMs: number,
    state: AcquiredBioState
): Promise<ElectrodeData> {
    const { fetchBioChunk } = await import('./demoBioChunk');
    const maxOffsetS = Math.max(0, state.durationMs / 1000 - BIO_WIN_DUR_S);
    const offsetS = Math.min(
        Math.max(0, timeCursorMs / 1000 - BIO_WIN_DUR_S / 2),
        maxOffsetS
    );
    const ch = Math.min(Math.max(0, electrodeId), Math.max(0, state.channels - 1));
    const { data } = await fetchBioChunk({
        rec: state.apiPath,
        offsetS,
        durS: BIO_WIN_DUR_S,
        downsample: BIO_DOWNSAMPLE,
        chStart: ch,
        chEnd: ch + 1,
    });
    return {
        duration: state.durationMs,
        hasLfp: data.length > 0,
        lfp: Array.from(data),
        spikeTimes: [],
    };
}

export async function getTrialElectrodeData(
    rowIdx: number,
    electrodeId: number,
    timeCursorMs = 0
): Promise<ElectrodeData> {
    if (recordingBackend === 'bio' && acquiredBioState) {
        return fetchBioElectrodeData(electrodeId, timeCursorMs, acquiredBioState);
    }
    return getElectrodeData(rowIdx, electrodeId);
}

export async function getElectrodeData(rowIdx: number, electrodeId: number): Promise<ElectrodeData> {
    if (!pyodide) throw new Error('Pyodide not initialized');
    const result = await pyodide.runPythonAsync(`
import json as _json
import numpy as _np

_row        = loaded_dataset[${rowIdx}]
_duration   = int(_row['duration'])
_eid        = ${electrodeId}

_it = _np.array(list(_row.get('it') or []))
_tt = _np.array(list(_row.get('tt') or []))
try:
    _cit, _ct = env.channel_recording(_it, _tt)
    _spike_times = [float(t) for t in _ct.get(int(_eid), [])]
except Exception:
    _spike_times = []

_has_mp = bool('mp' in _row and _row['mp'] is not None and len(_row.get('mp') or []) > 0)
_lfp = []
if _has_mp:
    try:
        _mp      = _np.array(_row['mp'])
        _lfp_all = env.potential_recording(_mp)
        _ch_ids  = list(env.io.channel_ids)
        _ch_idx  = _ch_ids.index(int(_eid))
        _trace   = _np.nan_to_num(_lfp_all[_ch_idx], nan=0.0, posinf=0.0, neginf=0.0)
        _lfp     = [float(v) for v in _trace]
    except Exception:
        _has_mp = False

_json.dumps({
    'duration':   _duration,
    'hasLfp':     bool(_has_mp),
    'lfp':        _lfp,
    'spikeTimes': _spike_times,
})
`);
    return JSON.parse(result as string) as ElectrodeData;
}

export async function getAllRowSpikes(rowIdx: number): Promise<{ it: number[]; tt: number[]; duration: number }> {
    if (!pyodide) throw new Error('Pyodide not initialized');
    const result = await pyodide.runPythonAsync(`
import json as _json, math as _math
_row = loaded_dataset[${rowIdx}]
_pairs = [(int(n), float(t)) for n, t in zip(_row.get('it') or [], _row.get('tt') or []) if not _math.isnan(float(t))]
_json.dumps({
    'duration': int(_row['duration']),
    'it': [p[0] for p in _pairs],
    'tt': [p[1] for p in _pairs],
})
`);
    return JSON.parse(result as string);
}

/** Force a manual snapshot refresh and store update */
export async function forceRefresh(): Promise<void> {
    logSnap('forceRefresh() triggered');
    try {
        const snapshot = await snapshotEnv();
        updateStores(snapshot);
        logSnap('forceRefresh() done');
    } catch (e) {
        logSnap(`forceRefresh() error: ${String(e).slice(0, 200)}`);
    }
}

export async function executeCode(code: string): Promise<{
    output: string;
    error: string | null;
    snapshot: EnvSnapshot | null;
}> {
    loading.set(true);
    lastError.set(null);
    const start = performance.now();

    // Redirect stdout/stderr
    await pyodide!.runPythonAsync(`
import sys as _sys, io as _io
_stdout_capture = _io.StringIO()
_stderr_capture = _io.StringIO()
_sys.stdout = _stdout_capture
_sys.stderr = _stderr_capture
	`);

    let error: string | null = null;
    try {
        const result = await pyodide!.runPythonAsync(code);
        // If the code returned a value, capture its repr
        if (result !== undefined && result !== null) {
            const repr = String(result);
            if (repr && repr !== 'None') {
                await pyodide!.runPythonAsync(`_stdout_capture.write(${JSON.stringify(repr)} + "\\n")`);
            }
        }
    } catch (e) {
        error = String(e);
    }

    const output = String(
        await pyodide!.runPythonAsync(`
_sys.stdout = _sys.__stdout__
_sys.stderr = _sys.__stderr__
_stdout_capture.getvalue() + _stderr_capture.getvalue()
		`)
    );

    // Always snapshot after execution
    let snapshot: EnvSnapshot | null = null;
    let snapshotError: string | null = null;
    try {
        snapshot = await snapshotEnv();
    } catch (e) {
        snapshotError = String(e);
    }

    // Persist any newly downloaded system files to IndexedDB
    await syncFSToDisk();

    const elapsed = performance.now() - start;
    lastExecTime.set(elapsed);
    loading.set(false);

    // Surface snapshot errors alongside execution errors
    if (snapshotError) {
        const msg = `\n[snapshot error] ${snapshotError}`;
        error = error ? error + msg : msg;
    }
    if (error) lastError.set(error);

    updateStores(snapshot);

    return { output, error, snapshot };
}
