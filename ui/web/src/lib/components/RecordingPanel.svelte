<script lang="ts">
    import ExperimentList from './ExperimentList.svelte';
    import ExperimentDataPanel from './ExperimentDataPanel.svelte';
    import BioRecordingList from './BioRecordingList.svelte';
    import SignalViewer from './SignalViewer.svelte';
    import {
        activeRecording,
        activeExperiment,
        envRightTab,
        selectedNeurons,
        selectedElectrode,
        activeExpRow,
        clearActiveRecording,
    } from '$lib/stores';
    import {
        loadBuiltinCulture,
        loadExpSystem,
        forceRefresh,
        isBuiltinExperiment,
    } from '$lib/pyodide';
    import type { Experiment, BioRecording } from '$lib/types';

    const recording = $derived($activeRecording);

    async function onExperimentSelect(exp: Experiment) {
        activeRecording.set({ kind: 'experiment', experiment: exp });
        activeExperiment.set(exp);
        envRightTab.set('recording');
        selectedNeurons.set([]);
        activeExpRow.set(0);
        selectedElectrode.set(null);

        const uri = exp.metadata?.system?.uri;
        const sysName = uri ? uri.replace(/\/$/, '').split('/').pop() : null;
        if (sysName) {
            try {
                if (isBuiltinExperiment(exp)) {
                    await loadBuiltinCulture();
                } else {
                    await loadExpSystem(sysName);
                    await forceRefresh();
                }
            } catch {
                /* ExperimentDataPanel shows warning if system fails */
            }
        }
    }

    function onBioSelect(rec: BioRecording) {
        activeRecording.set({ kind: 'bio', recording: rec });
        activeExperiment.set(null);
        envRightTab.set('recording');
        selectedNeurons.set([]);
        selectedElectrode.set(null);
    }

    const focusedChannel = $derived(
        recording?.kind === 'bio' && $selectedElectrode !== null
            ? Math.max(0, $selectedElectrode)
            : null
    );
</script>

<div class="recording-panel">
    {#if recording?.kind === 'experiment'}
        <div class="exp-wrap">
            <ExperimentDataPanel
                experiment={recording.experiment}
                onChangeRecording={clearActiveRecording}
            />
        </div>
    {:else if recording?.kind === 'bio'}
        <div class="bio-view">
            <div class="bio-header">
                <button class="change-btn" onclick={clearActiveRecording}>↩ Change recording</button>
                <span class="bio-title">{recording.recording.name}</span>
                {#if recording.recording.kind === 'builtin'}
                    <span class="tag builtin">built-in</span>
                {/if}
            </div>
            <p class="bio-hint">
                Click an electrode in the 3D view to focus its channel. Per-neuron spikes require a simulation dataset.
            </p>
            <div class="signal-wrap">
                <SignalViewer
                    rec={recording.recording.apiPath}
                    totalDuration={recording.recording.durS}
                    totalChannels={recording.recording.channels}
                    {focusedChannel}
                />
            </div>
        </div>
    {:else}
        <div class="picker">
            <p class="picker-intro">Load a simulation dataset or a biological recording to pair with the 3D environment.</p>
            <section class="picker-section">
                <h3 class="picker-heading">Simulation datasets</h3>
                <ExperimentList compact onSelect={onExperimentSelect} />
            </section>
            <section class="picker-section">
                <h3 class="picker-heading bio">Bio recordings</h3>
                <BioRecordingList compact onSelect={onBioSelect} />
            </section>
        </div>
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
    .exp-wrap {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }
    .exp-wrap :global(.panel) {
        flex: 1;
        min-height: 0;
    }

    .picker {
        flex: 1;
        overflow-y: auto;
        padding: 12px 0;
    }
    .picker-intro {
        font-size: 12px;
        color: #888;
        padding: 0 16px 12px;
        margin: 0;
        line-height: 1.45;
    }
    .picker-section {
        border-top: 1px solid #2a2a4a;
    }
    .picker-heading {
        font-size: 12px;
        font-weight: 700;
        color: #4fc3f7;
        margin: 0;
        padding: 10px 16px 4px;
        letter-spacing: 0.03em;
    }
    .picker-heading.bio { color: #66bb6a; }

    .bio-view {
        display: flex;
        flex-direction: column;
        min-height: 0;
        flex: 1;
    }
    .bio-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: #0d0d1a;
        border-bottom: 1px solid #333;
        flex-shrink: 0;
    }
    .change-btn {
        background: none;
        border: 1px solid #444;
        color: #888;
        font-size: 11px;
        padding: 4px 8px;
        border-radius: 3px;
        cursor: pointer;
    }
    .change-btn:hover { color: #ccc; border-color: #666; }
    .bio-title { font-weight: 700; color: #e0e0e0; font-size: 13px; }
    .tag.builtin {
        font-size: 9px;
        padding: 2px 6px;
        border-radius: 3px;
        background: #1a3a1a;
        border: 1px solid #66bb6a;
        color: #66bb6a;
    }
    .bio-hint {
        font-size: 11px;
        color: #666;
        margin: 0;
        padding: 8px 12px;
        border-bottom: 1px solid #2a2a4a;
    }
    .signal-wrap {
        flex: 1;
        min-height: 0;
        display: flex;
    }
    .signal-wrap :global(> *) {
        flex: 1;
        min-height: 0;
    }
</style>
