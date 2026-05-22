<script lang="ts">
    let {
        message = 'Initializing environment…',
        hint = 'Loading Pyodide runtime and livn packages',
    }: {
        message?: string;
        hint?: string;
    } = $props();
</script>

<div class="overlay" role="status" aria-live="polite" aria-busy="true">
    <div class="card">
        <div class="spinner" aria-hidden="true"></div>
        <p class="title">{message}</p>
        {#if hint}
            <p class="hint">{hint}</p>
        {/if}
    </div>
</div>

<style>
    .overlay {
        position: absolute;
        inset: 0;
        z-index: 20;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(13, 13, 26, 0.88);
        pointer-events: all;
    }

    .card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 24px 28px;
        max-width: 280px;
        text-align: center;
    }

    .spinner {
        width: 36px;
        height: 36px;
        border: 3px solid #2a2a4a;
        border-top-color: #4fc3f7;
        border-radius: 50%;
        animation: spin 0.85s linear infinite;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    .title {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        color: #e0e0e0;
    }

    .hint {
        margin: 0;
        font-size: 12px;
        color: #888;
        line-height: 1.45;
    }
</style>
