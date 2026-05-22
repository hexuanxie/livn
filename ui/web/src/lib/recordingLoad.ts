import type { Recording } from './types';
import {
    clearAcquiredBio,
    forceRefresh,
    isBuiltinExperiment,
    loadBuiltinCulture,
    loadExperimentDataset,
    loadExpSystem,
    setAcquiredBio,
    setRecordingBackend,
} from './pyodide';

export async function loadRecording(rec: Recording): Promise<void> {
    if (rec.source === 'simulated' && rec.experiment) {
        clearAcquiredBio();
        setRecordingBackend('hf');
        await loadExperimentDataset(rec.experiment);
        return;
    }
    if (rec.source === 'acquired' && rec.bio) {
        setAcquiredBio(rec.bio);
        setRecordingBackend('bio');
    }
}

export async function loadRecordingWithSystem(rec: Recording): Promise<void> {
    await loadRecording(rec);
    if (rec.source !== 'simulated' || !rec.experiment) return;

    const uri = rec.experiment.metadata?.system?.uri;
    const sysName = uri ? uri.replace(/\/$/, '').split('/').pop() : null;
    if (!sysName) return;

    try {
        if (isBuiltinExperiment(rec.experiment)) {
            await loadBuiltinCulture();
        } else {
            await loadExpSystem(sysName);
            await forceRefresh();
        }
    } catch {
        /* RecordingViewer shows warning if system fails */
    }
}
