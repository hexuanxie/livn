<script lang="ts">
    let { onGetStarted }: { onGetStarted: () => void } = $props();
</script>

<main class="home">
    <div class="hero">
        <p class="tagline">
            Explore neural cultures in the browser — 3D environments, simulation datasets, and
            biological recordings in one workspace.
        </p>
    </div>

    <section class="overview">
        <h2 class="section-heading">What you can do</h2>
        <ul class="features">
            <li>
                <span class="feature-title">Environments</span>
                <span class="feature-desc">
                    Open a demo culture or start from an empty workspace. Inspect neurons and
                    electrodes in 3D, then pair recordings with the scene.
                </span>
            </li>
            <li>
                <span class="feature-title">Recordings</span>
                <span class="feature-desc">
                    Load simulated spike/LFP data or acquired multi-channel LFP. Scrub trials,
                    play back time, and inspect signals per neuron or electrode.
                </span>
            </li>
            <li>
                <span class="feature-title">Designer</span>
                <span class="feature-desc">
                    Lay out rectangular or disk cultures, tune population size, and preview MEA
                    geometry before running simulations in Python.
                </span>
            </li>
        </ul>
    </section>

    <div class="actions">
        <button type="button" class="cta" onclick={onGetStarted}>Getting started</button>
    </div>
</main>

<style>
    .home {
        padding: 48px 32px 64px;
        max-width: 640px;
        margin: 0 auto;
        box-sizing: border-box;
    }

    .hero {
        margin-bottom: 40px;
    }

    .title {
        font-size: 42px;
        font-weight: 700;
        color: #4fc3f7;
        letter-spacing: 0.12em;
        text-transform: lowercase;
        margin: 0 0 16px;
    }

    .tagline {
        font-size: 15px;
        line-height: 1.55;
        color: #aaa;
        margin: 0;
    }

    .section-heading {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #666;
        margin: 0 0 16px;
    }

    .features {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 20px;
    }

    .features li {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding-left: 14px;
        border-left: 2px solid #2a4a6a;
    }

    .feature-title {
        font-size: 14px;
        font-weight: 600;
        color: #e0e0e0;
    }

    .feature-desc {
        font-size: 13px;
        line-height: 1.45;
        color: #888;
    }

    .actions {
        margin-top: 48px;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 10px;
    }

    .cta {
        background: #1a3a4a;
        border: 1px solid #4fc3f7;
        color: #4fc3f7;
        font-size: 14px;
        font-weight: 600;
        padding: 12px 24px;
        border-radius: 6px;
        cursor: pointer;
        transition: background 0.15s, color 0.15s;
    }

    .cta:hover {
        background: #4fc3f7;
        color: #0d0d1a;
    }

    .cta-hint {
        font-size: 11px;
        color: #555;
        margin: 0;
        font-style: italic;
    }
</style>
