import type {
    BioRecording,
    Experiment,
    ExpMeta,
    Recording,
    RecordingCapabilities,
    RecordingViewMode,
} from './types';

export const BUILTIN_EXPERIMENTS: Experiment[] = [
    {
        name: 'demo',
        root: 'built-in',
        path: '',
        kind: 'builtin',
        created_at: null,
        n_shards: 3,
        metadata: {
            duration: 1000,
            system: { uri: './systems/graphs/EI1', populations: ['EXC', 'INH'], n_neurons: 10 },
            model: 'ReducedCalciumSomaDendrite',
            recording: { spikes: true, voltages: false, membrane_currents: true },
        },
    },
];

export const BUILTIN_BIO_RECORDINGS: BioRecording[] = [
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

export function capabilitiesFromExperiment(meta: ExpMeta | null): RecordingCapabilities {
    const rec = meta?.recording;
    return {
        spikes: rec?.spikes ?? true,
        neuronVoltages: rec?.voltages ?? false,
        channelLfp: rec?.membrane_currents ?? false,
    };
}

export function capabilitiesFromBio(_bio: BioRecording): RecordingCapabilities {
    return {
        spikes: false,
        neuronVoltages: false,
        channelLfp: true,
    };
}

export function experimentToRecording(exp: Experiment): Recording {
    const caps = capabilitiesFromExperiment(exp.metadata);
    return {
        id: exp.kind === 'builtin' ? `sim:${exp.name}` : `sim:${exp.path}`,
        name: exp.name,
        source: 'simulated',
        capabilities: caps,
        nTrials: exp.n_shards,
        durationMs: exp.metadata?.duration ?? 1000,
        experiment: exp,
    };
}

export function bioToRecording(bio: BioRecording): Recording {
    return {
        id: `acq:${bio.id}`,
        name: bio.name,
        source: 'acquired',
        capabilities: capabilitiesFromBio(bio),
        nTrials: 1,
        durationMs: bio.durS * 1000,
        bio,
    };
}

export function defaultViewMode(caps: RecordingCapabilities): RecordingViewMode {
    if (caps.spikes) return 'spikes';
    if (caps.channelLfp) return 'channel_lfp';
    if (caps.neuronVoltages) return 'neuron_voltage';
    return 'channel_lfp';
}

export function capabilityLabels(caps: RecordingCapabilities): string[] {
    const out: string[] = [];
    if (caps.spikes) out.push('spikes');
    if (caps.neuronVoltages) out.push('voltage');
    if (caps.channelLfp) out.push('LFP');
    return out;
}
