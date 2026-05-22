<script lang="ts">
    import '../app.css';
    import StatusBar from '$lib/components/StatusBar.svelte';
    import NavBar from '$lib/components/NavBar.svelte';
    import EnvList from '$lib/components/EnvList.svelte';
    import EnvDetail from '$lib/components/EnvDetail.svelte';
    import SystemGenerator from '$lib/components/SystemGenerator.svelte';
    import { pendingCommand, envRightTab, clearActiveRecording } from '$lib/stores';
    import { builtinCultureSetupCode } from '$lib/pyodide';
    import type { EnvPreset } from '$lib/types';

    let navTab = $state<'env' | 'build'>('env');
    let navPage = $state<'list' | 'detail'>('list');
    let selectedPreset = $state<EnvPreset | null>(null);

    const activeTab = $derived(navTab);

    function setTab(tab: 'env' | 'build') {
        if (tab === navTab) return;
        navTab = tab;
        navPage = 'list';
        selectedPreset = null;
    }

    async function selectEnv(preset: EnvPreset) {
        selectedPreset = preset;
        navPage = 'detail';
        envRightTab.set('console');
        clearActiveRecording();

        if (preset.load.kind === 'builtin-culture') {
            pendingCommand.set(builtinCultureSetupCode());
        } else {
            pendingCommand.set(preset.load.code);
        }
    }

    function backToEnvList() {
        navPage = 'list';
        selectedPreset = null;
    }
</script>

<div class="layout">
    <NavBar {activeTab} onTabChange={setTab} />

    <div class="content">
        {#if navTab === 'env' && navPage === 'detail' && selectedPreset}
            <EnvDetail preset={selectedPreset} onBack={backToEnvList} />
        {:else if navTab === 'env'}
            <EnvList onSelect={selectEnv} />
        {:else if navTab === 'build'}
            <div class="build-body">
                <SystemGenerator />
            </div>
        {/if}
    </div>

    <div class="footer"><StatusBar /></div>
</div>

<style>
    .layout {
        width: 100vw;
        height: 100vh;
        display: grid;
        grid-template-rows: auto 1fr auto;
        overflow: hidden;
    }

    .content {
        min-height: 0;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }

    .footer {
        grid-column: 1 / -1;
    }

    .build-body {
        flex: 1;
        display: flex;
        min-height: 0;
        overflow: hidden;
    }
    .build-body > :global(*) {
        flex: 1;
        min-width: 0;
        min-height: 0;
    }
</style>
