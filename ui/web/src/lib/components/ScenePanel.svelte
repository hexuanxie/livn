<script lang="ts">
    import { Canvas } from '@threlte/core';
    import EnvScene from './EnvScene.svelte';
    import Tooltip from './Tooltip.svelte';
    import { viewConfig, envSystem } from '$lib/stores';
    import { isBuiltinSystemId } from '$lib/cultureGeneration';

    interface Props {
        presetLabel?: string;
    }
    let { presetLabel = 'Environment' }: Props = $props();

    const config = $derived($viewConfig);
    const system = $derived($envSystem);

    let setupOpen = $state(false);
    let neuronInfoOpen = $state(false);

    const SHAPES: Record<string, string> = {
        EI1: 'Circular', EI2: 'Circular', CA1d: 'Rectangular',
    };

    function cultureShape(): string {
        if (!system) return '—';
        if (system.name === 'demo_culture' || isBuiltinSystemId(`builtin:${system.name}`)) return 'Rectangular';
        const base = system.name.split('/').pop() ?? system.name;
        return SHAPES[base] ?? 'Unknown';
    }

    function bboxDimensions(bb: Float64Array): string {
        return `${(bb[3] - bb[0]).toFixed(0)} × ${(bb[4] - bb[1]).toFixed(0)} × ${(bb[5] - bb[2]).toFixed(0)} µm`;
    }

    function popCounts(popCoords: Record<string, Float64Array>): string {
        return Object.entries(popCoords)
            .map(([pop, arr]) => `${pop}: ${arr.length / 4}`)
            .join(', ');
    }

    function sampleNeurons(popCoords: Record<string, Float64Array>, n = 10) {
        const out: Array<{ pop: string; gid: number; x: string; y: string; z: string }> = [];
        for (const [pop, arr] of Object.entries(popCoords)) {
            for (let i = 0; i < arr.length && out.length < n; i += 4) {
                out.push({
                    pop,
                    gid: Math.round(arr[i]),
                    x: arr[i + 1].toFixed(1),
                    y: arr[i + 2].toFixed(1),
                    z: arr[i + 3].toFixed(1),
                });
            }
        }
        return out;
    }

    const dimensions = $derived(system ? bboxDimensions(system.bounding_box) : '—');
    const counts = $derived(system ? popCounts(system.pop_coords) : '—');
    const neurons = $derived(system ? sampleNeurons(system.pop_coords) : []);

    function togglePop(pop: string) {
        viewConfig.update((vc) => ({
            ...vc,
            popVisibility: { ...vc.popVisibility, [pop]: !vc.popVisibility[pop] },
        }));
    }
    function setPointSize(e: Event) {
        const val = parseFloat((e.target as HTMLInputElement).value);
        viewConfig.update((vc) => ({ ...vc, pointSize: val }));
    }
    function setOpacity(e: Event) {
        const val = parseFloat((e.target as HTMLInputElement).value);
        viewConfig.update((vc) => ({ ...vc, opacity: val }));
    }
    function toggleBBox() {
        viewConfig.update((vc) => ({ ...vc, showBoundingBox: !vc.showBoundingBox }));
    }
    function toggleElectrodes() {
        viewConfig.update((vc) => ({ ...vc, showElectrodes: !vc.showElectrodes }));
    }
</script>

