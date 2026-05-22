<script lang="ts">
    import RecordingPicker from './RecordingPicker.svelte';
    import RecordingViewer from './RecordingViewer.svelte';
    import { activeRecording, clearActiveRecording, pyodideReady } from '$lib/stores';
</script>

<div class="recording-panel">
    {#if !$pyodideReady}
        <p class="init-msg">Initializing environment …</p>
    {:else if $activeRecording}
        <RecordingViewer recording={$activeRecording} onChangeRecording={clearActiveRecording} />
    {:else}
        <RecordingPicker />
    {/if}
</div>

<style>
    .recording-panel {
        display: flex;
        flex-direction: column;
        min-height: 0;
        height: 100%;
        background: #1a1a2e;
    }
    .recording-panel :global(.panel) {
        flex: 1;
        min-height: 0;
    }
    .init-msg {
        margin: 0;
        padding: 24px 16px;
        font-size: 13px;
        color: #888;
        font-style: italic;
        line-height: 1.5;
    }
</style>
