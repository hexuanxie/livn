<script lang="ts">
    import { datasetLoading, datasetError } from '$lib/stores';
    import { loadHFDataset } from '$lib/pyodide';
    import type { Experiment } from '$lib/types';

    const FILE_SERVER = '';

    interface Props { onSelect?: (exp: Experiment) => void; }
    let { onSelect }: Props = $props();

    // Built-in experiments always shown regardless of server state
    const BUILTIN_EXPERIMENTS: Experiment[] = [
        {
            name: 'EI1_spikes',
            root: 'built-in',
            path: '/Users/hexuan/Work/livn/livn_experiments/EI1_spikes',
            created_at: null,
            n_shards: 3,
            metadata: {
                duration: 1000,
                system: { uri: './systems/graphs/EI1', populations: ['EXC', 'INH'], n_neurons: 10 },
                model: 'ReducedCalciumSomaDendrite',
                recording: { spikes: true, voltages: false, membrane_currents: true },
            },
        },
    ];
    const BUILTIN_NAMES = new Set(BUILTIN_EXPERIMENTS.map(e => e.name));

    let experiments  = $state<Experiment[]>([]);
    let fetching     = $state(true);
    let fetchError   = $state<string | null>(null);
    let loadingPath  = $state<string | null>(null);
    let cardErrors   = $state<Record<string, string>>({});

    $effect(() => {
        fetch(`${FILE_SERVER}/experiments`)
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(data => { experiments = data; fetching = false; })
            .catch(e  => { fetchError = e.message; fetching = false; });
    });

    // Group by root, excluding built-ins (shown separately)
    const byRoot = $derived.by(() => {
        const map = new Map<string, Experiment[]>();
        for (const exp of experiments) {
            if (BUILTIN_NAMES.has(exp.name)) continue;
            const list = map.get(exp.root) ?? [];
            list.push(exp);
            map.set(exp.root, list);
        }
        return map;
    });

    function rootLabel(root: string): string {
        return root.split('/').filter(Boolean).pop() ?? root;
    }

    function systemLabel(meta: ExpMeta | null): string {
        if (!meta?.system) return '—';
        const sys = meta.system;
        if (sys.uri) {
            const base = sys.uri.split('/').pop() ?? sys.uri;
            return base.replace(/\.h5$/i, '');
        }
        if (sys.populations?.length) return sys.populations.join(' · ');
        return '—';
    }

    function neuronCount(meta: ExpMeta | null): string {
        const n = meta?.system?.n_neurons;
        return n != null ? `${n.toLocaleString()} neurons` : '';
    }

    function modelLabel(meta: ExpMeta | null): string {
        return meta?.model ?? '—';
    }

    function encodingLabel(meta: ExpMeta | null): string {
        if (!meta?.encoding) return '—';
        const enc = meta.encoding;
        const kind  = enc.kind  as string | undefined;
        const freq  = enc.freq_hz as number | undefined;
        if (kind && freq != null) return `${kind} · ${freq} Hz`;
        if (kind) return kind;
        const entries = Object.entries(enc).slice(0, 2).map(([k, v]) => `${k}: ${v}`);
        return entries.join(', ') || '—';
    }

    function formatDate(iso: string | null): string {
        if (!iso) return '';
        return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }

    async function selectExperiment(exp: Experiment) {
        if (loadingPath) return;
        loadingPath = exp.path;
        datasetLoading.set(true);
        datasetError.set(null);
        cardErrors = { ...cardErrors, [exp.path]: '' };

        try {
            await loadHFDataset(exp.name, exp.path, FILE_SERVER);
            onSelect?.(exp);
        } catch (e) {
            const msg = (e as Error).message;
            cardErrors = { ...cardErrors, [exp.path]: msg };
            datasetError.set(msg);
        } finally {
            loadingPath = null;
            datasetLoading.set(false);
        }
    }
</script>

