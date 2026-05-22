<script lang="ts">
    import RecordingPicker from './RecordingPicker.svelte';
    import RecordingViewer from './RecordingViewer.svelte';
    import EnvInitOverlay from './EnvInitOverlay.svelte';
    import { activeRecording, clearActiveRecording, pyodideReady } from '$lib/stores';
</script>

<div class="recording-panel">
    {#if $activeRecording}
        <RecordingViewer recording={$activeRecording} onChangeRecording={clearActiveRecording} />
    {:else}
        <RecordingPicker />
    {/if}

    {#if !$pyodideReady}
        <EnvInitOverlay />
    {/if}
</div>

<style>
    .recording-panel {
        position: relative;
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
</style>
