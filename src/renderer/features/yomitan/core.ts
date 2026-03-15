import type { ParseTextResultItem, Summary, TermDictionaryEntry } from 'yomitan-core';
import type {
    PopupTheme,
    RenderedTermEntry,
    RenderHostOptions,
    TermEntryRenderer,
    TermEntryRendererCreateOptions,
} from 'yomitan-core/render';

import { createTermEntryRenderer as createCoreTermEntryRenderer } from 'yomitan-core/render';

import { RECOMMENDED_DICTIONARIES } from '/@/shared/constants/yomitan';

export interface TokenizedLyricLine {
    key: string;
    text: string;
    tokens: YomitanToken[];
    translatedText?: string;
}

export interface YomitanDictionaryPreference {
    enabled: boolean;
    title: string;
}
export type YomitanDictionarySummary = Summary;
export type YomitanLookupEntry = TermDictionaryEntry;
export type YomitanPopupTheme = PopupTheme;
export type YomitanRenderedTermEntry = RenderedTermEntry;
export type YomitanRenderHostOptions = RenderHostOptions;
export type YomitanTermEntryRenderer = TermEntryRenderer;

export type YomitanTermEntryRendererCreateOptions = TermEntryRendererCreateOptions;

export interface YomitanToken {
    kind?: 'other' | 'punct' | 'word';
    reading: string;
    selectable: boolean;
    term: string;
    text: string;
}

type EnabledDictionaryMap = Map<string, { index: number; priority: number }>;

const JAPANESE_TEXT_REGEX = /[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9faf\uff66-\uff9f]/;

let coreInstance: any | null = null;

async function getCoreInstance() {
    if (coreInstance) {
        return coreInstance;
    }

    const module = await importCoreIndexModule();
    const YomitanCore = module.default;
    const core = new YomitanCore({
        databaseName: 'feishin-yomitan',
        initLanguage: true,
    });

    await core.initialize();
    coreInstance = core;

    return coreInstance;
}

async function importCoreIndexModule() {
    return await import('yomitan-core');
}

function toFindTermDictionaryMap(enabledDictionaryMap: EnabledDictionaryMap) {
    const map = new Map<
        string,
        {
            alias: string;
            allowSecondarySearches: boolean;
            index: number;
            partsOfSpeechFilter: boolean;
            useDeinflections: boolean;
        }
    >();

    for (const [name, { index }] of enabledDictionaryMap.entries()) {
        map.set(name, {
            alias: name,
            allowSecondarySearches: false,
            index,
            partsOfSpeechFilter: true,
            useDeinflections: true,
        });
    }

    return map;
}

export const buildPlainTextTokens = (text: string): YomitanToken[] => [
    {
        kind: hasJapaneseText(text) ? 'word' : 'other',
        reading: '',
        selectable: false,
        term: text,
        text,
    },
];

export const hasJapaneseText = (text: string) => JAPANESE_TEXT_REGEX.test(text);

export const buildEnabledDictionaryMap = (
    preferences: YomitanDictionaryPreference[],
): EnabledDictionaryMap => {
    const enabled = preferences.filter((item) => item.enabled);
    const map: EnabledDictionaryMap = new Map();

    enabled.forEach((item, index) => {
        map.set(item.title, {
            index,
            priority: 0,
        });
    });

    return map;
};

export const normalizeYomitanDictionaryPreferences = (
    installedTitles: string[],
    existingPreferences: YomitanDictionaryPreference[],
): YomitanDictionaryPreference[] => {
    const normalized: YomitanDictionaryPreference[] = [];
    const installedTitleSet = new Set(installedTitles);
    const seen = new Set<string>();

    for (const preference of existingPreferences) {
        if (seen.has(preference.title) || !installedTitleSet.has(preference.title)) {
            continue;
        }

        seen.add(preference.title);
        normalized.push(preference);
    }

    for (const title of installedTitles) {
        if (seen.has(title)) {
            continue;
        }

        seen.add(title);
        normalized.push({
            enabled: true,
            title,
        });
    }

    return normalized;
};

export const areDictionaryPreferencesEqual = (
    left: YomitanDictionaryPreference[],
    right: YomitanDictionaryPreference[],
) => {
    if (left.length !== right.length) {
        return false;
    }

    return left.every(
        (item, index) =>
            item.title === right[index]?.title && item.enabled === right[index]?.enabled,
    );
};

export async function deleteDictionary(title: string) {
    const core = await getCoreInstance();

    await core.deleteDictionary(title);
}

export async function getInstalledDictionaries(): Promise<YomitanDictionarySummary[]> {
    const core = await getCoreInstance();
    const dictionaries = (await core.getDictionaryInfo()) as Summary[];

    return [...dictionaries].sort((a, b) => b.importDate - a.importDate);
}

export async function importDictionaryZip(
    archive: ArrayBuffer,
    onProgress?: (progress: { count: number; index: number; nextStep?: boolean }) => void,
) {
    const core = await getCoreInstance();

    return await core.importDictionary(archive, {
        onProgress,
    });
}

export async function lookupTerm(text: string, enabledDictionaryMap: EnabledDictionaryMap) {
    const core = await getCoreInstance();

    return (await core.findTerms(text, {
        enabledDictionaryMap: toFindTermDictionaryMap(enabledDictionaryMap),
        language: 'ja',
        mode: 'group',
        options: {
            deinflect: true,
            matchType: 'exact',
            removeNonJapaneseCharacters: false,
            searchResolution: 'letter',
        },
    })) as { entries: TermDictionaryEntry[]; originalTextLength: number };
}

export async function tokenizeText(text: string, enabledDictionaryMap: EnabledDictionaryMap) {
    if (!text) {
        return buildPlainTextTokens(text);
    }

    if (!hasJapaneseText(text) || enabledDictionaryMap.size === 0) {
        return buildPlainTextTokens(text);
    }

    const core = await getCoreInstance();
    const parsed = (await core.parseText(text, {
        deinflect: true,
        enabledDictionaryMap: toFindTermDictionaryMap(enabledDictionaryMap),
        language: 'ja',
        removeNonJapaneseCharacters: false,
        scanLength: 10,
        searchResolution: 'letter',
        textReplacements: [null],
    })) as ParseTextResultItem[];

    const tokens: YomitanToken[] = [];

    for (const parseResult of parsed) {
        const lines = parseResult.content || [];

        for (const line of lines) {
            for (const segment of line) {
                if (!segment.text || !segment.text.trim()) {
                    continue;
                }

                const selectable = Array.isArray(segment.headwords) && segment.headwords.length > 0;

                tokens.push({
                    kind: selectable ? 'word' : hasJapaneseText(segment.text) ? 'word' : 'other',
                    reading: segment.reading || '',
                    selectable,
                    term: segment.text,
                    text: segment.text,
                });
            }
        }
    }

    return tokens.length > 0 ? tokens : buildPlainTextTokens(text);
}

export const createTermEntryRenderer = (
    options?: YomitanTermEntryRendererCreateOptions,
): YomitanTermEntryRenderer => {
    return createCoreTermEntryRenderer(options);
};

export { RECOMMENDED_DICTIONARIES };
