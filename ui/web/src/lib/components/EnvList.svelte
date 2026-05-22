<script lang="ts">
    import { ENV_PRESETS } from '$lib/envPresets';
    import { DEFAULT_CULTURE_SPEC } from '$lib/cultureGeneration';
    import type { EnvPreset } from '$lib/types';

    let { onSelect }: { onSelect: (preset: EnvPreset) => void | Promise<void> } = $props();

    let loadingId = $state<string | null>(null);
    let cardError = $state<string | null>(null);

    async function select(preset: EnvPreset) {
        if (loadingId) return;
        loadingId = preset.id;
        cardError = null;
        try {
            await onSelect(preset);
        } catch (e) {
            cardError = (e as Error).message;
        } finally {
            loadingId = null;
        }
    }

    const neuronLabel = $derived(
        `${DEFAULT_CULTURE_SPEC.totalNeurons.toLocaleString()} neurons · ${DEFAULT_CULTURE_SPEC.meaPitch} µm MEA`
    );
</script>

<div class="list">
    <h2>Environments</h2>
    <p class="hint">Select an environment to open the 3D scene. Load datasets from the Recording tab.</p>

    <div class="grid">
        {#each ENV_PRESETS as preset (preset.id)}
            <button
                class="card"
                class:loading={loadingId === preset.id}
                onclick={() => select(preset)}
            >
                <div class="card-name-row">
                    <span class="card-name">{preset.name}</span>
                    <span class="badge">built-in</span>
                </div>
                <div class="card-desc">{preset.description}</div>
                {#if preset.id === 'demo-default'}
                    <div class="card-meta">{neuronLabel}</div>
                {/if}
            </button>
        {/each}
    </div>

    {#if cardError}
        <div class="card-error">{cardError}</div>
    {/if}
</div>

<style>
    .list {
        padding: 32px;
        overflow-y: auto;
        height: 100%;
        box-sizing: border-box;
    }
    h2 {
        font-size: 18px;
        font-weight: 600;
        color: #e0e0e0;
        margin-bottom: 8px;
    }
    .hint {
        font-size: 12px;
        color: #666;
        margin: 0 0 24px;
        max-width: 520px;
        line-height: 1.45;
    }
    .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: 16px;
    }
    .card {
        background: #16162a;
        border: 1px solid #2a4a2a;
        border-radius: 8px;
        padding: 20px 16px;
        text-align: left;
        cursor: pointer;
        color: inherit;
        font-family: inherit;
        transition: border-color 0.15s, background 0.15s;
    }
    .card:hover { border-color: #66bb6a; background: #162216; }
    .card.loading { opacity: 0.55; pointer-events: none; }
    .card-name-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 8px;
        margin-bottom: 8px;
    }
    .card-name { font-size: 20px; font-weight: 700; color: #66bb6a; }
    .badge {
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        background: #1a3a1a;
        border: 1px solid #66bb6a;
        color: #66bb6a;
        border-radius: 3px;
        padding: 2px 6px;
    }
    .card-desc { font-size: 12px; color: #aaa; margin-bottom: 8px; line-height: 1.4; }
    .card-meta { font-size: 10px; color: #666; }
    .card-error { font-size: 11px; color: #ef5350; margin-top: 12px; }
</style>
