import { useQuery } from '@tanstack/react-query';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './mobile-fullscreen-player.module.css';

import { SONG_TABLE_COLUMNS } from '/@/renderer/components/item-list/item-table-list/default-columns';
import {
    computeSelectedFromResult,
    getDisplayOffset,
    lyricsQueries,
} from '/@/renderer/features/lyrics/api/lyrics-api';
import { openLyricsExportModal } from '/@/renderer/features/lyrics/components/lyrics-export-form';
import {
    ListConfigMenu,
    SONG_DISPLAY_TYPES,
} from '/@/renderer/features/shared/components/list-config-menu';
import {
    useFullScreenPlayerStore,
    useFullScreenPlayerStoreActions,
    useLyricsDisplaySettings,
    useLyricsSettings,
    usePlayerSong,
    useSettingsStore,
    useSettingsStoreActions,
} from '/@/renderer/store';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Button } from '/@/shared/components/button/button';
import { Divider } from '/@/shared/components/divider/divider';
import { Group } from '/@/shared/components/group/group';
import { NumberInput } from '/@/shared/components/number-input/number-input';
import { Option } from '/@/shared/components/option/option';
import { Popover } from '/@/shared/components/popover/popover';
import { SegmentedControl } from '/@/shared/components/segmented-control/segmented-control';
import { Slider } from '/@/shared/components/slider/slider';
import { Switch } from '/@/shared/components/switch/switch';
import { useDisclosure } from '/@/shared/hooks/use-disclosure';
import { QueueSong } from '/@/shared/types/domain-types';
import { ItemListKey, ListDisplayType } from '/@/shared/types/types';

interface MobileFullscreenPlayerHeaderProps {
    currentSong?: QueueSong;
    isPageHovered: boolean;
    onClose: () => void;
}

interface MobileFullscreenPlayerSettingsButtonProps {
    isPageHovered: boolean;
    showLyricsExport?: boolean;
}

