<script lang="ts">
    import { useThrelte } from "@threlte/core";
    import {
        InstancedMesh,
        SphereGeometry,
        MeshBasicMaterial,
        Matrix4,
        Color,
        EdgesGeometry,
        BoxGeometry,
        LineSegments,
        LineBasicMaterial,
        Vector3,
        Raycaster,
        type Intersection,
    } from "three";
    import type { SystemData, ViewConfig } from "$lib/types";
    import { tooltip, viewConfig, envIO, selectedNeurons, activeRecording, envRightTab } from "$lib/stores";
    import { onMount, onDestroy } from "svelte";

    interface Props {
        data: SystemData;
    }

    let { data }: Props = $props();
    const config = $derived($viewConfig);

    const POP_COLORS: Record<string, string> = {
        EXC: "#4fc3f7",
        INH: "#ef5350",
    };
    const DEFAULT_COLOR = "#aaaaaa";

    const { scene, renderer, camera, invalidate } = useThrelte();

    // Compute bounding box span for sizing
    function getSpan(): number {
        const bb = data.bounding_box;
        if (!bb || bb.length < 6) return 1000;
        const dx = bb[3] - bb[0];
        const dy = bb[4] - bb[1];
        const dz = bb[5] - bb[2];
        return Math.max(dx, dy, dz, 1);
    }

    // Build instanced meshes per population
    let meshes: InstancedMesh[] = [];
    let popGids: Map<InstancedMesh, Float64Array> = new Map();

    function buildMeshes() {
        // Clean up old meshes
        for (const m of meshes) {
            scene.remove(m);
            m.geometry.dispose();
            (m.material as MeshBasicMaterial).dispose();
        }
        meshes = [];
        popGids = new Map();

        const span = getSpan();
        // 0.02 was ~80 µm spheres on a 4 mm culture — extreme overlap reads as a black slab
        const radius = Math.max(span * 0.004 * config.pointSize, 3);

        for (const pop of data.populations) {
            if (!config.popVisibility[pop]) continue;

            const coords = data.pop_coords[pop];
            if (!coords || coords.length < 4) continue;

            const count = Math.floor(coords.length / 4);
            const colorHex = POP_COLORS[pop] ?? DEFAULT_COLOR;
            const popColor = new Color(colorHex);
            const geo = new SphereGeometry(radius, 10, 10);
            const mat = new MeshBasicMaterial({
                color: popColor,
                transparent: config.opacity < 1,
                opacity: config.opacity,
            });

            const mesh = new InstancedMesh(geo, mat, count);
            const matrix = new Matrix4();

            for (let i = 0; i < count; i++) {
                const idx = i * 4;
                // coords: [gid, x, y, z] → Three.js [x, z, y]
                const x = coords[idx + 1];
                const y = coords[idx + 3]; // system z → Three.js y (up)
                const z = coords[idx + 2]; // system y → Three.js z
                matrix.setPosition(x, y, z);
                mesh.setMatrixAt(i, matrix);
            }

            mesh.instanceMatrix.needsUpdate = true;
            mesh.frustumCulled = false;
            mesh.computeBoundingBox();
            mesh.computeBoundingSphere();
            mesh.userData = { population: pop };
            scene.add(mesh);
            meshes.push(mesh);
            popGids.set(mesh, coords);
        }
    }

    // Bounding box wireframe
    let bboxLines: LineSegments | null = null;

    function buildBBox() {
        if (bboxLines) {
            scene.remove(bboxLines);
            bboxLines.geometry.dispose();
            (bboxLines.material as LineBasicMaterial).dispose();
            bboxLines = null;
        }

        if (
            !config.showBoundingBox ||
            !data.bounding_box ||
            data.bounding_box.length < 6
        )
            return;

        const bb = data.bounding_box;
        const sx = bb[3] - bb[0];
        const sy = bb[5] - bb[2]; // system z range → Three.js y size
        const sz = bb[4] - bb[1]; // system y range → Three.js z size

        const cx = (bb[0] + bb[3]) / 2;
        const cy = (bb[2] + bb[5]) / 2; // center z → Three.js y
        const cz = (bb[1] + bb[4]) / 2; // center y → Three.js z

        const boxGeo = new BoxGeometry(sx, sy, sz);
        const edges = new EdgesGeometry(boxGeo);
        const lineMat = new LineBasicMaterial({
            color: 0x1565c0,
            transparent: true,
            opacity: 0.92,
            depthTest: true,
        });
        bboxLines = new LineSegments(edges, lineMat);
        bboxLines.position.set(cx, cy, cz);
        scene.add(bboxLines);
        boxGeo.dispose();
    }

    // Click handler for neuron selection
    const raycaster = new Raycaster();
    const mouse = { x: 0, y: 0 };
    let pointerDownPos = { x: 0, y: 0 };

    function onPointerDown(event: PointerEvent) {
        pointerDownPos.x = event.clientX;
        pointerDownPos.y = event.clientY;
    }

    function onPointerUp(event: PointerEvent) {
        const canvas = renderer.domElement;
        const rect = canvas.getBoundingClientRect();

        // Ignore clicks outside the canvas
        if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
        ) return;

        // Only treat as click if pointer barely moved (not an orbit drag)
        const dx = event.clientX - pointerDownPos.x;
        const dy = event.clientY - pointerDownPos.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 > 25) return; // 5px threshold

        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        const cam = camera.current;
        if (!cam) return;

        raycaster.setFromCamera(mouse as any, cam);

        let totalHits = 0;
        for (const mesh of meshes) {
            const hits: Intersection[] = raycaster.intersectObject(mesh);
            totalHits += hits.length;
            if (hits.length > 0 && hits[0].instanceId !== undefined) {
                const coords = popGids.get(mesh)!;
                const idx = hits[0].instanceId * 4;
                const gid = coords[idx];
                const x = coords[idx + 1];
                const y = coords[idx + 2];
                const z = coords[idx + 3];

                // Find nearest electrode
                let nearestElectrode: { id: number; distance: number } | null =
                    null;
                const ioData = $envIO;
                if (ioData?.electrode_coordinates) {
                    const ec = ioData.electrode_coordinates;
                    const elCount = Math.floor(ec.length / 4);
                    let minDist = Infinity;
                    let closestId = 0;
                    for (let ei = 0; ei < elCount; ei++) {
                        const eidx = ei * 4;
                        const dx = x - ec[eidx + 1];
                        const dy = y - ec[eidx + 2];
                        const dz = z - ec[eidx + 3];
                        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
                        if (d < minDist) {
                            minDist = d;
                            closestId = ec[eidx];
                        }
                    }
                    nearestElectrode = { id: closestId, distance: minDist };
                }

                tooltip.set({
                    visible: true,
                    gid,
                    population: mesh.userData.population,
                    x,
                    y,
                    z,
                    nearestElectrode,
                });

                if ($activeRecording !== null) {
                    envRightTab.set('recording');
                    if ($activeRecording.capabilities.spikes) {
                        selectedNeurons.update(ns =>
                            ns.includes(gid) ? ns.filter(n => n !== gid) : [...ns, gid]
                        );
                    }
                }
                return;
            }
        }
        // Tooltip hide on miss
        tooltip.set({ visible: false, gid: 0, population: '', x: 0, y: 0, z: 0, nearestElectrode: null });
    }

    // Auto-position camera to culture center (critical for large built-in cultures)
    function positionCamera() {
        if (!data.bounding_box || data.bounding_box.length < 6) return;
        const cam = camera.current;
        if (!cam) return;
        const bb = data.bounding_box;
        const cx = (bb[0] + bb[3]) / 2;
        const cy = (bb[2] + bb[5]) / 2;
        const cz = (bb[1] + bb[4]) / 2;
        const span = getSpan();
        cam.near = Math.max(span * 0.001, 1);
        cam.far = span * 80;
        cam.position.set(cx, cy + span * 0.8, cz + span * 1.2);
        cam.lookAt(new Vector3(cx, cy, cz));
        cam.updateProjectionMatrix();
    }

    $effect(() => {
        // Track system identity + viz settings for rebuild
        void data.name;
        void data.num_neurons;
        void data.populations.length;
        void data.bounding_box?.[0];
        void data.bounding_box?.[3];
        void config.pointSize;
        void config.opacity;
        void config.showBoundingBox;
        void JSON.stringify(config.popVisibility);
        buildMeshes();
        buildBBox();
        positionCamera();
        invalidate();
    });

    $effect(() => {
        const sel = $selectedNeurons;
        if (sel.length === 0) return;
        void data.name;
        void data.num_neurons;
        for (const mesh of meshes) {
            const coords = popGids.get(mesh);
            if (!coords) continue;
            const pop = mesh.userData.population as string;
            const hasSelected = coords.some((_, i) => sel.includes(coords[i * 4]));
            const mat = mesh.material as MeshBasicMaterial;
            mat.color.set(hasSelected ? '#ffd54f' : (POP_COLORS[pop] ?? DEFAULT_COLOR));
            mat.needsUpdate = true;
        }
        invalidate();
    });

    onMount(() => {
        window.addEventListener("pointerdown", onPointerDown);
        window.addEventListener("pointerup", onPointerUp);
        positionCamera();
    });

    onDestroy(() => {
        window.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("pointerup", onPointerUp);
        for (const m of meshes) {
            scene.remove(m);
            m.geometry.dispose();
            (m.material as MeshBasicMaterial).dispose();
        }
        if (bboxLines) {
            scene.remove(bboxLines);
            bboxLines.geometry.dispose();
            (bboxLines.material as LineBasicMaterial).dispose();
        }
    });
</script>
