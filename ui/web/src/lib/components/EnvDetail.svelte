<script lang="ts">
    import ScenePanel from './ScenePanel.svelte';
    import Console from './Console.svelte';
    import RecordingPanel from './RecordingPanel.svelte';
    import { envRightTab } from '$lib/stores';
    import type { EnvPreset } from '$lib/types';

    interface Props {
        preset: EnvPreset;
        onBack: () => void;
    }
    let { preset, onBack }: Props = $props();

    const rightTab = $derived($envRightTab);

    function setTab(tab: 'console' | 'recording') {
        envRightTab.set(tab);
    }
</script>

<div class="env-detail">
    <ScenePanel presetLabel={preset.name} />

    <div class="right-panel">
        <div class="tab-bar">
            <button
                class="tab"
                class:active={rightTab === 'console'}
                onclick={() => setTab('console')}
            >Console</button>
            <button
                class="tab"
                class:active={rightTab === 'recording'}
                onclick={() => setTab('recording')}
            >Recording</button>
            <button class="list-btn" onclick={onBack}>← Environments</button>
        </div>

        <div class="tab-body">
            {#if rightTab === 'console'}
                <Console />
            {:else}
                <RecordingPanel />
            {/if}
        </div>
    </div>
</div>

<style>
    .env-detail {
        flex: 1;
        display: grid;
        grid-template-columns: 2fr 1fr;
        min-height: 0;
        overflow: hidden;
    }

    .right-panel {
        display: flex;
        flex-direction: column;
        min-height: 0;
        background: #1a1a2e;
        border-left: 1px solid #333;
    }

    .tab-bar {
        display: flex;
        align-items: center;
        gap: 0;
        background: #0d0d1a;
        border-bottom: 1px solid #333;
        flex-shrink: 0;
    }
    .tab {
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        color: #777;
        font-size: 12px;
        font-weight: 600;
        padding: 8px 14px;
        cursor: pointer;
    }
    .tab:hover { color: #bbb; }
    .tab.active {
        color: #4fc3f7;
        border-bottom-color: #4fc3f7;
    }
    .list-btn {
        margin-left: auto;
        margin-right: 8px;
        background: none;
        border: 1px solid #444;
        color: #888;
        font-size: 11px;
        padding: 4px 8px;
        border-radius: 3px;
        cursor: pointer;
    }
    .list-btn:hover { color: #ccc; border-color: #666; }

    .tab-body {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }
    .tab-body :global(.console) {
        flex: 1;
        min-height: 0;
    }
</style>
