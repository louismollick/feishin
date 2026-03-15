import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './lyrics.module.css';

import { queryKeys } from '/@/renderer/api/query-keys';
import { translateLyrics } from '/@/renderer/features/lyrics/api/lyric-translate';
import {
    computeSelectedFromResult,
    getDisplayOffset,
    lyricsQueries,
    type LyricsQueryResult,
} from '/@/renderer/features/lyrics/api/lyrics-api';
import { openLyricsExportModal } from '/@/renderer/features/lyrics/components/lyrics-export-form';
import { LyricsActions } from '/@/renderer/features/lyrics/lyrics-actions';
import {
    SynchronizedLyrics,
    SynchronizedLyricsProps,
} from '/@/renderer/features/lyrics/synchronized-lyrics';
import {
    UnsynchronizedLyrics,
    UnsynchronizedLyricsProps,
} from '/@/renderer/features/lyrics/unsynchronized-lyrics';
import { openLyricsSettingsModal } from '/@/renderer/features/lyrics/utils/open-lyrics-settings-modal';
import { usePlayerEvents } from '/@/renderer/features/player/audio-player/hooks/use-player-events';
import { ComponentErrorBoundary } from '/@/renderer/features/shared/components/component-error-boundary';
import {
    areDictionaryPreferencesEqual,
    buildEnabledDictionaryMap,
    buildPlainTextTokens,
    getInstalledDictionaries,
    lookupTerm,
    normalizeYomitanDictionaryPreferences,
    type TokenizedLyricLine,
    tokenizeText,
    type YomitanLookupEntry,
    type YomitanToken,
} from '/@/renderer/features/yomitan/core';
import { YomitanDictionaryPanel } from '/@/renderer/features/yomitan/yomitan-dictionary-panel';
import { yomitanQueryKeys } from '/@/renderer/features/yomitan/yomitan-query';
import { queryClient } from '/@/renderer/lib/react-query';
import { useLyricsSettings, usePlayerSong, useSettingsStoreActions } from '/@/renderer/store';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Center } from '/@/shared/components/center/center';
import { Group } from '/@/shared/components/group/group';
import { Spinner } from '/@/shared/components/spinner/spinner';
import { Text } from '/@/shared/components/text/text';
import { LyricsOverride } from '/@/shared/types/domain-types';

type LyricLineSource = {
    key: string;
    text: string;
    translatedText?: string;
};

type LyricsProps = {
    fadeOutNoLyricsMessage?: boolean;
    lookupLayout?: 'default' | 'mobile-split';
    settingsKey?: string;
    showActions?: boolean;
    showSettingsButton?: boolean;
};

