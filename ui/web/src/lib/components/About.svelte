<script lang="ts">
    import { onMount } from 'svelte';

    const NODES = [
        { id: 'ui',      label: 'LIVN UI',                       sub: 'Svelte + Threlte + Three.js',          px: 0.50, py: 20,  w: 230 },
        { id: 'stores',  label: 'Shared Data Stores',            sub: 'reactive state',                       px: 0.50, py: 115, w: 206 },
        { id: 'pyodide', label: 'Pyodide',                       sub: 'LIVN Python runtime (WASM)',           px: 0.24, py: 210, w: 182 },
        { id: 'hsds',    label: 'HSDS / Python Server',          sub: 'HDF5 datasets + experiment data',      px: 0.76, py: 210, w: 196 },
        { id: 'simconf', label: 'Simulation Config',             sub: 'System + Model + IO + Stimulus',       px: 0.50, py: 320, w: 224 },
        { id: 'envrun',  label: 'Env.run()',                     sub: 'one call advances time',               px: 0.50, py: 410, w: 144 },
        { id: 'brian2',  label: 'Brian2',                        sub: 'CPU backend (default)',                px: 0.15, py: 500, w: 136 },
        { id: 'diffrax', label: 'Diffrax / JAX',                 sub: 'GPU + differentiable',                 px: 0.50, py: 500, w: 136 },
        { id: 'neuron',  label: 'NEURON',                        sub: 'multi-compartment',                    px: 0.85, py: 500, w: 136 },
        { id: 'outputs', label: 'Spikes · Voltages · Currents · LFP', sub: 'saved to HDF5 datasets',        px: 0.50, py: 600, w: 298 },
        { id: 'viz',     label: 'Charts + 3D Views',             sub: 'decoded on demand',                    px: 0.50, py: 692, w: 192 },
    ] as const;

    const INFO: Record<string, { desc: string; subs: string[] }> = {
        ui: {
            desc: 'The control panel — not the simulator. Svelte manages reactive state so changing a slider immediately redraws previews without running any simulation. Threlte and Three.js render the 3D neuron and electrode views.',
            subs: ['Reactive parameter controls', '3D neuron + electrode preview', 'Svelte stores as single source of truth', 'Threlte / Three.js 3D renderer', 'Triggers backend calls on demand'],
        },
        stores: {
            desc: 'Shared reactive state that all UI components subscribe to. When a parameter changes — neuron count, culture radius, selected backend — Svelte automatically propagates the update and redraws anything that depends on it. No manual event wiring required.',
            subs: ['Single source of truth', 'Reactive across all tabs', 'Drives preview re-renders', 'Holds loaded dataset refs', 'Auto-propagates changes'],
        },
        pyodide: {
            desc: 'The LIVN Python runtime embedded in the browser via WebAssembly. It constructs System Graphs, assembles Environments from UI parameters, and dispatches Env.run() to the selected backend. Decoders (LFP, ISI, burst detection) also run here.',
            subs: ['LIVN Python API in WASM', 'System Graph construction', 'Environment assembly', 'Decoder execution', 'Dispatches to backend'],
        },
        hsds: {
            desc: 'Highly Scalable Data Service — a server that exposes large HDF5 files to the browser over HTTP. The UI never loads a full dataset; it queries specific slices (coordinates, spike trains, voltage traces) on demand to keep browser memory low.',
            subs: ['Lazy HDF5 slice queries', 'Coordinates on demand', 'Spikes / voltages on demand', 'Experiment metadata', 'Prevents memory overload'],
        },
        simconf: {
            desc: 'The assembled simulation blueprint: System Graph (which neurons exist and how they are wired) + Model (LIF, Izhikevich, RCSD…) + IO (electrode geometry) + Stimulus (current waveforms). Pyodide constructs this from UI parameters before running.',
            subs: ['System Graph (cells + wiring)', 'Neuron model selection', 'IO / MEA geometry', 'Stimulus waveforms', 'Backend selection'],
        },
        envrun: {
            desc: 'The single call that executes a simulation step: spikes, voltages, currents = env.run(stimulus, duration). The Env protocol abstracts away which backend is running — Brian2, Diffrax, and NEURON all expose the same interface.',
            subs: ['Returns spikes', 'Returns voltages', 'Returns currents', 'Backend-agnostic protocol', 'Applies stimulus each timestep'],
        },
        brian2: {
            desc: 'The default CPU backend built on the Brian2 Python simulator. Well-tested, runs on any laptop, no GPU required. The best starting point for most simulations.',
            subs: ['CPU only', 'Default backend', 'Event-driven spikes', 'Well-tested', 'Pure Python setup'],
        },
        diffrax: {
            desc: 'A GPU-accelerated backend built on JAX and the diffrax ODE solver. The entire simulation is differentiable — useful for gradient-based parameter fitting and integration with neural network training pipelines.',
            subs: ['GPU acceleration', 'Fully differentiable', 'JAX JIT compilation', 'Gradient-based fitting', 'diffrax ODE solver'],
        },
        neuron: {
            desc: 'Uses the NEURON simulator for multi-compartment cell models — the standard in computational neuroscience for biophysical accuracy. Choose this when matching specific cell types against patch-clamp recordings.',
            subs: ['Multi-compartment cells', 'Highest biophysical accuracy', 'MPI parallelism', 'NEURON .hoc / Python', 'Standard in the field'],
        },
        outputs: {
            desc: 'Raw simulation results: spike times per neuron, membrane voltage traces, injected current arrays, and LFP signals derived from population activity. All written to HDF5 datasets and exposed via HSDS for lazy querying.',
            subs: ['Spike trains', 'Membrane voltages', 'Injected currents', 'LFP signals', 'Stored in HDF5'],
        },
        viz: {
            desc: 'Charts and 3D views rendered from dataset queries. Decoders (LFP, ISI, burst detection) run in Pyodide and return arrays to the browser. Spike rasters, voltage traces, and electrode signals are plotted on demand. Neuron positions and activity are rendered in Three.js.',
            subs: ['Spike raster plots', 'Voltage traces', 'LFP / ISI / burst charts', '3D neuron + electrode viewer', 'All loaded on demand'],
        },
    };

    const CONNS: [string, string][] = [
        ['ui', 'stores'],
        ['stores', 'pyodide'],
        ['stores', 'hsds'],
        ['pyodide', 'simconf'],
        ['hsds', 'simconf'],
        ['simconf', 'envrun'],
        ['envrun', 'brian2'],
        ['envrun', 'diffrax'],
        ['envrun', 'neuron'],
        ['brian2', 'outputs'],
        ['diffrax', 'outputs'],
        ['neuron', 'outputs'],
        ['outputs', 'viz'],
    ];

    const FLOWS = [
        {
            id: 'generate',
            title: 'Generate System',
            steps: [
                { title: 'Adjust parameters',    body: 'Neuron count, culture radius, connectivity probability, electrode layout — all live in Svelte reactive stores. Changing a slider instantly updates dependent values and redraws the preview.' },
                { title: 'Preview redraws',       body: 'The UI computes neuron positions, electrode positions, and connections using random generators and Gaussian connection rules. This is visualization only — no simulation is running yet.' },
                { title: 'Build configuration',  body: 'Clicking Generate converts your choices into a config object: { neurons, radius, connection_probability, electrodes }.' },
                { title: 'Create System Graph',  body: 'Pyodide constructs a System Graph — cells, projections, coordinates, and metadata — stored as a CachedSystem / NeuroH5Graph.' },
                { title: 'Save to HDF5',          body: 'The system is written to system.h5 (coordinates, connectivity, cell + electrode metadata). HSDS exposes this file for all subsequent queries.' },
            ],
        },
        {
            id: 'dataset',
            title: 'Load Dataset',
            steps: [
                { title: 'Request metadata',     body: 'Clicking Load Dataset hits the Python server. The browser never loads the full HDF5 file at once.' },
                { title: 'HSDS slices HDF5',     body: 'HSDS locates the file and returns only the requested slice — coordinates first, then spikes or voltages only when needed.' },
                { title: 'Lazy loading',          body: '"Give me coordinates" → coordinates returned. "Give me spikes" → spikes returned. Each query fetches only what the UI needs right now, preventing memory overload.' },
                { title: 'UI populated',          body: 'Neuron count, electrode layout, and recording duration fill the interface. 3D coordinates are passed to Three.js for immediate rendering.' },
            ],
        },
        {
            id: 'simulate',
            title: 'Run Simulation',
            steps: [
                { title: 'Assemble Environment', body: 'System Graph + Model (LIF / Izhikevich / RCSD / Pinsky-Rinzel) + Stimulus (pulse, waveform, MEA) + IO (electrode geometry) are combined into one Environment object in Pyodide.' },
                { title: 'Select backend',        body: 'Brian2 (CPU, default), Diffrax/JAX (GPU + differentiable), or NEURON (multi-compartment). The Env protocol means the UI doesn\'t care which simulator runs underneath.' },
                { title: 'Env.run()',             body: 'One call steps time forward. The selected backend executes the simulation and returns spikes, voltages, and currents.' },
                { title: 'Store results',         body: 'Outputs are saved into HDF5 datasets and exposed by HSDS for lazy querying.' },
                { title: 'Decode + visualize',    body: 'Decoders extract LFP, ISI, and burst events on demand. Charts and the 3D viewer render results as the user explores.' },
            ],
        },
    ];

    let canvasEl: HTMLDivElement;
    let svgEl: SVGSVGElement;
    let infoEl: HTMLDivElement;
    let infoTitleEl: HTMLDivElement;
    let infoDescEl: HTMLDivElement;
    let infoSubsEl: HTMLDivElement;

    const nodeEls = new Map<string, HTMLDivElement>();
    let openFlow = $state<string | null>('generate');

    function showInfo(id: string) {
        const n = NODES.find(x => x.id === id);
        const info = INFO[id];
        if (!n || !info) return;
        infoTitleEl.textContent = n.label;
        infoDescEl.textContent = info.desc;
        infoSubsEl.innerHTML = info.subs.map(s => `<span class="info-sub">${s}</span>`).join('');
        infoEl.style.display = 'block';
        infoEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function drawSVG(W: number) {
        svgEl.innerHTML = `<defs>
            <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M1 2L9 5L1 8" fill="none" stroke="#4a4a6a" stroke-width="1.5" stroke-linecap="round"/>
            </marker>
        </defs>`;

        function nodeH(id: string) { const el = nodeEls.get(id); return el ? el.offsetHeight : 52; }
        function bcx(id: string)   { const n = NODES.find(x => x.id === id); return n ? n.px * W : 0; }
        function bot(id: string)   { const n = NODES.find(x => x.id === id); return n ? n.py + nodeH(id) : 0; }
        function top(id: string)   { const n = NODES.find(x => x.id === id); return n ? n.py : 0; }

        function arrow(x1: number, y1: number, x2: number, y2: number) {
            const my = (y1 + y2) / 2;
            const d = Math.abs(x1 - x2) < 4
                ? `M${x1},${y1} L${x2},${y2}`
                : `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
            const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            p.setAttribute('d', d);
            p.setAttribute('fill', 'none');
            p.setAttribute('stroke', '#3a3a5a');
            p.setAttribute('stroke-width', '1');
            p.setAttribute('marker-end', 'url(#arr)');
            svgEl.appendChild(p);
        }

        CONNS.forEach(([a, b]) => arrow(bcx(a), bot(a), bcx(b), top(b)));
    }

    function build() {
        const W = canvasEl.offsetWidth;
        if (!W) { setTimeout(build, 100); return; }

        NODES.forEach(n => {
            const x = n.px * W - n.w / 2;
            const div = document.createElement('div');
            div.className = 'node';
            div.style.left  = x + 'px';
            div.style.top   = n.py + 'px';
            div.style.width = n.w + 'px';
            div.innerHTML = `<div class="node-label">${n.label}</div><div class="node-sub">${n.sub}</div>`;
            div.addEventListener('click', () => showInfo(n.id));
            canvasEl.appendChild(div);
            nodeEls.set(n.id, div);
        });

        drawSVG(W);
    }

    onMount(() => { build(); });
</script>

<div class="about-page">
    <div class="about-header">
        <h2 class="about-title">livn</h2>
        <div class="about-tagline">UI is a control panel — the backend runs the simulation</div>
    </div>

    <div class="about-body">

        <div class="section-label">Architecture <span class="section-hint">— click any node</span></div>
        <div bind:this={canvasEl} class="diagram-canvas">
            <svg bind:this={svgEl} class="diagram-svg"></svg>
        </div>

        <div bind:this={infoEl} class="detail-panel" style="display:none">
            <div class="detail-header">
                <div bind:this={infoTitleEl} class="detail-title"></div>
                <button class="detail-close" onclick={() => infoEl.style.display = 'none'}>✕</button>
            </div>
            <div bind:this={infoDescEl} class="detail-desc"></div>
            <div bind:this={infoSubsEl} class="detail-subs"></div>
        </div>

        <div class="section-label">Button flows</div>
        <div class="flows">
            {#each FLOWS as flow}
                <div class="flow">
                    <button
                        class="flow-header"
                        class:flow-open={openFlow === flow.id}
                        onclick={() => openFlow = openFlow === flow.id ? null : flow.id}
                    >
                        <span class="flow-title">{flow.title}</span>
                        <span class="flow-chevron">{openFlow === flow.id ? '▲' : '▼'}</span>
                    </button>
                    {#if openFlow === flow.id}
                        <div class="steps">
                            {#each flow.steps as s, i}
                                <div class="step">
                                    <div class="step-num">{i + 1}</div>
                                    <div class="step-content">
                                        <div class="step-title">{s.title}</div>
                                        <div class="step-body">{s.body}</div>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {/if}
                </div>
            {/each}
        </div>

    </div>
</div>

<style>
    .about-page {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #0d0d1a;
        overflow: hidden;
    }

    .about-header {
        display: flex;
        align-items: baseline;
        gap: 16px;
        padding: 14px 24px 10px;
        border-bottom: 1px solid #2a2a4a;
        flex-shrink: 0;
    }

    .about-title {
        font-size: 14px;
        font-weight: 700;
        color: #4fc3f7;
        margin: 0;
        letter-spacing: 0.08em;
    }

    .about-tagline {
        font-size: 12px;
        color: #444;
    }

    .about-body {
        flex: 1;
        overflow-y: auto;
        padding: 24px 28px 48px;
        display: flex;
        flex-direction: column;
        gap: 20px;
        max-width: 900px;
        width: 100%;
        margin: 0 auto;
        box-sizing: border-box;
    }

    .section-label {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: #4a4a6a;
        padding-bottom: 4px;
        border-bottom: 1px solid #1e1e38;
    }
    .section-hint {
        font-weight: 400;
        text-transform: none;
        letter-spacing: 0;
        color: #333;
    }

    .diagram-canvas {
        position: relative;
        width: 100%;
        height: 762px;
        flex-shrink: 0;
    }

    .diagram-svg {
        position: absolute;
        top: 0; left: 0;
        width: 100%; height: 100%;
        overflow: visible;
        pointer-events: none;
    }

    :global(.node) {
        position: absolute;
        background: #1a1a2e;
        border: 1px solid #2a2a4a;
        border-radius: 8px;
        padding: 8px 12px;
        cursor: pointer;
        transition: border-color 0.15s, background 0.15s;
    }
    :global(.node:hover) {
        border-color: #4fc3f7;
        background: #1e1e38;
    }
    :global(.node-label) {
        font-size: 13px;
        font-weight: 600;
        color: #e0e0e0;
    }
    :global(.node-sub) {
        font-size: 11px;
        color: #666;
        margin-top: 3px;
        line-height: 1.4;
    }

    .detail-panel {
        background: #111124;
        border: 1px solid #2a2a4a;
        border-radius: 8px;
        padding: 14px 16px;
        flex-shrink: 0;
    }
    .detail-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
    }
    .detail-title {
        font-size: 13px;
        font-weight: 600;
        color: #c8e6f8;
    }
    .detail-close {
        background: none;
        border: none;
        color: #444;
        font-size: 12px;
        cursor: pointer;
        padding: 2px 4px;
    }
    .detail-close:hover { color: #999; }
    .detail-desc {
        font-size: 12px;
        color: #888;
        line-height: 1.7;
        margin-bottom: 12px;
    }
    .detail-subs {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }
    :global(.info-sub) {
        background: #1a1a2e;
        border: 1px solid #2a2a4a;
        border-radius: 6px;
        padding: 4px 9px;
        font-size: 11px;
        color: #aaa;
    }

    .flows {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .flow {
        border: 1px solid #1e1e38;
        border-radius: 8px;
        overflow: hidden;
    }

    .flow-header {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        background: #0d0d1a;
        border: none;
        cursor: pointer;
        text-align: left;
        transition: background 0.12s;
    }
    .flow-header:hover { background: #111124; }
    .flow-header.flow-open { background: #111124; }

    .flow-title {
        font-size: 12px;
        font-weight: 600;
        color: #c8c8e0;
    }
    .flow-chevron {
        font-size: 9px;
        color: #444;
    }

    .steps {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 4px 0 8px;
        background: #0a0a18;
    }

    .step {
        display: flex;
        gap: 14px;
        align-items: flex-start;
        padding: 8px 14px;
        border-radius: 6px;
        transition: background 0.12s;
    }
    .step:hover { background: #111124; }

    .step-num {
        flex-shrink: 0;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: #1a1a2e;
        border: 1px solid #2a2a4a;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: 700;
        color: #4fc3f7;
        margin-top: 1px;
    }

    .step-title {
        font-size: 12px;
        font-weight: 600;
        color: #d0d0e0;
        margin-bottom: 2px;
    }
    .step-body {
        font-size: 12px;
        color: #777;
        line-height: 1.6;
    }
</style>
