<script lang="ts">
    import { BUILTIN_SYSTEM_ID, DEFAULT_CULTURE_SPEC } from '$lib/cultureGeneration';

    interface SystemCard {
        id: string;
        name: string;
        desc: string;
        pops: string;
    }

    const BUILTIN_SYSTEM: SystemCard = {
        id: BUILTIN_SYSTEM_ID,
        name: 'Demo Culture',
        desc: '2D E/I culture generated in-browser (Build tab defaults)',
        pops: 'EXC, INH',
    };

    /** Hugging Face predefined systems — hidden while Demo Culture is the default entry point. */
    const SHOW_PREDEFINED = false;

    const PREDEFINED_SYSTEMS: SystemCard[] = [
        { id: 'EI1',  name: 'EI1',  desc: 'Excitatory-Inhibitory network, type 1', pops: 'EXC, INH' },
        { id: 'EI2',  name: 'EI2',  desc: 'Excitatory-Inhibitory network, type 2', pops: 'EXC, INH' },
        { id: 'CA1d', name: 'CA1d', desc: 'CA1 pyramidal layer, dorsal',            pops: 'PYR, INT' },
    ];

    let { onSelect }: { onSelect: (system: string) => void | Promise<void> } = $props();

    let loadingId = $state<string | null>(null);
    let cardError = $state<string | null>(null);

    async function select(card: SystemCard) {
        if (loadingId) return;
        loadingId = card.id;
        cardError = null;
        try {
            await onSelect(card.id);
        } catch (e) {
            cardError = (e as Error).message;
        } finally {
            loadingId = null;
        }
    }

    const builtinNeuronLabel = $derived(
        `${DEFAULT_CULTURE_SPEC.totalNeurons.toLocaleString()} neurons · ${DEFAULT_CULTURE_SPEC.meaPitch} µm MEA pitch`
    );
</script>

<div class="list">
    <h2>Neural Systems</h2>

    <div class="section">
        <div class="section-header">
            <span class="section-name builtin-label">built-in</span>
        </div>
        <div class="grid">
            <button
                class="card builtin"
                class:loading={loadingId === BUILTIN_SYSTEM.id}
                onclick={() => select(BUILTIN_SYSTEM)}
            >
                <div class="card-name-row">
                    <span class="card-name">{BUILTIN_SYSTEM.name}</span>
                    <span class="builtin-badge">built-in</span>
                </div>
                <div class="card-desc">{BUILTIN_SYSTEM.desc}</div>
                <div class="card-meta">{builtinNeuronLabel}</div>
                <div class="card-tag">{BUILTIN_SYSTEM.pops}</div>
            </button>
        </div>
        {#if cardError && loadingId === null}
            <div class="card-error">{cardError}</div>
        {/if}
    </div>

    {#if SHOW_PREDEFINED}
        <div class="section">
            <div class="section-header">
                <span class="section-name">predefined</span>
                <span class="section-hint">downloads from Hugging Face</span>
            </div>
            <div class="grid">
                {#each PREDEFINED_SYSTEMS as sys (sys.id)}
                    <button
                        class="card"
                        class:loading={loadingId === sys.id}
                        onclick={() => select(sys)}
                    >
                        <div class="card-name">{sys.name}</div>
                        <div class="card-desc">{sys.desc}</div>
                        <div class="card-tag">{sys.pops}</div>
                    </button>
                {/each}
            </div>
        </div>
    {/if}
</div>

<style>
    .list { padding: 32px; overflow-y: auto; height: 100%; box-sizing: border-box; }
    h2 { font-size: 18px; font-weight: 600; color: #e0e0e0; margin-bottom: 24px; }

    .section { margin-bottom: 28px; }
    .section-header {
        display: flex;
        align-items: baseline;
        gap: 10px;
        margin-bottom: 12px;
        padding-bottom: 6px;
        border-bottom: 1px solid #2a2a4a;
    }
    .section-name {
        font-size: 13px;
        font-weight: 700;
        color: #4fc3f7;
        letter-spacing: 0.03em;
    }
    .section-name.builtin-label { color: #66bb6a; }
    .section-hint {
        font-size: 10px;
        color: #555;
        font-style: italic;
    }

    .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 16px;
    }
    .card {
        background: #16162a;
        border: 1px solid #333;
        border-radius: 8px;
        padding: 20px 16px;
        text-align: left;
        cursor: pointer;
        color: inherit;
        font-family: inherit;
        transition: border-color 0.15s, background 0.15s;
    }
    .card:hover { border-color: #4fc3f7; background: #1e1e3a; }
    .card.builtin { border-color: #2a4a2a; }
    .card.builtin:hover { border-color: #66bb6a; background: #162216; }
    .card.loading { opacity: 0.55; pointer-events: none; }
    .card-name-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 8px;
        margin-bottom: 8px;
    }
    .card-name { font-size: 22px; font-weight: 700; color: #4fc3f7; }
    .card.builtin .card-name { color: #66bb6a; }
    .card-desc { font-size: 12px; color: #aaa; margin-bottom: 8px; }
    .card-meta { font-size: 10px; color: #666; margin-bottom: 12px; }
    .card-tag {
        display: inline-block;
        background: #112238;
        border: 1px solid #4fc3f7;
        color: #4fc3f7;
        font-size: 10px;
        border-radius: 3px;
        padding: 2px 7px;
    }
    .card.builtin .card-tag {
        background: #1a2a1a;
        border-color: #66bb6a;
        color: #66bb6a;
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
    }
    .card-error { font-size: 11px; color: #ef5350; margin-top: 8px; }
</style>