export const Lyrics = ({
    fadeOutNoLyricsMessage = true,
    lookupLayout = 'default',
    settingsKey = 'default',
    showActions = true,
    showSettingsButton = true,
}: LyricsProps) => {
    const currentSong = usePlayerSong();
    const lyricsSettings = useLyricsSettings();
    const {
        enableAutoTranslation,
        preferLocalLyrics,
        translationApiKey,
        translationApiProvider,
        translationTargetLanguage,
        yomitanDictionaries,
    } = lyricsSettings;
    const { setSettings } = useSettingsStoreActions();
    const { t } = useTranslation();

    const [index, setIndexState] = useState(0);
    const [translatedLyrics, setTranslatedLyrics] = useState<null | string>(null);
    const [showTranslation, setShowTranslation] = useState(false);
    const [pendingSongId, setPendingSongId] = useState<string | undefined>(currentSong?.id);
    const [tokenizedLines, setTokenizedLines] = useState<TokenizedLyricLine[]>([]);
    const [lookupEntries, setLookupEntries] = useState<YomitanLookupEntry[]>([]);
    const [lookupError, setLookupError] = useState<null | string>(null);
    const [lookupLoading, setLookupLoading] = useState(false);
    const [selectedToken, setSelectedToken] = useState<null | YomitanToken>(null);
    const [shouldFadeOut, setShouldFadeOut] = useState(false);

    const lyricsFetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const previousSongIdRef = useRef<string | undefined>(currentSong?.id);
    const lookupRequestIdRef = useRef(0);

    const { data: installedDictionaries = [] } = useQuery({
        queryFn: getInstalledDictionaries,
        queryKey: yomitanQueryKeys.dictionaries,
    });

    const normalizedDictionaryPreferences = useMemo(
        () =>
            normalizeYomitanDictionaryPreferences(
                installedDictionaries.map((item) => item.title),
                yomitanDictionaries,
            ),
        [installedDictionaries, yomitanDictionaries],
    );

    useEffect(() => {
        if (areDictionaryPreferencesEqual(normalizedDictionaryPreferences, yomitanDictionaries)) {
            return;
        }

        setSettings({
            lyrics: {
                ...lyricsSettings,
                yomitanDictionaries: normalizedDictionaryPreferences,
            },
        });
    }, [lyricsSettings, normalizedDictionaryPreferences, setSettings, yomitanDictionaries]);

    const enabledDictionaryMap = useMemo(
        () => buildEnabledDictionaryMap(normalizedDictionaryPreferences),
        [normalizedDictionaryPreferences],
    );

    useEffect(() => {
        const currentSongId = currentSong?.id;
        const previousSongId = previousSongIdRef.current;

        if (currentSongId === previousSongId) {
            return;
        }

        previousSongIdRef.current = currentSongId;
        setPendingSongId(undefined);

        if (!currentSongId) {
            return;
        }

        clearTimeout(lyricsFetchTimeoutRef.current);
        lyricsFetchTimeoutRef.current = setTimeout(() => {
            setPendingSongId(currentSongId);
        }, 500);

        return () => {
            clearTimeout(lyricsFetchTimeoutRef.current);
        };
    }, [currentSong?.id]);

    const lyricsKey = useMemo(() => {
        if (!currentSong?._serverId || !currentSong?.id) return null;

        return queryKeys.songs.lyrics(currentSong._serverId, { songId: currentSong.id });
    }, [currentSong]);

    const { data, isLoading } = useQuery(
        lyricsQueries.songLyrics(
            {
                options: {
                    enabled: !!pendingSongId && pendingSongId === currentSong?.id,
                },
                query: { songId: currentSong?.id || '' },
                serverId: currentSong?._serverId || '',
            },
            currentSong,
        ),
    );

    const indexToUse = data?.selectedStructuredIndex ?? index;

    useEffect(() => {
        if (data != null) {
            setIndexState(data.selectedStructuredIndex);
        }
    }, [data]);

    const { selected: lyrics, selectedSynced: synced } = useMemo(() => {
        if (!data) {
            return { selected: null, selectedSynced: false };
        }

        return computeSelectedFromResult(data, preferLocalLyrics, indexToUse);
    }, [data, indexToUse, preferLocalLyrics]);

    const currentOffsetMs = useMemo(() => {
        if (!data) {
            return 0;
        }

        return getDisplayOffset(lyrics, data.selectedOffsetMs, indexToUse, data.local);
    }, [data, indexToUse, lyrics]);

    const translatedLineArray = useMemo(
        () => (showTranslation && translatedLyrics ? translatedLyrics.split('\n') : []),
        [showTranslation, translatedLyrics],
    );

    const lyricLineSource = useMemo<LyricLineSource[]>(() => {
        if (!lyrics) {
            return [];
        }

        if (Array.isArray(lyrics.lyrics)) {
            return lyrics.lyrics.map(([, line], lineIndex) => ({
                key: `${lineIndex}-${line}`,
                text: line,
                translatedText: translatedLineArray[lineIndex],
            }));
        }

        return lyrics.lyrics.split('\n').map((line, lineIndex) => ({
            key: `${lineIndex}-${line}`,
            text: line,
            translatedText: translatedLineArray[lineIndex],
        }));
    }, [lyrics, translatedLineArray]);

    const lyricLineSourceSignature = useMemo(
        () => lyricLineSource.map((line) => line.key).join('\n'),
        [lyricLineSource],
    );

    const resetLookup = useCallback(() => {
        lookupRequestIdRef.current += 1;
        setLookupEntries([]);
        setLookupError(null);
        setLookupLoading(false);
        setSelectedToken(null);
    }, []);

    useEffect(() => {
        if (enabledDictionaryMap.size > 0) {
            return;
        }

        resetLookup();
    }, [enabledDictionaryMap, resetLookup]);

    useEffect(() => {
        resetLookup();
    }, [currentSong?.id, lyricLineSourceSignature, resetLookup]);

    useEffect(() => {
        const fallbackLines = lyricLineSource.map((line) => ({
            ...line,
            tokens: buildPlainTextTokens(line.text),
        }));

        setTokenizedLines(fallbackLines);

        if (lyricLineSource.length === 0 || enabledDictionaryMap.size === 0) {
            return;
        }

        let cancelled = false;

        const run = async () => {
            try {
                const nextLines = await Promise.all(
                    lyricLineSource.map(async (line) => ({
                        ...line,
                        tokens: await tokenizeText(line.text, enabledDictionaryMap),
                    })),
                );

                if (!cancelled) {
                    setTokenizedLines(nextLines);
                }
            } catch (error) {
                console.error('Failed to tokenize lyrics for Yomitan lookup:', error);

                if (!cancelled) {
                    setTokenizedLines(fallbackLines);
                }
            }
        };

        void run();

        return () => {
            cancelled = true;
        };
    }, [enabledDictionaryMap, lyricLineSource]);

    const handleLookupToken = useCallback(
        async (token: YomitanToken) => {
            if (!token.selectable || enabledDictionaryMap.size === 0) {
                return;
            }

            const requestId = lookupRequestIdRef.current + 1;
            const lookupText = token.term.trim() || token.text.trim();
            lookupRequestIdRef.current = requestId;

            setSelectedToken(token);
            setLookupEntries([]);
            setLookupError(null);
            setLookupLoading(true);

            try {
                const result = await lookupTerm(lookupText, enabledDictionaryMap);

                if (lookupRequestIdRef.current !== requestId) {
                    return;
                }

                setLookupEntries(result.entries);
                setLookupLoading(false);
            } catch (error) {
                console.error(`Failed Yomitan lookup for token "${lookupText}":`, error);

                if (lookupRequestIdRef.current !== requestId) {
                    return;
                }

                setLookupEntries([]);
                setLookupError(
                    t('setting.yomitanLookupFailed', {
                        defaultValue: 'Failed to load dictionary results.',
                    }),
                );
                setLookupLoading(false);
            }
        },
        [enabledDictionaryMap, t],
    );

    const handleOnSearchOverride = useCallback(
        (params: LyricsOverride) => {
            if (!lyricsKey) return;

            queryClient.setQueryData<LyricsQueryResult>(lyricsKey, (prev) =>
                prev ? { ...prev, overrideSelection: params } : prev,
            );
            queryClient.invalidateQueries({ queryKey: lyricsKey });
        },
        [lyricsKey],
    );

    const handleUpdateOffset = useCallback(
        (offsetMs: number) => {
            if (!currentSong || !lyricsKey) return;

            queryClient.setQueryData<LyricsQueryResult>(lyricsKey, (prev) => {
                if (!prev) return prev;

                const updated = { ...prev, selectedOffsetMs: offsetMs };

                if (Array.isArray(prev.local) && prev.local.length > 0) {
                    const idx = Math.min(indexToUse, prev.local.length - 1);
                    updated.local = [...prev.local];
                    updated.local[idx] = {
                        ...updated.local[idx],
                        offsetMs,
                    };
                }

                return updated;
            });
        },
        [currentSong, indexToUse, lyricsKey],
    );

    const setIndex = useCallback(
        (newIndex: number) => {
            setIndexState(newIndex);

            if (!lyricsKey || !data) return;

            const { selected: nextSelected, selectedSynced: nextSynced } =
                computeSelectedFromResult(data, preferLocalLyrics, newIndex);
            const nextOffset = getDisplayOffset(
                nextSelected,
                data.selectedOffsetMs,
                newIndex,
                data.local,
            );

            queryClient.setQueryData<LyricsQueryResult>(lyricsKey, (prev) =>
                prev
                    ? {
                          ...prev,
                          selected: nextSelected,
                          selectedOffsetMs: nextOffset,
                          selectedStructuredIndex: newIndex,
                          selectedSynced: nextSynced,
                      }
                    : prev,
            );
        },
        [data, lyricsKey, preferLocalLyrics],
    );

    const handleOnRemoveLyric = useCallback(async () => {
        if (!currentSong || !lyricsKey) return;

        queryClient.setQueryData<LyricsQueryResult>(lyricsKey, (prev) =>
            prev
                ? {
                      ...prev,
                      overrideData: null,
                      overrideSelection: null,
                      remoteAuto: null,
                      suppressRemoteAuto: true,
                  }
                : prev,
        );
        await queryClient.invalidateQueries({ queryKey: lyricsKey });
    }, [currentSong, lyricsKey]);

    const fetchTranslation = useCallback(async () => {
        if (!lyrics) return;

        const originalLyrics = Array.isArray(lyrics.lyrics)
            ? lyrics.lyrics.map(([, line]) => line).join('\n')
            : lyrics.lyrics;

        const translatedText = await translateLyrics(
            originalLyrics,
            translationApiKey,
            translationApiProvider,
            translationTargetLanguage,
        );

        setTranslatedLyrics(translatedText);
        setShowTranslation(true);
    }, [lyrics, translationApiKey, translationApiProvider, translationTargetLanguage]);

    const handleOnTranslateLyric = useCallback(async () => {
        if (translatedLyrics) {
            setShowTranslation(!showTranslation);
            return;
        }

        await fetchTranslation();
    }, [fetchTranslation, showTranslation, translatedLyrics]);

    usePlayerEvents(
        {
            onCurrentSongChange: () => {
                setIndexState(0);
                setShowTranslation(false);
                setTranslatedLyrics(null);
                resetLookup();
            },
        },
        [resetLookup],
    );

    useEffect(() => {
        if (lyrics && !translatedLyrics && enableAutoTranslation) {
            void fetchTranslation();
        }
    }, [lyrics, translatedLyrics, enableAutoTranslation, fetchTranslation]);

    const languages = useMemo(() => {
        const local = data?.local;

        if (Array.isArray(local)) {
            return local.map((lyric, languageIndex) => ({
                label: lyric.lang,
                value: languageIndex.toString(),
            }));
        }

        if (local && !Array.isArray(local) && 'lyrics' in local) {
            return [{ label: 'xxx', value: '0' }];
        }

        return [];
    }, [data?.local]);

    const isLoadingLyrics = isLoading;
    const hasNoLyrics = !lyrics;

    useEffect(() => {
        if (!fadeOutNoLyricsMessage) {
            setShouldFadeOut(false);
            return undefined;
        }

        if (!isLoadingLyrics && hasNoLyrics) {
            const timer = setTimeout(() => {
                setShouldFadeOut(true);
            }, 3000);

            return () => clearTimeout(timer);
        }

        if (!hasNoLyrics) {
            setShouldFadeOut(false);
        }

        return undefined;
    }, [fadeOutNoLyricsMessage, hasNoLyrics, isLoadingLyrics]);

    const handleExportLyrics = useCallback(() => {
        if (lyrics) {
            openLyricsExportModal({ lyrics, offsetMs: currentOffsetMs, synced });
        }
    }, [currentOffsetMs, lyrics, synced]);

    const handleOpenSettings = () => {
        openLyricsSettingsModal(settingsKey);
    };

    const dictionaryPanel =
        selectedToken && enabledDictionaryMap.size > 0 ? (
            <div
                className={
                    lookupLayout === 'mobile-split'
                        ? styles.lookupPanelSplit
                        : styles.lookupPanelDocked
                }
            >
                <YomitanDictionaryPanel
                    dictionaries={installedDictionaries}
                    entries={lookupEntries}
                    error={lookupError}
                    loading={lookupLoading}
                    onClose={resetLookup}
                    token={selectedToken}
                />
            </div>
        ) : null;

    return (
        <ComponentErrorBoundary>
            <div className={styles.lyricsContainer}>
                {showSettingsButton && (
                    <ActionIcon
                        className={styles.settingsIcon}
                        icon="settings2"
                        iconProps={{ size: 'lg' }}
                        onClick={handleOpenSettings}
                        pos="absolute"
                        right={0}
                        top={0}
                        variant="subtle"
                    />
                )}

                {isLoadingLyrics ? (
                    <Spinner container />
                ) : (
                    <AnimatePresence mode="sync">
                        {hasNoLyrics ? (
                            <Center w="100%">
                                <motion.div
                                    animate={{ opacity: shouldFadeOut ? 0 : 1 }}
                                    initial={{ opacity: 1 }}
                                    transition={{ duration: 0.5 }}
                                >
                                    <Group>
                                        <Text fw={500} isMuted isNoSelect>
                                            {t('page.fullscreenPlayer.noLyrics', {
                                                postProcess: 'sentenceCase',
                                            })}
                                        </Text>
                                    </Group>
                                </motion.div>
                            </Center>
                        ) : (
                            <motion.div
                                animate={{ opacity: 1 }}
                                className={clsx(styles.contentArea, {
                                    [styles.contentAreaSplit]:
                                        lookupLayout === 'mobile-split' && !!selectedToken,
                                })}
                                initial={{ opacity: 0 }}
                                transition={{ duration: 0.5 }}
                            >
                                <div
                                    className={clsx(styles.scrollContainer, {
                                        [styles.scrollContainerSplit]:
                                            lookupLayout === 'mobile-split' && !!selectedToken,
                                    })}
                                >
                                    {synced ? (
                                        <SynchronizedLyrics
                                            {...(lyrics as SynchronizedLyricsProps)}
                                            offsetMs={currentOffsetMs}
                                            onSelectToken={
                                                enabledDictionaryMap.size > 0
                                                    ? handleLookupToken
                                                    : undefined
                                            }
                                            settingsKey={settingsKey}
                                            tokenizedLines={tokenizedLines}
                                            translatedLyrics={
                                                showTranslation ? translatedLyrics : null
                                            }
                                        />
                                    ) : (
                                        <UnsynchronizedLyrics
                                            {...(lyrics as UnsynchronizedLyricsProps)}
                                            onSelectToken={
                                                enabledDictionaryMap.size > 0
                                                    ? handleLookupToken
                                                    : undefined
                                            }
                                            settingsKey={settingsKey}
                                            tokenizedLines={tokenizedLines}
                                            translatedLyrics={
                                                showTranslation ? translatedLyrics : null
                                            }
                                        />
                                    )}
                                </div>
                                {dictionaryPanel}
                            </motion.div>
                        )}
                    </AnimatePresence>
                )}

                {showActions && (
                    <div className={styles.actionsContainer}>
                        <LyricsActions
                            hasLyrics={!!lyrics}
                            index={indexToUse}
                            languages={languages}
                            offsetMs={currentOffsetMs}
                            onExportLyrics={handleExportLyrics}
                            onRemoveLyric={handleOnRemoveLyric}
                            onSearchOverride={handleOnSearchOverride}
                            onTranslateLyric={
                                translationApiProvider && translationApiKey
                                    ? handleOnTranslateLyric
                                    : undefined
                            }
                            onUpdateOffset={handleUpdateOffset}
                            setIndex={setIndex}
                        />
                    </div>
                )}
            </div>
        </ComponentErrorBoundary>
    );
};
