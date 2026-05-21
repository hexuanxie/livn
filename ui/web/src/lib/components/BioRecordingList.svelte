<script lang="ts">
    import type { BioRecording } from '$lib/types';

    let { onSelect }: { onSelect: (rec: BioRecording) => void } = $props();

    const BUILTIN: BioRecording[] = [
        {
            id: 'demo-neural1',
            name: 'Demo Recording',
            date: '—',
            dur: '1 min 0 s',
            durS: 60,
            channels: 512,
            kind: 'builtin',
            apiPath: 'demo/neural1',
            protocol: 'LFP (θ 8 Hz + γ 40 Hz) + TTL stim @ 1 Hz',
        },
    ];

    // ── User recordings (persisted to localStorage) ───────────────────────
    const LS_KEY = 'livn_bio_recordings';

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

    let userRecordings = $state<BioRecording[]>(loadStored());

    // ── Add-recording form ────────────────────────────────────────────────
    let formOpen    = $state(false);
    let pathInput   = $state('');
    let nameInput   = $state('');
    let durInput    = $state('60');
    let chInput     = $state('512');
    let pathError   = $state('');

    function basename(p: string) {
        return p.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? p;
    }

    function addRecording() {
        pathError = '';
        const path = pathInput.trim();
        if (!path) { pathError = 'Path is required.'; return; }
        if (userRecordings.some(r => r.apiPath === path)) {
            pathError = 'This path is already in the list.'; return;
        }

        const durS     = Math.max(1, parseFloat(durInput) || 60);
        const channels = Math.max(1, parseInt(chInput) || 512);
        const name     = nameInput.trim() || basename(path);

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

        // reset form
        pathInput = nameInput = '';
        durInput  = '60';
        chInput   = '512';
        formOpen  = false;
    }

    function removeRecording(id: string) {
        userRecordings = userRecordings.filter(r => r.id !== id);
        saveStored(userRecordings);
    }
</script>

