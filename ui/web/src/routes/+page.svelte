<script lang="ts">
    import '../app.css';
    import StatusBar from '$lib/components/StatusBar.svelte';
    import NavBar from '$lib/components/NavBar.svelte';
    import HomePage from '$lib/components/HomePage.svelte';
    import EnvList from '$lib/components/EnvList.svelte';
    import EnvDetail from '$lib/components/EnvDetail.svelte';
    import SystemGenerator from '$lib/components/SystemGenerator.svelte';
    import { pendingCommand, envRightTab, clearActiveRecording } from '$lib/stores';
    import type { EnvPreset } from '$lib/types';

    let mainView = $state<'home' | 'env' | 'build'>('home');
    let envPage = $state<'list' | 'detail'>('list');
    let selectedPreset = $state<EnvPreset | null>(null);

    const activeTab = $derived(mainView);

    function goHome() {
        mainView = 'home';
        envPage = 'list';
        selectedPreset = null;
    }

    function setTab(tab: 'env' | 'build') {
        mainView = tab;
        envPage = 'list';
        selectedPreset = null;
    }

    function gettingStarted() {
        mainView = 'env';
        envPage = 'list';
        selectedPreset = null;
    }

    async function selectEnv(preset: EnvPreset) {
        selectedPreset = preset;
        envPage = 'detail';
        mainView = 'env';
        envRightTab.set('recording');
        clearActiveRecording();

        const { builtinCultureSetupCode, emptyEnvironmentSetupCode } = await import('$lib/pyodide');

        if (preset.load.kind === 'builtin-culture') {
            pendingCommand.set(builtinCultureSetupCode());
        } else if (preset.load.kind === 'empty') {
            pendingCommand.set(emptyEnvironmentSetupCode());
        } else {
            pendingCommand.set(preset.load.code);
        }
    }

    function backToEnvList() {
        envPage = 'list';
        selectedPreset = null;
    }
</script>

<div class="layout">
    <NavBar {activeTab} onHome={goHome} onTabChange={setTab} />

    <div class="content" class:scrollable={mainView === 'home'}>
        {#if mainView === 'home'}
            <HomePage onGetStarted={gettingStarted} />
        {:else if mainView === 'env' && envPage === 'detail' && selectedPreset}
            <EnvDetail preset={selectedPreset} onBack={backToEnvList} />
        {:else if mainView === 'env'}
            <EnvList onSelect={selectEnv} />
        {:else if mainView === 'build'}
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
    .content.scrollable {
        overflow-x: hidden;
        overflow-y: auto;
        display: block;
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