export const MobileFullscreenPlayerSettingsButton = memo(
    ({ isPageHovered, showLyricsExport = false }: MobileFullscreenPlayerSettingsButtonProps) => {
        const { t } = useTranslation();
        const currentSong = usePlayerSong();
        const [opened, popoverHandlers] = useDisclosure(false);
        const {
            dynamicBackground,
            dynamicImageBlur,
            dynamicIsImage,
            opacity,
            useImageAspectRatio,
        } = useFullScreenPlayerStore();
        const { setStore } = useFullScreenPlayerStoreActions();
        const { setSettings } = useSettingsStoreActions();
        const lyricsSettings = useLyricsSettings();
        const displaySettings = useLyricsDisplaySettings('default');
        const { preferLocalLyrics } = lyricsSettings;
        const lyricConfig = { ...lyricsSettings, ...displaySettings };
        const { data: lyricsData } = useQuery(
            lyricsQueries.songLyrics(
                {
                    options: {
                        enabled: showLyricsExport && !!currentSong?.id,
                    },
                    query: { songId: currentSong?.id || '' },
                    serverId: currentSong?._serverId || '',
                },
                currentSong,
            ),
        );

        const { exportLyrics, exportOffsetMs, selectedSynced } = useMemo(() => {
            if (!lyricsData) {
                return {
                    exportLyrics: null,
                    exportOffsetMs: 0,
                    selectedSynced: false,
                };
            }

            const selectedIndex = lyricsData.selectedStructuredIndex ?? 0;
            const { selected, selectedSynced } = computeSelectedFromResult(
                lyricsData,
                preferLocalLyrics,
                selectedIndex,
            );

            return {
                exportLyrics: selected,
                exportOffsetMs: getDisplayOffset(
                    selected,
                    lyricsData.selectedOffsetMs,
                    selectedIndex,
                    lyricsData.local,
                ),
                selectedSynced,
            };
        }, [lyricsData, preferLocalLyrics]);

        const handleLyricsSettings = (property: string, value: any) => {
            const displayProperties = ['fontSize', 'fontSizeUnsync', 'gap', 'gapUnsync'];
            if (displayProperties.includes(property)) {
                const currentDisplay = useSettingsStore.getState().lyricsDisplay;
                setSettings({
                    lyricsDisplay: {
                        ...currentDisplay,
                        default: {
                            ...currentDisplay.default,
                            [property]: value,
                        },
                    },
                });
            } else {
                setSettings({
                    lyrics: {
                        ...useSettingsStore.getState().lyrics,
                        [property]: value,
                    },
                });
            }
        };

        const handleExportLyrics = () => {
            if (!exportLyrics) {
                return;
            }

            popoverHandlers.close();
            openLyricsExportModal({
                lyrics: exportLyrics,
                offsetMs: exportOffsetMs,
                synced: selectedSynced,
            });
        };

        return (
            <Popover
                onChange={(value) => {
                    if (value) {
                        popoverHandlers.open();
                    } else {
                        popoverHandlers.close();
                    }
                }}
                opened={opened}
                position="bottom-end"
            >
                <Popover.Target>
                    <ActionIcon
                        icon="settings2"
                        iconProps={{ size: 'lg' }}
                        onClick={popoverHandlers.toggle}
                        tooltip={{ label: t('common.configure', { postProcess: 'titleCase' }) }}
                        variant={isPageHovered ? 'default' : 'subtle'}
                    />
                </Popover.Target>
                <Popover.Dropdown>
                    <Option>
                        <Option.Label>
                            {t('page.fullscreenPlayer.config.dynamicBackground', {
                                postProcess: 'sentenceCase',
                            })}
                        </Option.Label>
                        <Option.Control>
                            <Switch
                                defaultChecked={dynamicBackground}
                                onChange={(e) =>
                                    setStore({
                                        dynamicBackground: e.target.checked,
                                    })
                                }
                            />
                        </Option.Control>
                    </Option>
                    {dynamicBackground && (
                        <Option>
                            <Option.Label>
                                {t('page.fullscreenPlayer.config.dynamicIsImage', {
                                    postProcess: 'sentenceCase',
                                })}
                            </Option.Label>
                            <Option.Control>
                                <Switch
                                    defaultChecked={dynamicIsImage}
                                    onChange={(e) =>
                                        setStore({
                                            dynamicIsImage: e.target.checked,
                                        })
                                    }
                                />
                            </Option.Control>
                        </Option>
                    )}
                    {dynamicBackground && dynamicIsImage && (
                        <Option>
                            <Option.Label>
                                {t('page.fullscreenPlayer.config.dynamicImageBlur', {
                                    postProcess: 'sentenceCase',
                                })}
                            </Option.Label>
                            <Option.Control>
                                <Slider
                                    defaultValue={dynamicImageBlur}
                                    label={(e) => `${e} rem`}
                                    max={6}
                                    min={0}
                                    onChangeEnd={(e) => setStore({ dynamicImageBlur: Number(e) })}
                                    step={0.5}
                                    w="100%"
                                />
                            </Option.Control>
                        </Option>
                    )}
                    {dynamicBackground && (
                        <Option>
                            <Option.Label>
                                {t('page.fullscreenPlayer.config.opacity', {
                                    postProcess: 'sentenceCase',
                                })}
                            </Option.Label>
                            <Option.Control>
                                <Slider
                                    defaultValue={opacity}
                                    label={(e) => `${e} %`}
                                    max={100}
                                    min={0}
                                    onChangeEnd={(e) => setStore({ opacity: Number(e) })}
                                    w="100%"
                                />
                            </Option.Control>
                        </Option>
                    )}
                    <Option>
                        <Option.Label>
                            {t('page.fullscreenPlayer.config.useImageAspectRatio', {
                                postProcess: 'sentenceCase',
                            })}
                        </Option.Label>
                        <Option.Control>
                            <Switch
                                checked={useImageAspectRatio}
                                onChange={(e) =>
                                    setStore({
                                        useImageAspectRatio: e.target.checked,
                                    })
                                }
                            />
                        </Option.Control>
                    </Option>
                    <Divider my="sm" />
                    <Option>
                        <Option.Label>
                            {t('page.fullscreenPlayer.config.followCurrentLyric', {
                                postProcess: 'sentenceCase',
                            })}
                        </Option.Label>
                        <Option.Control>
                            <Switch
                                checked={lyricConfig.follow}
                                onChange={(e) =>
                                    handleLyricsSettings('follow', e.currentTarget.checked)
                                }
                            />
                        </Option.Control>
                    </Option>
                    <Option>
                        <Option.Label>
                            {t('page.fullscreenPlayer.config.showLyricProvider', {
                                postProcess: 'sentenceCase',
                            })}
                        </Option.Label>
                        <Option.Control>
                            <Switch
                                checked={lyricConfig.showProvider}
                                onChange={(e) =>
                                    handleLyricsSettings('showProvider', e.currentTarget.checked)
                                }
                            />
                        </Option.Control>
                    </Option>
                    <Option>
                        <Option.Label>
                            {t('page.fullscreenPlayer.config.showLyricMatch', {
                                postProcess: 'sentenceCase',
                            })}
                        </Option.Label>
                        <Option.Control>
                            <Switch
                                checked={lyricConfig.showMatch}
                                onChange={(e) =>
                                    handleLyricsSettings('showMatch', e.currentTarget.checked)
                                }
                            />
                        </Option.Control>
                    </Option>
                    <Option>
                        <Option.Label>
                            {t('page.fullscreenPlayer.config.lyricSize', {
                                postProcess: 'sentenceCase',
                            })}
                        </Option.Label>
                        <Option.Control>
                            <Group w="100%" wrap="nowrap">
                                <Slider
                                    defaultValue={lyricConfig.fontSize}
                                    label={(e) =>
                                        `${t('page.fullscreenPlayer.config.synchronized', {
                                            postProcess: 'titleCase',
                                        })}: ${e}px`
                                    }
                                    max={72}
                                    min={8}
                                    onChangeEnd={(e) => handleLyricsSettings('fontSize', Number(e))}
                                    w="100%"
                                />
                                <Slider
                                    defaultValue={lyricConfig.fontSizeUnsync}
                                    label={(e) =>
                                        `${t('page.fullscreenPlayer.config.unsynchronized', {
                                            postProcess: 'sentenceCase',
                                        })}: ${e}px`
                                    }
                                    max={72}
                                    min={8}
                                    onChangeEnd={(e) =>
                                        handleLyricsSettings('fontSizeUnsync', Number(e))
                                    }
                                    w="100%"
                                />
                            </Group>
                        </Option.Control>
                    </Option>
                    <Option>
                        <Option.Label>
                            {t('page.fullscreenPlayer.config.lyricGap', {
                                postProcess: 'sentenceCase',
                            })}
                        </Option.Label>
                        <Option.Control>
                            <Group w="100%" wrap="nowrap">
                                <Slider
                                    defaultValue={lyricConfig.gap}
                                    label={(e) => `Synchronized: ${e}px`}
                                    max={50}
                                    min={0}
                                    onChangeEnd={(e) => handleLyricsSettings('gap', Number(e))}
                                    w="100%"
                                />
                                <Slider
                                    defaultValue={lyricConfig.gapUnsync}
                                    label={(e) => `Unsynchronized: ${e}px`}
                                    max={50}
                                    min={0}
                                    onChangeEnd={(e) =>
                                        handleLyricsSettings('gapUnsync', Number(e))
                                    }
                                    w="100%"
                                />
                            </Group>
                        </Option.Control>
                    </Option>
                    <Option>
                        <Option.Label>
                            {t('page.fullscreenPlayer.config.lyricAlignment', {
                                postProcess: 'sentenceCase',
                            })}
                        </Option.Label>
                        <Option.Control>
                            <SegmentedControl
                                data={[
                                    {
                                        label: t('common.left', {
                                            postProcess: 'titleCase',
                                        }),
                                        value: 'left',
                                    },
                                    {
                                        label: t('common.center', {
                                            postProcess: 'titleCase',
                                        }),
                                        value: 'center',
                                    },
                                    {
                                        label: t('common.right', {
                                            postProcess: 'titleCase',
                                        }),
                                        value: 'right',
                                    },
                                ]}
                                onChange={(e) => handleLyricsSettings('alignment', e)}
                                value={lyricConfig.alignment}
                            />
                        </Option.Control>
                    </Option>
                    <Option>
                        <Option.Label>
                            {t('page.fullscreenPlayer.config.lyricOffset', {
                                postProcess: 'sentenceCase',
                            })}
                        </Option.Label>
                        <Option.Control>
                            <NumberInput
                                defaultValue={lyricConfig.delayMs}
                                hideControls={false}
                                onBlur={(e) =>
                                    handleLyricsSettings('delayMs', Number(e.currentTarget.value))
                                }
                                step={10}
                            />
                        </Option.Control>
                    </Option>
                    {showLyricsExport ? (
                        <Option>
                            <Option.Control>
                                <Button
                                    disabled={!exportLyrics}
                                    onClick={handleExportLyrics}
                                    size="compact-sm"
                                    uppercase
                                    variant="subtle"
                                >
                                    {t('form.lyricsExport.export', {
                                        postProcess: 'sentenceCase',
                                    })}
                                </Button>
                            </Option.Control>
                        </Option>
                    ) : null}
                    <Divider my="sm" />
                </Popover.Dropdown>
            </Popover>
        );
    },
);