<div class="exp-list">
    <h2>Simulation Experiments</h2>

    <!-- Built-in experiments -->
    <div class="root-group">
        <div class="root-header">
            <span class="root-name builtin-label">built-in</span>
        </div>
        <div class="grid">
            {#each BUILTIN_EXPERIMENTS as exp (exp.name)}
                <div
                    class="card builtin"
                    class:loading={loadingPath === exp.path}
                    role="button"
                    tabindex="0"
                    onclick={() => selectExperiment(exp)}
                    onkeydown={(e) => e.key === 'Enter' && selectExperiment(exp)}
                >
                    <div class="card-name-row">
                        <span class="card-name">{exp.name}</span>
                        <span class="builtin-badge">built-in</span>
                    </div>

                    <div class="card-rows">
                        <div class="row">
                            <span class="row-label">System</span>
                            <span class="row-val">{systemLabel(exp.metadata)}</span>
                        </div>
                        {#if neuronCount(exp.metadata)}
                            <div class="row">
                                <span class="row-label">Neurons</span>
                                <span class="row-val">{neuronCount(exp.metadata)}</span>
                            </div>
                        {/if}
                        <div class="row">
                            <span class="row-label">Model</span>
                            <span class="row-val">{modelLabel(exp.metadata)}</span>
                        </div>
                    </div>

                    <div class="card-footer">
                        <span class="tag">{exp.n_shards} {exp.n_shards === 1 ? 'shard' : 'shards'}</span>
                    </div>
                    {#if cardErrors[exp.path]}
                        <div class="card-error">{cardErrors[exp.path]}</div>
                    {/if}
                </div>
            {/each}
        </div>
    </div>

    <!-- Server-fetched experiments -->
    {#if fetching}
        <div class="state-msg">Loading…</div>
    {:else if fetchError}
        <div class="state-msg error">Could not reach server: {fetchError}</div>
    {:else if byRoot.size > 0}
        {#each byRoot.entries() as [root, exps] (root)}
            <div class="root-group">
                <div class="root-header">
                    <span class="root-name">{rootLabel(root)}</span>
                    <span class="root-path">{root}</span>
                </div>
                <div class="grid">
                    {#each exps as exp (exp.path)}
                        <div
                            class="card"
                            class:loading={loadingPath === exp.path}
                            role="button"
                            tabindex="0"
                            onclick={() => selectExperiment(exp)}
                            onkeydown={(e) => e.key === 'Enter' && selectExperiment(exp)}
                        >
                            <div class="card-name">{exp.name}</div>

                            <div class="card-rows">
                                <div class="row">
                                    <span class="row-label">System</span>
                                    <span class="row-val">{systemLabel(exp.metadata)}</span>
                                </div>
                                {#if neuronCount(exp.metadata)}
                                    <div class="row">
                                        <span class="row-label">Neurons</span>
                                        <span class="row-val">{neuronCount(exp.metadata)}</span>
                                    </div>
                                {/if}
                                <div class="row">
                                    <span class="row-label">Model</span>
                                    <span class="row-val">{modelLabel(exp.metadata)}</span>
                                </div>
                                <div class="row">
                                    <span class="row-label">Stimulus</span>
                                    <span class="row-val">{encodingLabel(exp.metadata)}</span>
                                </div>
                            </div>

                            <div class="card-footer">
                                <span class="tag">{exp.n_shards} {exp.n_shards === 1 ? 'shard' : 'shards'}</span>
                                {#if exp.created_at}
                                    <span class="date">{formatDate(exp.created_at)}</span>
                                {/if}
                            </div>
                            {#if cardErrors[exp.path]}
                                <div class="card-error">{cardErrors[exp.path]}</div>
                            {/if}
                        </div>
                    {/each}
                </div>
            </div>
        {/each}
    {/if}
</div>

<style>
    .exp-list {
        padding: 32px;
        overflow-y: auto;
        height: 100%;
        box-sizing: border-box;
    }

    h2 {
        font-size: 18px;
        font-weight: 600;
        color: #e0e0e0;
        margin-bottom: 24px;
    }

    /* ── State messages ── */
    .state-msg {
        font-size: 13px;
        color: #666;
        font-style: italic;
    }
    .state-msg.error { color: #ef5350; font-style: normal; }
    .state-msg.muted { color: #555; }

    /* ── Root group ── */
    .root-group { margin-bottom: 32px; }

    .root-header {
        display: flex;
        align-items: baseline;
        gap: 10px;
        margin-bottom: 12px;
        padding-bottom: 6px;
        border-bottom: 1px solid #2a2a4a;
    }
    .root-name {
        font-size: 13px;
        font-weight: 700;
        color: #66bb6a;
        letter-spacing: 0.03em;
    }
    .root-path {
        font-size: 10px;
        color: #444;
        font-family: monospace;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    /* ── Card grid ── */
    .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 14px;
    }

    .card {
        background: #16162a;
        border: 1px solid #333;
        border-radius: 8px;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        transition: border-color 0.15s, background 0.15s;
        cursor: pointer;
    }
    .card:hover {
        border-color: #66bb6a;
        background: #162216;
    }
    .card.builtin         { border-color: #2a4a2a; }
    .card.builtin:hover   { border-color: #66bb6a; background: #162216; }
    .card.loading { opacity: 0.55; pointer-events: none; }
    .card-error   { font-size: 10px; color: #ef5350; margin-top: 4px; }

    .card-name-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 8px;
    }
    .builtin-badge {
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        background: #1a3a1a;
        border: 1px solid #66bb6a;
        color: #66bb6a;
        border-radius: 3px;
        padding: 2px 6px;
        flex-shrink: 0;
        margin-top: 3px;
        white-space: nowrap;
    }
    .builtin-label { color: #66bb6a; }

    .card-name {
        font-size: 18px;
        font-weight: 700;
        color: #66bb6a;
        word-break: break-all;
    }

    /* ── Metadata rows ── */
    .card-rows {
        display: flex;
        flex-direction: column;
        gap: 5px;
        flex: 1;
    }
    .row {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        font-size: 11px;
    }
    .row-label {
        color: #666;
        flex-shrink: 0;
        width: 52px;
    }
    .row-val {
        color: #ccc;
        text-align: right;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    /* ── Footer ── */
    .card-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 2px;
    }
    .tag {
        display: inline-block;
        background: #1a2a1a;
        border: 1px solid #66bb6a;
        color: #66bb6a;
        font-size: 10px;
        border-radius: 3px;
        padding: 2px 7px;
    }
    .date {
        font-size: 10px;
        color: #444;
    }
</style>
