import { ipcRenderer } from 'electron';

const downloadRecommendedDictionary = async (url: string): Promise<ArrayBuffer> => {
    const result = await ipcRenderer.invoke('yomitan-download-recommended-dictionary', url);

    if (result instanceof Uint8Array) {
        return Uint8Array.from(result).buffer;
    }

    if (result instanceof ArrayBuffer) {
        return result;
    }

    throw new Error('Failed to download recommended dictionary');
};

export const yomitan = {
    downloadRecommendedDictionary,
};

export type Yomitan = typeof yomitan;
