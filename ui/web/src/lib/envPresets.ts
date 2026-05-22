import type { EnvPreset } from './types';

export const ENV_PRESETS: EnvPreset[] = [
    {
        id: 'demo-default',
        name: 'Demo Environment',
        description: 'In-browser E/I culture (Build tab defaults). Load recordings from the Recording tab.',
        load: { kind: 'builtin-culture' },
    },
];

export function getEnvPreset(id: string): EnvPreset | undefined {
    return ENV_PRESETS.find((p) => p.id === id);
}
