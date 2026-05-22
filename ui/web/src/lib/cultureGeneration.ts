/** Shared culture / MEA layout logic (Build tab preview + built-in systems). */

export type CultureShape = 'rectangle' | 'disk';

export type CultureSpec = {
    name: string;
    shape: CultureShape;
    rectX: number;
    rectY: number;
    diskRadius: number;
    totalNeurons: number;
    excRatio: number;
    meaPitch: number;
    seed: number;
};

/** Defaults aligned with SystemGenerator initial form state. */
export const DEFAULT_CULTURE_SPEC: CultureSpec = {
    name: 'demo_culture',
    shape: 'rectangle',
    rectX: 4000,
    rectY: 4000,
    diskRadius: 2000,
    totalNeurons: 10_000,
    excRatio: 0.8,
    meaPitch: 200,
    seed: 42,
};

export const BUILTIN_SYSTEM_ID = `builtin:${DEFAULT_CULTURE_SPEC.name}`;

export function isBuiltinSystemId(id: string): boolean {
    return id.startsWith('builtin:');
}

export function computeMEA(spec: CultureSpec): [number, number][] {
    const { shape, rectX, rectY, diskRadius, meaPitch } = spec;
    if (meaPitch <= 0) return [];

    const coords: [number, number][] = [];
    const xmin = shape === 'rectangle' ? 0 : -diskRadius;
    const xmax = shape === 'rectangle' ? rectX : diskRadius;
    const ymin = shape === 'rectangle' ? 0 : -diskRadius;
    const ymax = shape === 'rectangle' ? rectY : diskRadius;
    const sx = Math.ceil(xmin / meaPitch) * meaPitch;
    const sy = Math.ceil(ymin / meaPitch) * meaPitch;

    for (let x = sx; x <= xmax + 1e-6; x += meaPitch) {
        for (let y = sy; y <= ymax + 1e-6; y += meaPitch) {
            if (shape === 'disk' && Math.hypot(x, y) > diskRadius) continue;
            coords.push([x, y]);
        }
    }
    return coords;
}

export function meaCoordsForSpec(spec: CultureSpec): [number, number][] {
    return computeMEA(spec);
}
