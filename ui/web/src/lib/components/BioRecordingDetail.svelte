<script lang="ts">
    import SignalViewer from './SignalViewer.svelte';
    import type { BioRecording } from '$lib/types';

    let { recording, onBack }: { recording: BioRecording; onBack: () => void } = $props();

    let setupOpen = $state(false);
    let dataOpen  = $state(false);
</script>

<div class="detail">
    <!-- Header -->
    <div class="header">
        <button class="back" onclick={onBack}>← Back</button>
        <span class="title">{recording.name}</span>
        {#if recording.kind === 'builtin'}
            <span class="builtin-tag">built-in</span>
        {:else}
            <span class="user-tag">custom</span>
        {/if}
    </div>

    <!-- Signal viewer fills remaining height -->
    <div class="signal-area">
        <SignalViewer
            rec={recording.apiPath}
            totalDuration={recording.durS}
            totalChannels={recording.channels}
        />
    </div>

    <!-- Accordion panels -->
    <div class="panels">
        <div class="section">
            <button class="sec-hdr" onclick={() => (setupOpen = !setupOpen)}>
                <span>Setup</span>
                <span class="chevron" class:open={setupOpen}>▶</span>
            </button>
            {#if setupOpen}
                <div class="sec-body">
                    <div class="row"><span>Channels</span><span>{recording.channels}</span></div>
                    {#if recording.kind === 'user'}
                        <div class="row"><span>Path</span><span class="mono">{recording.apiPath}</span></div>
                    {/if}
                </div>
            {/if}
        </div>

        <div class="section">
            <button class="sec-hdr" onclick={() => (dataOpen = !dataOpen)}>
                <span>Data Info</span>
                <span class="chevron" class:open={dataOpen}>▶</span>
            </button>
            {#if dataOpen}
                <div class="sec-body">
                    <div class="row"><span>Recording date</span><span>{recording.date}</span></div>
                    <div class="row"><span>Duration</span><span>{recording.dur}</span></div>
                    {#if recording.protocol !== '—'}
                        <div class="row"><span>Protocol</span><span>{recording.protocol}</span></div>
                    {/if}
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    .detail { height: 100%; display: flex; flex-direction: column; overflow: hidden; }

    .header {
        display: flex; align-items: center; gap: 10px;
        padding: 10px 24px; border-bottom: 1px solid #333;
        background: #0d0d1a; flex-shrink: 0;
    }
    .back {
        background: none; border: 1px solid #444; color: #888;
        border-radius: 4px; padding: 3px 10px; font-size: 12px; cursor: pointer;
    }
    .back:hover { color: #ccc; border-color: #666; }
    .title { font-size: 15px; font-weight: 600; color: #e0e0e0; }

    .builtin-tag {
        font-size: 9px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
        background: #1a3a1a; border: 1px solid #66bb6a; color: #66bb6a;
        border-radius: 3px; padding: 2px 6px;
    }
    .user-tag {
        font-size: 9px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
        background: #1a2a3a; border: 1px solid #4fc3f7; color: #4fc3f7;
        border-radius: 3px; padding: 2px 6px;
    }

    .signal-area { flex: 1; min-height: 0; overflow: hidden; }

    /* Accordion panels */
    .panels {
        flex-shrink: 0;
        max-height: 220px;
        overflow-y: auto;
        border-top: 1px solid #2a2a4a;
    }
    .section { background: #0d0d1a; border-bottom: 1px solid #1a1a2e; }
    .sec-hdr {
        width: 100%; display: flex; justify-content: space-between; align-items: center;
        padding: 9px 16px; background: none; border: none;
        color: #e0e0e0; font-size: 12px; font-weight: 600; cursor: pointer; text-align: left;
    }
    .sec-hdr:hover { background: rgba(255,255,255,0.03); }
    .chevron { font-size: 9px; color: #555; transition: transform 0.15s; }
    .chevron.open { transform: rotate(90deg); }
    .sec-body { padding: 0 16px 10px; }
    .row {
        display: flex; justify-content: space-between; align-items: baseline;
        padding: 4px 0; font-size: 12px; border-bottom: 1px solid #1a1a2e;
    }
    .row:last-child { border-bottom: none; }
    .row span:first-child { color: #888; flex-shrink: 0; margin-right: 8px; }
    .row span:last-child  { color: #e0e0e0; text-align: right; word-break: break-all; }
    .mono { font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 11px; }
</style>