<div class="list">
    <div class="list-header">
        <h2>Biological Recordings</h2>
        <button class="add-btn" onclick={() => (formOpen = !formOpen)}>
            {formOpen ? '✕ Cancel' : '+ Add Recording'}
        </button>
    </div>

    {#if formOpen}
        <div class="form-card">
            <div class="form-title">Add a recording from disk</div>
            <div class="form-hint">
                Enter the path to your recording folder, relative to the <code>bio_data/</code> directory.<br />
                Example: <code>my_subject/session1</code>
            </div>

            <div class="field">
                <label for="rec-path">Recording path <span class="required">*</span></label>
                <input
                    id="rec-path"
                    type="text"
                    placeholder="subject/session"
                    bind:value={pathInput}
                    onkeydown={(e) => e.key === 'Enter' && addRecording()}
                />
                {#if pathError}<div class="field-error">{pathError}</div>{/if}
            </div>

            <div class="form-row">
                <div class="field">
                    <label for="rec-name">Display name</label>
                    <input id="rec-name" type="text" placeholder="Auto from path" bind:value={nameInput} />
                </div>
                <div class="field field-sm">
                    <label for="rec-dur">Duration (s)</label>
                    <input id="rec-dur" type="number" min="1" bind:value={durInput} />
                </div>
                <div class="field field-sm">
                    <label for="rec-ch">Channels</label>
                    <input id="rec-ch" type="number" min="1" bind:value={chInput} />
                </div>
            </div>

            <div class="form-actions">
                <button class="submit-btn" onclick={addRecording}>Add</button>
            </div>
        </div>
    {/if}

    <div class="grid">
        {#each BUILTIN as rec (rec.id)}
            <button class="card builtin" onclick={() => onSelect(rec)}>
                <div class="card-header">
                    <div class="card-name">{rec.name}</div>
                    <span class="badge real-badge">built-in</span>
                </div>
                <div class="card-meta">{rec.date} · {rec.dur}</div>
                <div class="card-proto">{rec.protocol}</div>
            </button>
        {/each}

        {#each userRecordings as rec (rec.id)}
            <div class="card-wrap">
                <button class="card user" onclick={() => onSelect(rec)}>
                    <div class="card-header">
                        <div class="card-name">{rec.name}</div>
                        <span class="badge user-badge">custom</span>
                    </div>
                    <div class="card-meta">{rec.dur} · {rec.channels} ch</div>
                    <div class="card-proto card-path">{rec.apiPath}</div>
                </button>
                <button
                    class="remove-btn"
                    title="Remove"
                    onclick={() => removeRecording(rec.id)}
                >✕</button>
            </div>
        {/each}
    </div>

    {#if BUILTIN.length === 0 && userRecordings.length === 0}
        <div class="empty">No recordings yet. Click <strong>+ Add Recording</strong> to load one from disk.</div>
    {/if}
</div>

<style>
    .list { padding: 32px; overflow-y: auto; height: 100%; box-sizing: border-box; }

    .list-header {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        margin-bottom: 24px;
    }
    h2 { font-size: 18px; font-weight: 600; color: #e0e0e0; margin: 0; }

    .add-btn {
        background: none;
        border: 1px solid #444;
        color: #888;
        font-size: 12px;
        padding: 4px 12px;
        border-radius: 4px;
        cursor: pointer;
        white-space: nowrap;
    }
    .add-btn:hover { color: #ccc; border-color: #666; }

    /* ── Form ── */
    .form-card {
        background: #16162a;
        border: 1px solid #2a2a4a;
        border-radius: 8px;
        padding: 20px;
        margin-bottom: 24px;
    }
    .form-title { font-size: 14px; font-weight: 600; color: #e0e0e0; margin-bottom: 8px; }
    .form-hint  { font-size: 12px; color: #666; margin-bottom: 16px; line-height: 1.5; }
    .form-hint code { color: #4fc3f7; background: rgba(79,195,247,0.08); border-radius: 3px; padding: 0 4px; }

    .field { display: flex; flex-direction: column; gap: 4px; flex: 1; }
    .field-sm { flex: 0 0 100px; }
    .field label { font-size: 11px; color: #888; font-weight: 600; }
    .required { color: #ef5350; }
    .field input {
        background: #0d0d1a;
        border: 1px solid #333;
        border-radius: 4px;
        color: #e0e0e0;
        font-size: 13px;
        padding: 6px 10px;
        font-family: inherit;
        width: 100%;
        box-sizing: border-box;
    }
    .field input:focus { outline: none; border-color: #4fc3f7; }
    .field-error { font-size: 11px; color: #ef5350; }

    .form-row { display: flex; gap: 12px; margin-top: 12px; flex-wrap: wrap; }
    .form-actions { margin-top: 16px; display: flex; justify-content: flex-end; }
    .submit-btn {
        background: #4fc3f7;
        border: none;
        border-radius: 4px;
        color: #0d0d1a;
        font-size: 13px;
        font-weight: 700;
        padding: 6px 20px;
        cursor: pointer;
    }
    .submit-btn:hover { background: #81d4fa; }

    /* ── Cards ── */
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }

    .card-wrap { position: relative; }

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
        width: 100%;
    }
    .card:hover           { border-color: #4fc3f7; background: #1e1e3a; }
    .card.builtin         { border-color: #2a4a2a; }
    .card.builtin:hover   { border-color: #66bb6a; background: #162216; }
    .card.user            { border-color: #2a3a4a; }
    .card.user:hover      { border-color: #4fc3f7; }

    .remove-btn {
        position: absolute;
        top: 8px;
        right: 8px;
        background: none;
        border: none;
        color: #444;
        font-size: 12px;
        cursor: pointer;
        padding: 2px 5px;
        border-radius: 3px;
        line-height: 1;
    }
    .remove-btn:hover { color: #ef5350; background: rgba(239,83,80,0.12); }

    .card-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 6px; }
    .card-name   { font-size: 15px; font-weight: 600; color: #e0e0e0; }
    .card-meta   { font-size: 11px; color: #888; margin-bottom: 6px; }
    .card-proto  { font-size: 12px; color: #aaa; }
    .card-path   { font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 11px; word-break: break-all; color: #666; }

    .badge {
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        border-radius: 3px;
        padding: 2px 6px;
        flex-shrink: 0;
        margin-top: 1px;
        white-space: nowrap;
    }
    .real-badge { background: #1a3a1a; border: 1px solid #66bb6a; color: #66bb6a; }
    .user-badge { background: #1a2a3a; border: 1px solid #4fc3f7; color: #4fc3f7; }

    .empty { font-size: 13px; color: #555; margin-top: 32px; }
</style>