export const MobileFullscreenPlayerHeader = memo(
    ({ isPageHovered, onClose }: MobileFullscreenPlayerHeaderProps) => {
        const { t } = useTranslation();
        const { opacity } = useFullScreenPlayerStore();

        return (
            <div
                className={styles.header}
                style={{
                    background: `rgb(var(--theme-colors-background-transparent), ${opacity}%)`,
                }}
            >
                <ActionIcon
                    icon="arrowDownS"
                    iconProps={{ size: 'lg' }}
                    onClick={onClose}
                    tooltip={{ label: t('common.minimize', { postProcess: 'titleCase' }) }}
                    variant={isPageHovered ? 'default' : 'subtle'}
                />
                <MobileFullscreenPlayerSettingsButton isPageHovered={isPageHovered} />
                <ListConfigMenu
                    buttonProps={{
                        variant: isPageHovered ? 'default' : 'subtle',
                    }}
                    displayTypes={[
                        { hidden: true, value: ListDisplayType.GRID },
                        ...SONG_DISPLAY_TYPES,
                    ]}
                    listKey={ItemListKey.FULL_SCREEN}
                    optionsConfig={{
                        table: {
                            itemsPerPage: { hidden: true },
                            pagination: { hidden: true },
                        },
                    }}
                    tableColumnsData={SONG_TABLE_COLUMNS}
                />
            </div>
        );
    },
);

MobileFullscreenPlayerSettingsButton.displayName = 'MobileFullscreenPlayerSettingsButton';
MobileFullscreenPlayerHeader.displayName = 'MobileFullscreenPlayerHeader';
