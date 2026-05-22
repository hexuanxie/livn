/** Synthetic demo/neural* LFP chunks (browser + Vite middleware). */

export type BioChunkParams = {
    rec: string;
    offsetS: number;
    durS: number;
    downsample: number;
    chStart: number;
    chEnd: number;
};

export type BioChunkResult = {
    data: Float32Array;
    chCount: number;
    nSamples: number;
    effHz: number;
    chStart: number;
};

const SAMPLE_RATE = 30000;

export function isDemoBioRec(rec: string): boolean {
    return rec.startsWith('demo/');
}

function h32(n: number): number {
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
    n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
    return (n ^ (n >>> 16)) >>> 0;
}

export function generateDemoBioChunk(params: BioChunkParams): BioChunkResult {
    const { rec: _rec, offsetS, durS, downsample, chStart, chEnd } = params;
    const dsF = Math.max(1, downsample);
    const effHz = Math.round(SAMPLE_RATE / dsF);
    const nOut = Math.floor(durS * SAMPLE_RATE / dsF);
    const chCount = Math.max(0, chEnd - chStart);
    const out = new Float32Array(chCount * nOut);

    for (let ci = 0; ci < chCount; ci++) {
        const ch = chStart + ci;
        for (let si = 0; si < nOut; si++) {
            const sIdx = Math.round(offsetS * SAMPLE_RATE) + si * dsF;
            const t = sIdx / SAMPLE_RATE;

            const lfp =
                38 * Math.sin(2 * Math.PI * 8 * t + ch * 0.37) +
                14 * Math.sin(2 * Math.PI * 40 * t + ch * 0.59);

            const seed = (ch * 1_800_007 + sIdx) | 0;
            const u1 = Math.max((h32(seed) >>> 8) / 16_777_216, 1e-10);
            const u2 = (h32(seed + 1) >>> 8) / 16_777_216;
            const noise = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * 13;

            const tMod = (t + 0.5) % 1.0;
            const stim =
                tMod < 0.03
                    ? (280 + 180 * Math.sin(ch * 0.5)) * Math.exp(-tMod * 260)
                    : 0;

            out[ci * nOut + si] = lfp + noise + stim;
        }
    }

    return { data: out, chCount, nSamples: nOut, effHz, chStart };
}

export function bioChunkQueryString(params: BioChunkParams): string {
    return new URLSearchParams({
        rec: params.rec,
        offset_s: params.offsetS.toString(),
        dur_s: params.durS.toString(),
        downsample: params.downsample.toString(),
        ch_start: params.chStart.toString(),
        ch_end: params.chEnd.toString(),
    }).toString();
}

function parseChunkHeaders(resp: Response, chStart: number): Omit<BioChunkResult, 'data'> {
    return {
        chCount: parseInt(resp.headers.get('X-N-Channels') ?? '0', 10),
        nSamples: parseInt(resp.headers.get('X-N-Samples') ?? '0', 10),
        effHz: parseInt(resp.headers.get('X-Sample-Rate') ?? '300', 10),
        chStart: parseInt(resp.headers.get('X-Ch-Start') ?? String(chStart), 10),
    };
}

/** Fetch LFP chunk from API, with in-browser fallback for built-in demo recordings. */
export async function fetchBioChunk(params: BioChunkParams): Promise<BioChunkResult> {
    const qs = bioChunkQueryString(params);
    let resp: Response;
    try {
        resp = await fetch(`/bio-api/chunk?${qs}`);
    } catch {
        if (isDemoBioRec(params.rec)) return generateDemoBioChunk(params);
        throw new Error('Failed to reach bio recording API');
    }

    if (resp.ok) {
        const meta = parseChunkHeaders(resp, params.chStart);
        const data = new Float32Array(await resp.arrayBuffer());
        return { ...meta, data };
    }

    if (isDemoBioRec(params.rec)) {
        return generateDemoBioChunk(params);
    }

    const text = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status}${text ? `: ${text}` : ''}`);
}
