<script lang="ts">
    let { activeTab, onTabChange, onHome }: {
        activeTab: 'home' | 'env' | 'build';
        onTabChange: (tab: 'env' | 'build') => void;
        onHome: () => void;
    } = $props();
</script>

<nav class="nav-bar">
    <button type="button" class="brand" onclick={onHome} title="Home">livn</button>
    <button class="tab" class:active={activeTab === 'env'} onclick={() => onTabChange('env')}>Viewer</button>
    <button class="tab" class:active={activeTab === 'build'} onclick={() => onTabChange('build')}>Designer</button>
</nav>

<style>
    .nav-bar {
        display: flex;
        align-items: center;
        background: #0d0d1a;
        border-bottom: 1px solid #2a2a4a;
        padding: 0 16px;
        height: 38px;
        flex-shrink: 0;
    }
    .brand {
        font-size: 13px;
        font-weight: 700;
        color: #4fc3f7;
        letter-spacing: 0.1em;
        margin-right: 20px;
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
        font-family: inherit;
    }
    .brand:hover {
        color: #81d4fa;
    }
    .tab {
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        color: #777;
        font-size: 13px;
        font-weight: 600;
        padding: 0 14px;
        height: 100%;
        cursor: pointer;
        transition: color 0.15s, border-color 0.15s;
    }
    .tab:hover {
        color: #bbb;
    }
    .tab.active {
        color: #4fc3f7;
        border-bottom-color: #4fc3f7;
    }
</style>
