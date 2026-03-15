import { useQuery, useQueryClient } from '@tanstack/react-query';
import isElectron from 'is-electron';
import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './yomitan-dictionary-settings.module.css';

import {
    areDictionaryPreferencesEqual,
    deleteDictionary,
    getInstalledDictionaries,
    importDictionaryZip,
    normalizeYomitanDictionaryPreferences,
    RECOMMENDED_DICTIONARIES,
    YomitanDictionaryPreference,
} from '/@/renderer/features/yomitan/core';
import { yomitanQueryKeys } from '/@/renderer/features/yomitan/yomitan-query';
import { useLyricsSettings, useSettingsStoreActions } from '/@/renderer/store';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Button } from '/@/shared/components/button/button';
import { Switch } from '/@/shared/components/switch/switch';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';

const yomitanApi = isElectron() ? window.api.yomitan : null;

const formatImportDate = (importDate: number) => {
    if (!importDate) {
        return '';
    }

    return new Date(importDate).toLocaleDateString();
};

export const YomitanDictionarySettings = () => {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const inputRef = useRef<HTMLInputElement | null>(null);
    const lyricsSettings = useLyricsSettings();
    const { setSettings } = useSettingsStoreActions();
    const [isImporting, setIsImporting] = useState(false);
    const [isInstallingRecommended, setIsInstallingRecommended] = useState(false);

    const {
        data: installedDictionaries = [],
        isFetching,
        refetch,
    } = useQuery({
        queryFn: getInstalledDictionaries,
        queryKey: yomitanQueryKeys.dictionaries,
    });

    const normalizedPreferences = useMemo(
        () =>
            normalizeYomitanDictionaryPreferences(
                installedDictionaries.map((item) => item.title),
                lyricsSettings.yomitanDictionaries,
            ),
        [installedDictionaries, lyricsSettings.yomitanDictionaries],
    );

    useEffect(() => {
        if (
            areDictionaryPreferencesEqual(normalizedPreferences, lyricsSettings.yomitanDictionaries)
        ) {
            return;
        }

        setSettings({
            lyrics: {
                ...lyricsSettings,
                yomitanDictionaries: normalizedPreferences,
            },
        });
    }, [lyricsSettings, normalizedPreferences, setSettings]);

    const updatePreferences = (preferences: YomitanDictionaryPreference[]) => {
        setSettings({
            lyrics: {
                ...lyricsSettings,
                yomitanDictionaries: preferences,
            },
        });
    };

    const refreshDictionaries = async () => {
        await queryClient.invalidateQueries({
            queryKey: yomitanQueryKeys.dictionaries,
        });
        await refetch();
    };

    const handleUploadSelection = async (event: ChangeEvent<HTMLInputElement>) => {
        const files = event.currentTarget.files ? Array.from(event.currentTarget.files) : [];

        if (files.length === 0) {
            return;
        }

        setIsImporting(true);

        let imported = 0;
        let failed = 0;

        try {
            for (const file of files) {
                try {
                    await importDictionaryZip(await file.arrayBuffer());
                    imported += 1;
                } catch (error) {
                    failed += 1;
                    console.error(`Failed importing dictionary ${file.name}:`, error);
                }
            }

            await refreshDictionaries();

            if (failed === 0) {
                toast.success({
                    message:
                        imported === 1
                            ? t('setting.yomitanImportSuccessOne', {
                                  defaultValue: 'Imported 1 dictionary.',
                              })
                            : t('setting.yomitanImportSuccessMany', {
                                  count: imported,
                                  defaultValue: 'Imported {{count}} dictionaries.',
                              }),
                });
            } else {
                toast.warn({
                    message: t('setting.yomitanImportPartial', {
                        defaultValue: 'Imported {{imported}}, failed {{failed}}.',
                        failed,
                        imported,
                    }),
                });
            }
        } finally {
            setIsImporting(false);
            event.currentTarget.value = '';
        }
    };

    const handleInstallRecommended = async () => {
        if (!yomitanApi) {
            return;
        }

        setIsInstallingRecommended(true);

        let imported = 0;
        let failed = 0;

        try {
            for (const url of RECOMMENDED_DICTIONARIES) {
                try {
                    const archive = await yomitanApi.downloadRecommendedDictionary(url);
                    await importDictionaryZip(archive);
                    imported += 1;
                } catch (error) {
                    failed += 1;
                    console.error(`Failed installing recommended dictionary ${url}:`, error);
                }
            }

            await refreshDictionaries();

            if (failed === 0) {
                toast.success({
                    message: t('setting.yomitanRecommendedSuccess', {
                        count: imported,
                        defaultValue: 'Installed {{count}} recommended dictionaries.',
                    }),
                });
            } else {
                toast.warn({
                    message: t('setting.yomitanRecommendedPartial', {
                        defaultValue: 'Installed {{imported}}, failed {{failed}}.',
                        failed,
                        imported,
                    }),
                });
            }
        } finally {
            setIsInstallingRecommended(false);
        }
    };

    const handleToggleEnabled = (title: string, enabled: boolean) => {
        updatePreferences(
            normalizedPreferences.map((item) =>
                item.title === title ? { ...item, enabled } : item,
            ),
        );
    };

    const handleMovePreference = (index: number, direction: -1 | 1) => {
        const nextIndex = index + direction;

        if (nextIndex < 0 || nextIndex >= normalizedPreferences.length) {
            return;
        }

        const next = [...normalizedPreferences];
        const [item] = next.splice(index, 1);
        next.splice(nextIndex, 0, item);
        updatePreferences(next);
    };

    const handleDeleteDictionary = async (title: string) => {
        try {
            await deleteDictionary(title);
            await refreshDictionaries();
            toast.success({
                message: t('setting.yomitanDeleteSuccess', {
                    defaultValue: 'Deleted {{title}}.',
                    title,
                }),
            });
        } catch (error) {
            console.error(`Failed deleting dictionary ${title}:`, error);
            toast.error({
                message: t('setting.yomitanDeleteFailed', {
                    defaultValue: 'Failed to delete {{title}}.',
                    title,
                }),
            });
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <Text fw={600}>
                    {t('setting.yomitanDictionaries', {
                        defaultValue: 'Yomitan dictionaries',
                    })}
                </Text>
                <Text isMuted size="sm">
                    {t('setting.yomitanDictionaries_description', {
                        defaultValue:
                            'Install, enable, and prioritize dictionaries used for lyric lookups.',
                    })}
                </Text>
            </div>

            <div className={styles.actions}>
                <Button
                    loading={isImporting}
                    onClick={() => inputRef.current?.click()}
                    size="compact-sm"
                >
                    {t('setting.yomitanUpload', {
                        defaultValue: 'Upload dictionaries',
                    })}
                </Button>
                {isElectron() && (
                    <Button
                        loading={isInstallingRecommended}
                        onClick={handleInstallRecommended}
                        size="compact-sm"
                        variant="default"
                    >
                        {t('setting.yomitanDownloadRecommended', {
                            defaultValue: 'Download recommended dictionaries',
                        })}
                    </Button>
                )}
                <Button
                    loading={isFetching}
                    onClick={refreshDictionaries}
                    size="compact-sm"
                    variant="default"
                >
                    {t('common.refresh', {
                        defaultValue: 'Refresh',
                    })}
                </Button>
            </div>

            <input
                accept=".zip,application/zip"
                multiple
                onChange={handleUploadSelection}
                ref={inputRef}
                style={{ display: 'none' }}
                type="file"
            />

            <div className={styles.list}>
                {normalizedPreferences.length === 0 ? (
                    <Text isMuted size="sm">
                        {t('setting.yomitanNoDictionaries', {
                            defaultValue: 'No dictionaries installed yet.',
                        })}
                    </Text>
                ) : (
                    normalizedPreferences.map((preference, index) => {
                        const dictionaryInfo = installedDictionaries.find(
                            (item) => item.title === preference.title,
                        );

                        return (
                            <div className={styles.row} key={preference.title}>
                                <div className={styles.rowMeta}>
                                    <Text fw={600}>{preference.title}</Text>
                                    {dictionaryInfo ? (
                                        <Text isMuted size="sm">
                                            {t('setting.yomitanImportedOn', {
                                                date: formatImportDate(dictionaryInfo.importDate),
                                                defaultValue: 'Imported {{date}}',
                                            })}
                                        </Text>
                                    ) : null}
                                </div>
                                <div className={styles.rowActions}>
                                    <Switch
                                        checked={preference.enabled}
                                        onChange={(e) =>
                                            handleToggleEnabled(
                                                preference.title,
                                                e.currentTarget.checked,
                                            )
                                        }
                                    />
                                    <ActionIcon
                                        disabled={index === 0}
                                        icon="arrowUp"
                                        onClick={() => handleMovePreference(index, -1)}
                                        size="compact-sm"
                                        variant="default"
                                    />
                                    <ActionIcon
                                        disabled={index === normalizedPreferences.length - 1}
                                        icon="arrowDown"
                                        onClick={() => handleMovePreference(index, 1)}
                                        size="compact-sm"
                                        variant="default"
                                    />
                                    <ActionIcon
                                        color="red"
                                        icon="delete"
                                        onClick={() => handleDeleteDictionary(preference.title)}
                                        size="compact-sm"
                                        variant="default"
                                    />
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};
