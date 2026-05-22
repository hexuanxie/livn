import type { EnvPreset } from './types';

export const ENV_PRESETS: EnvPreset[] = [
    {
        id: 'demo-default',
        name: 'Demo Environment',
        description: 'In-browser E/I culture (Build tab defaults). Load recordings from the Recording tab.',
        load: { kind: 'builtin-culture' },
    },
    {
        id: 'empty',
        name: 'Empty Environment',
        description:
            'Blank workspace with no pre-loaded culture. Design a system in the Build tab or load one from the Console.',
        load: { kind: 'empty' },
    },
];

export function getEnvPreset(id: string): EnvPreset | undefined {
    return ENV_PRESETS.find((p) => p.id === id);
}
