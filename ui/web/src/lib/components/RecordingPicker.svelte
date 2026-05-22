<script lang="ts">
    import {
        datasetLoading,
        datasetError,
        activeRecording,
        activeTrialIndex,
        envRightTab,
        recordingViewMode,
        selectedNeurons,
        selectedElectrode,
    } from '$lib/stores';
    import {
        BUILTIN_EXPERIMENTS,
        BUILTIN_BIO_RECORDINGS,
        experimentToRecording,
        bioToRecording,
        defaultViewMode,
        capabilityLabels,
    } from '$lib/recordingCatalog';
    import { loadRecordingWithSystem } from '$lib/recordingLoad';
    import type { BioRecording, Experiment } from '$lib/types';

    const FILE_SERVER = '';
    const LS_KEY = 'livn_bio_recordings';
    const BUILTIN_NAMES = new Set(BUILTIN_EXPERIMENTS.map(e => e.name));

    let serverExperiments = $state<Experiment[]>([]);
    let fetching = $state(true);
    let fetchError = $state<string | null>(null);
    let loadingId = $state<string | null>(null);
    let cardErrors = $state<Record<string, string>>({});

    let userRecordings = $state<BioRecording[]>(loadStored());
    let formOpen = $state(false);
    let pathInput = $state('');
    let nameInput = $state('');
    let durInput = $state('60');
    let chInput = $state('512');
    let pathError = $state('');

    function loadStored(): BioRecording[] {
        try {
            const raw = localStorage.getItem(LS_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    }

    function saveStored(recs: BioRecording[]) {
        localStorage.setItem(LS_KEY, JSON.stringify(recs));
    }

    $effect(() => {
        fetch(`${FILE_SERVER}/experiments`)
            .then(r => {
                if (r.status === 404) {
                    serverExperiments = [];
                    return;
                }
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.json();
            })
            .then(data => {
                if (data) serverExperiments = data;
                fetching = false;
            })
            .catch(e => {
                fetchError = e.message;
                fetching = false;
            });
    });

    const serverByRoot = $derived.by(() => {
        const map = new Map<string, Experiment[]>();
        for (const exp of serverExperiments) {
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

    function basename(p: string) {
        return p.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? p;
    }

    async function selectRecording(rec: ReturnType<typeof experimentToRecording>) {
        if (loadingId) return;
        loadingId = rec.id;
        datasetLoading.set(true);
        datasetError.set(null);
        cardErrors = { ...cardErrors, [rec.id]: '' };

        try {
            await loadRecordingWithSystem(rec);
            activeRecording.set(rec);
            activeTrialIndex.set(0);
            selectedNeurons.set([]);
            selectedElectrode.set(null);
            recordingViewMode.set(defaultViewMode(rec.capabilities));
            envRightTab.set('recording');
        } catch (e) {
            const msg = (e as Error).message;
            cardErrors = { ...cardErrors, [rec.id]: msg };
            datasetError.set(msg);
        } finally {
            loadingId = null;
            datasetLoading.set(false);
        }
    }

    async function selectExperiment(exp: Experiment) {
        await selectRecording(experimentToRecording(exp));
    }

    async function selectBio(bio: BioRecording) {
        await selectRecording(bioToRecording(bio));
    }

    function addRecording() {
        pathError = '';
        const path = pathInput.trim();
        if (!path) { pathError = 'Path is required.'; return; }
        if (userRecordings.some(r => r.apiPath === path)) {
            pathError = 'This path is already in the list.';
            return;
        }

        const durS = Math.max(1, parseFloat(durInput) || 60);
        const channels = Math.max(1, parseInt(chInput) || 512);
        const name = nameInput.trim() || basename(path);

        const rec: BioRecording = {
            id: `user-${Date.now()}`,
            name,
            date: '—',
            dur: `${durS} s`,
            durS,
            channels,
            kind: 'user',
            apiPath: path,
            protocol: '—',
        };

        userRecordings = [...userRecordings, rec];
        saveStored(userRecordings);
        pathInput = nameInput = '';
        durInput = '60';
        chInput = '512';
        formOpen = false;
    }

    function removeRecording(id: string) {
        userRecordings = userRecordings.filter(r => r.id !== id);
        saveStored(userRecordings);
    }
</script>

<div class="picker">
    <p class="picker-intro">
        Choose a simulation dataset or biological recording. View modes depend on what each recording supports.
    </p>

    <section class="section">
        <h3 class="section-heading">Simulated</h3>
        <div class="grid">
            {#each BUILTIN_EXPERIMENTS as exp (exp.name)}
                {@const rec = experimentToRecording(exp)}
                <button
                    type="button"
                    class="card"
                    class:loading={loadingId === rec.id}
                    onclick={() => selectExperiment(exp)}
                >
                    <div class="card-top">
                        <span class="card-name">{exp.name}</span>
                        <span class="tag sim">simulated</span>
                    </div>
                    <div class="chips">
                        {#each capabilityLabels(rec.capabilities) as chip}
                            <span class="chip">{chip}</span>
                        {/each}
                    </div>
                    <span class="meta">{rec.nTrials} trials · {rec.durationMs} ms</span>
                    {#if cardErrors[rec.id]}
                        <span class="err">{cardErrors[rec.id]}</span>
                    {/if}
                </button>
            {/each}
        </div>

        {#if fetching}
            <p class="state">Loading server experiments…</p>
        {:else if fetchError}
            <p class="state err">Server: {fetchError}</p>
        {:else}
            {#each serverByRoot.entries() as [root, exps] (root)}
                <p class="subheading">{rootLabel(root)}</p>
                <div class="grid">
                    {#each exps as exp (exp.path)}
                        {@const rec = experimentToRecording(exp)}
                        <button
                            type="button"
                            class="card"
                            class:loading={loadingId === rec.id}
                            onclick={() => selectExperiment(exp)}
                        >
                            <div class="card-top">
                                <span class="card-name">{exp.name}</span>
                                <span class="tag sim">simulated</span>
                            </div>
                            <div class="chips">
                                {#each capabilityLabels(rec.capabilities) as chip}
                                    <span class="chip">{chip}</span>
                                {/each}
                            </div>
                            <span class="meta">{rec.nTrials} trials</span>
                            {#if cardErrors[rec.id]}
                                <span class="err">{cardErrors[rec.id]}</span>
                            {/if}
                        </button>
                    {/each}
                </div>
            {/each}
        {/if}
    </section>

    <section class="section">
        <div class="section-row">
            <h3 class="section-heading acq">Acquired</h3>
            <button type="button" class="add-btn" onclick={() => (formOpen = !formOpen)}>
                {formOpen ? '✕ Cancel' : '+ Add'}
            </button>
        </div>

        {#if formOpen}
            <div class="form-card">
                <label>API path <input bind:value={pathInput} placeholder="demo/neural1" /></label>
                <label>Name <input bind:value={nameInput} placeholder="optional" /></label>
                <label>Duration (s) <input bind:value={durInput} type="number" min="1" /></label>
                <label>Channels <input bind:value={chInput} type="number" min="1" /></label>
                {#if pathError}<span class="err">{pathError}</span>{/if}
                <button type="button" class="save-btn" onclick={addRecording}>Save</button>
            </div>
        {/if}

        <div class="grid">
            {#each BUILTIN_BIO_RECORDINGS as bio (bio.id)}
                {@const rec = bioToRecording(bio)}
                <button
                    type="button"
                    class="card acq-card"
                    class:loading={loadingId === rec.id}
                    onclick={() => selectBio(bio)}
                >
                    <div class="card-top">
                        <span class="card-name">{bio.name}</span>
                        <span class="tag acq">acquired</span>
                    </div>
                    <div class="chips">
                        {#each capabilityLabels(rec.capabilities) as chip}
                            <span class="chip">{chip}</span>
                        {/each}
                    </div>
                    <span class="meta">{bio.dur} · {bio.channels} ch</span>
                    {#if cardErrors[rec.id]}
                        <span class="err">{cardErrors[rec.id]}</span>
                    {/if}
                </button>
            {/each}

            {#each userRecordings as bio (bio.id)}
                {@const rec = bioToRecording(bio)}
                <div class="card-wrap">
                    <button
                        type="button"
                        class="card acq-card"
                        class:loading={loadingId === rec.id}
                        onclick={() => selectBio(bio)}
                    >
                        <div class="card-top">
                            <span class="card-name">{bio.name}</span>
                            <span class="tag acq">acquired</span>
                        </div>
                        <div class="chips">
                            {#each capabilityLabels(rec.capabilities) as chip}
                                <span class="chip">{chip}</span>
                            {/each}
                        </div>
                        <span class="meta mono">{bio.apiPath}</span>
                        {#if cardErrors[rec.id]}
                            <span class="err">{cardErrors[rec.id]}</span>
                        {/if}
                    </button>
                    <button type="button" class="remove-btn" onclick={() => removeRecording(bio.id)} title="Remove">×</button>
                </div>
            {/each}
        </div>
    </section>
</div>

<style>
    .picker {
        flex: 1;
        overflow-y: auto;
        padding: 12px 16px 24px;
    }
    .picker-intro {
        font-size: 12px;
        color: #888;
        margin: 0 0 16px;
        line-height: 1.45;
    }
    .section { margin-bottom: 20px; }
    .section-heading {
        font-size: 12px;
        font-weight: 700;
        color: #4fc3f7;
        margin: 0 0 10px;
        letter-spacing: 0.03em;
    }
    .section-heading.acq { color: #66bb6a; }
    .section-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
    }
    .section-row .section-heading { margin: 0; }
    .subheading {
        font-size: 11px;
        color: #666;
        margin: 12px 0 6px;
    }
    .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 10px;
    }
    .card {
        text-align: left;
        background: #16162a;
        border: 1px solid #333;
        border-radius: 8px;
        padding: 12px;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: 6px;
        color: inherit;
        font: inherit;
        width: 100%;
    }
    .card:hover { border-color: #66bb6a; background: #162216; }
    .acq-card:hover { border-color: #66bb6a; }
    .card.loading { opacity: 0.5; pointer-events: none; }
    .card-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
    }
    .card-name { font-weight: 600; color: #e0e0e0; font-size: 13px; }
    .tag {
        font-size: 8px;
        padding: 2px 5px;
        border-radius: 3px;
        text-transform: uppercase;
        flex-shrink: 0;
    }
    .tag.sim { background: #1a2a3a; color: #4fc3f7; border: 1px solid #4fc3f7; }
    .tag.acq { background: #1a3a1a; color: #66bb6a; border: 1px solid #66bb6a; }
    .chips { display: flex; flex-wrap: wrap; gap: 4px; }
    .chip {
        font-size: 9px;
        padding: 1px 5px;
        border-radius: 3px;
        background: #0d0d1a;
        border: 1px solid #444;
        color: #888;
    }
    .meta { font-size: 10px; color: #555; }
    .meta.mono { font-family: monospace; word-break: break-all; }
    .err { font-size: 10px; color: #ef5350; }
    .state { font-size: 12px; color: #666; font-style: italic; }
    .state.err { color: #ef5350; font-style: normal; }
    .add-btn {
        background: none;
        border: 1px solid #444;
        color: #888;
        font-size: 11px;
        padding: 4px 8px;
        border-radius: 3px;
        cursor: pointer;
    }
    .add-btn:hover { color: #ccc; }
    .form-card {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 12px;
        margin-bottom: 10px;
        background: #16162a;
        border: 1px solid #333;
        border-radius: 6px;
        font-size: 11px;
    }
    .form-card label { display: flex; flex-direction: column; gap: 4px; color: #888; }
    .form-card input {
        background: #0d0d1a;
        border: 1px solid #444;
        color: #ccc;
        padding: 6px 8px;
        border-radius: 3px;
    }
    .save-btn {
        align-self: flex-start;
        background: #1a3a1a;
        border: 1px solid #66bb6a;
        color: #66bb6a;
        padding: 6px 12px;
        border-radius: 3px;
        cursor: pointer;
    }
    .card-wrap { position: relative; }
    .remove-btn {
        position: absolute;
        top: 6px;
        right: 6px;
        background: #2a1a1a;
        border: 1px solid #664444;
        color: #ef5350;
        width: 20px;
        height: 20px;
        border-radius: 3px;
        cursor: pointer;
        font-size: 12px;
        line-height: 1;
        padding: 0;
    }
</style>
