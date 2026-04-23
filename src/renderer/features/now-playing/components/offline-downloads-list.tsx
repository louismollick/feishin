import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './offline-downloads-list.module.css';

import { useOfflineJobs, useOfflineTracksMap } from '/@/renderer/store';
import { Group } from '/@/shared/components/group/group';
import { ScrollArea } from '/@/shared/components/scroll-area/scroll-area';
import { SegmentedControl } from '/@/shared/components/segmented-control/segmented-control';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';

type DownloadsFilterMode = 'downloaded' | 'inProgress';

interface OfflineDownloadsListProps {
    searchTerm?: string;
}

export const OfflineDownloadsList = ({ searchTerm }: OfflineDownloadsListProps) => {
    const { t } = useTranslation();
    const tracksMap = useOfflineTracksMap();
    const jobs = useOfflineJobs();
    const [filter, setFilter] = useState<DownloadsFilterMode>('inProgress');

    const filteredTracks = useMemo(() => {
        const tracks = Object.values(tracksMap).filter((track) => {
            if (filter === 'downloaded') {
                return track.status === 'downloaded';
            }

            return track.status === 'queued' || track.status === 'downloading';
        });

        const searchValue = searchTerm?.trim().toLowerCase();

        const searchedTracks =
            searchValue && searchValue.length > 0
                ? tracks.filter((track) => {
                      const haystack = [
                          track.song.name,
                          track.song.album,
                          track.song.albumArtistName,
                          track.song.artistName,
                      ]
                          .filter(Boolean)
                          .join(' ')
                          .toLowerCase();

                      return haystack.includes(searchValue);
                  })
                : tracks;

        if (filter === 'downloaded') {
            return searchedTracks.sort((a, b) => {
                const left = a.downloadedAt || '';
                const right = b.downloadedAt || '';
                return right.localeCompare(left);
            });
        }

        return searchedTracks.sort((a, b) => {
            const leftJobUpdatedAt = jobs[a.id]?.updatedAt || '';
            const rightJobUpdatedAt = jobs[b.id]?.updatedAt || '';
            const timestampCompare = rightJobUpdatedAt.localeCompare(leftJobUpdatedAt);

            if (timestampCompare !== 0) {
                return timestampCompare;
            }

            return a.id.localeCompare(b.id);
        });
    }, [filter, jobs, searchTerm, tracksMap]);

    return (
        <div className={styles.container}>
            <Group className={styles.filterRow}>
                <SegmentedControl
                    data={[
                        {
                            label: t('player.downloadsFilterInProgress', {
                                defaultValue: 'In Progress',
                                postProcess: 'titleCase',
                            }),
                            value: 'inProgress',
                        },
                        {
                            label: t('player.downloadsFilterDownloaded', {
                                defaultValue: 'Downloaded',
                                postProcess: 'titleCase',
                            }),
                            value: 'downloaded',
                        },
                    ]}
                    onChange={(value) => setFilter(value as DownloadsFilterMode)}
                    value={filter}
                />
            </Group>

            {filteredTracks.length === 0 ? (
                <div className={styles.empty}>
                    <Text isMuted size="sm">
                        {t('common.noResultsFromQuery', { postProcess: 'sentenceCase' })}
                    </Text>
                </div>
            ) : (
                <ScrollArea className={styles.scrollArea}>
                    <Stack className={styles.list} gap={0}>
                        {filteredTracks.map((track) => {
                            const job = jobs[track.id];
                            const statusText =
                                track.status === 'downloaded'
                                    ? t('player.downloadsFilterDownloaded', {
                                          defaultValue: 'Downloaded',
                                          postProcess: 'titleCase',
                                      })
                                    : track.status === 'downloading'
                                      ? `${t('player.downloadStatusDownloading', {
                                            defaultValue: 'Downloading',
                                            postProcess: 'sentenceCase',
                                        })} ${job?.progress || 0}%`
                                      : t('player.downloadStatusQueued', {
                                            defaultValue: 'Queued',
                                            postProcess: 'titleCase',
                                        });

                            return (
                                <div className={styles.row} key={track.id}>
                                    <Text fw={600} size="sm">
                                        {track.song.name}
                                    </Text>
                                    <Text className={styles.meta} size="xs">
                                        {track.song.artistName || track.song.albumArtistName}
                                    </Text>
                                    <Text className={styles.meta} size="xs">
                                        {statusText}
                                    </Text>
                                </div>
                            );
                        })}
                    </Stack>
                </ScrollArea>
            )}
        </div>
    );
};