<div class="scene-panel">
    <Canvas><EnvScene /></Canvas>
    <Tooltip />

    {#if system}
        <div class="controls">
            <div class="control-group">
                <span class="control-label">Populations</span>
                {#each system.populations as pop (pop)}
                    <label class="toggle">
                        <input
                            type="checkbox"
                            checked={config.popVisibility[pop] ?? true}
                            onchange={() => togglePop(pop)}
                        />
                        {pop}
                    </label>
                {/each}
            </div>
            <div class="control-group">
                <label class="slider-label">
                    Size
                    <input type="range" min="0.2" max="3" step="0.1"
                        value={config.pointSize} oninput={setPointSize} />
                </label>
                <label class="slider-label">
                    Opacity
                    <input type="range" min="0.1" max="1" step="0.05"
                        value={config.opacity} oninput={setOpacity} />
                </label>
            </div>
            <div class="control-group">
                <label class="toggle">
                    <input type="checkbox" checked={config.showBoundingBox} onchange={toggleBBox} />
                    Bounding box
                </label>
                <label class="toggle">
                    <input type="checkbox" checked={config.showElectrodes} onchange={toggleElectrodes} />
                    Electrodes
                </label>
            </div>
        </div>
    {/if}

    <div class="info-overlay">
        <div class="info-section">
            <button class="info-hdr" onclick={() => (setupOpen = !setupOpen)}>
                Setup <span class="chevron" class:open={setupOpen}>▶</span>
            </button>
            {#if setupOpen}
                <div class="info-body">
                    <div class="info-row"><span>Env</span><span>{presetLabel}</span></div>
                    <div class="info-row"><span>Shape</span><span>{cultureShape()}</span></div>
                    <div class="info-row"><span>Dimensions</span><span>{dimensions}</span></div>
                    <div class="info-row"><span>Populations</span><span>{counts}</span></div>
                    {#if system}
                        <div class="info-row"><span>Total neurons</span><span>{system.num_neurons}</span></div>
                    {/if}
                </div>
            {/if}
        </div>
        <div class="info-section">
            <button class="info-hdr" onclick={() => (neuronInfoOpen = !neuronInfoOpen)}>
                Neuron Info <span class="chevron" class:open={neuronInfoOpen}>▶</span>
            </button>
            {#if neuronInfoOpen}
                <div class="info-body">
                    {#if neurons.length === 0}
                        <div class="info-empty">Load a system to see neuron data.</div>
                    {:else}
                        <table class="neuron-table">
                            <thead>
                                <tr><th>GID</th><th>Pop</th><th>x</th><th>y</th><th>z</th></tr>
                            </thead>
                            <tbody>
                                {#each neurons as n (n.gid)}
                                    <tr>
                                        <td>{n.gid}</td><td>{n.pop}</td>
                                        <td>{n.x}</td><td>{n.y}</td><td>{n.z}</td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                        {#if system && system.num_neurons > 10}
                            <div class="info-note">
                                Showing first 10 of {system.num_neurons} neurons
                            </div>
                        {/if}
                    {/if}
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    .scene-panel {
        position: relative;
        min-height: 0;
        height: 100%;
        background: #e8ecf2;
    }

    .controls {
        position: absolute;
        top: 8px;
        left: 8px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        background: rgba(26, 26, 46, 0.92);
        border: 1px solid #333;
        border-radius: 6px;
        padding: 8px 12px;
        font-size: 12px;
        z-index: 10;
    }
    .control-group { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .control-label { color: #888; font-weight: 600; }
    .toggle { display: flex; align-items: center; gap: 4px; cursor: pointer; color: #ccc; }
    .slider-label { display: flex; align-items: center; gap: 6px; color: #ccc; }
    .slider-label input[type='range'] { width: 80px; }

    .info-overlay {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 230px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        z-index: 10;
    }
    .info-section {
        background: rgba(13, 13, 26, 0.93);
        border: 1px solid #333;
        border-radius: 6px;
        overflow: hidden;
    }
    .info-hdr {
        width: 100%;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 7px 10px;
        background: none;
        border: none;
        color: #ccc;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        text-align: left;
    }
    .info-hdr:hover { background: rgba(255, 255, 255, 0.04); }
    .chevron { font-size: 9px; color: #666; transition: transform 0.15s; }
    .chevron.open { transform: rotate(90deg); }

    .info-body {
        padding: 0 10px 8px;
        max-height: 200px;
        overflow-y: auto;
    }
    .info-row {
        display: flex;
        justify-content: space-between;
        padding: 4px 0;
        font-size: 11px;
        border-bottom: 1px solid #1a1a2e;
    }
    .info-row:last-child { border-bottom: none; }
    .info-row span:first-child { color: #888; flex-shrink: 0; margin-right: 6px; }
    .info-row span:last-child { color: #e0e0e0; text-align: right; }
    .info-empty { font-size: 11px; color: #666; font-style: italic; padding: 4px 0; }
    .info-note { font-size: 10px; color: #666; text-align: center; padding-top: 4px; }

    .neuron-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 10px;
    }
    .neuron-table th {
        color: #666;
        font-weight: 600;
        padding: 2px 4px;
        border-bottom: 1px solid #2a2a4a;
        text-align: left;
    }
    .neuron-table td {
        color: #ccc;
        padding: 2px 4px;
        border-bottom: 1px solid #1a1a2e;
    }
    .neuron-table tr:last-child td { border-bottom: none; }
</style>
