<script lang="ts">
    import { T, useThrelte } from "@threlte/core";
    import { OrbitControls, Grid } from "@threlte/extras";
    import { CanvasTexture, Color, Fog, SRGBColorSpace } from "three";
    import System from "./System.svelte";
    import IO from "./IO.svelte";
    import { envSystem, envIO, viewConfig } from "$lib/stores";

    const system = $derived($envSystem);
    const io = $derived($envIO);
    const config = $derived($viewConfig);

    const cameraPose = $derived.by(() => {
        const bb = system?.bounding_box;
        if (!bb || bb.length < 6) {
            return {
                position: [0, 800, 1200] as [number, number, number],
                target: [0, 0, 0] as [number, number, number],
                span: 1000,
                floorY: 0,
                center: [0, 0, 0] as [number, number, number],
            };
        }
        const cx = (bb[0] + bb[3]) / 2;
        const cy = (bb[2] + bb[5]) / 2;
        const cz = (bb[1] + bb[4]) / 2;
        const span = Math.max(bb[3] - bb[0], bb[4] - bb[1], bb[5] - bb[2], 1);
        return {
            position: [cx, cy + span * 0.8, cz + span * 1.2] as [number, number, number],
            target: [cx, cy, cz] as [number, number, number],
            span,
            floorY: bb[2],
            center: [cx, cy, cz] as [number, number, number],
        };
    });

    const clip = $derived({
        near: Math.max(cameraPose.span * 0.001, 1),
        far: cameraPose.span * 80,
        maxDistance: cameraPose.span * 6,
    });

    const grid = $derived({
        cellSize: Math.max(80, cameraPose.span / 24),
        sectionSize: Math.max(400, cameraPose.span / 5),
        fadeDistance: cameraPose.span * 4,
    });

    const { scene } = useThrelte();

    function makeGradientBackground(): CanvasTexture {
        const h = 512;
        const canvas = document.createElement("canvas");
        canvas.width = 2;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, "#f4f6fa");
        grad.addColorStop(0.5, "#e8ecf2");
        grad.addColorStop(1, "#d5dce6");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 2, h);
        const tex = new CanvasTexture(canvas);
        tex.colorSpace = SRGBColorSpace;
        return tex;
    }

    $effect(() => {
        const span = cameraPose.span;
        const bg = makeGradientBackground();
        scene.background = bg;
        scene.fog = new Fog(0xe8ecf2, span * 1.5, span * 55);

        return () => {
            bg.dispose();
            scene.fog = null;
        };
    });
</script>

<T.PerspectiveCamera
    makeDefault
    position={cameraPose.position}
    fov={50}
    near={clip.near}
    far={clip.far}
>
    <OrbitControls
        enableDamping
        dampingFactor={0.1}
        target={cameraPose.target}
        maxDistance={clip.maxDistance}
    />
</T.PerspectiveCamera>

<T.AmbientLight intensity={0.65} />
<T.DirectionalLight position={[500, 1200, 800]} intensity={0.45} />
<T.DirectionalLight position={[-400, 600, -500]} intensity={0.2} />

<Grid
    infiniteGrid
    followCamera
    plane="xz"
    position={[cameraPose.center[0], cameraPose.floorY, cameraPose.center[2]]}
    cellColor="#b8c4d4"
    sectionColor="#7d8fa6"
    cellSize={grid.cellSize}
    sectionSize={grid.sectionSize}
    cellThickness={0.6}
    sectionThickness={1.2}
    fadeDistance={grid.fadeDistance}
    fadeStrength={1.2}
    backgroundColor="#e8ecf2"
    backgroundOpacity={0.55}
/>

{#if system}
    <System data={system} />
{/if}

{#if io && config.showElectrodes}
    <IO data={io} />
{/if}
