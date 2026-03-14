import { Suspense, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './downloads-route.module.css';

import { ItemImage } from '/@/renderer/components/item-image/item-image';
import { NativeScrollArea } from '/@/renderer/components/native-scroll-area/native-scroll-area';
import { useOfflineArtworkUrl } from '/@/renderer/features/offline/hooks/use-offline-artwork-url';
import { usePlayer } from '/@/renderer/features/player/context/player-context';
import { AnimatedPage } from '/@/renderer/features/shared/components/animated-page';
import { LibraryContainer } from '/@/renderer/features/shared/components/library-container';
import { LibraryHeaderBar } from '/@/renderer/features/shared/components/library-header-bar';
import { PageErrorBoundary } from '/@/renderer/features/shared/components/page-error-boundary';
import {
    useOfflineActions,
    useOfflineDownloadedTracks,
    useOfflineJobs,
    useOfflineMode,
} from '/@/renderer/store';
import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Button } from '/@/shared/components/button/button';
import { Group } from '/@/shared/components/group/group';
import { Spinner } from '/@/shared/components/spinner/spinner';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';
import { LibraryItem, OfflineTrackRecord } from '/@/shared/types/domain-types';

const DownloadsRow = ({
    onPlay,
    record,
    status,
}: {
    onPlay: () => void;
    record: OfflineTrackRecord;
    status: string;
}) => {
    const { removeTrack, retryTrack } = useOfflineActions();
    const artworkUrl = useOfflineArtworkUrl(record.serverId, record.imageId);

    return (
        <div className={styles.row}>
            <ItemImage
                className={styles.image}
                enableViewport={false}
                explicitStatus={record.song.explicitStatus}
                itemType={LibraryItem.SONG}
                src={artworkUrl || undefined}
            />
            <div className={styles.metadata}>
                <Text fw={600} truncate>
                    {record.song.name}
                </Text>
                <Text isMuted size="sm" truncate>
                    {record.song.artistName || 'Unknown artist'}
                </Text>
                <Text isMuted size="xs" truncate>
                    {record.song.album || 'Unknown album'}
                </Text>
                <Text isMuted size="xs">
                    {status}
                </Text>
            </div>
            <Group gap="xs">
                {record.status === 'downloaded' ? (
                    <Button onClick={onPlay} size="xs" variant="filled">
                        Play
                    </Button>
                ) : (
                    <Button
                        onClick={() => retryTrack(record.serverId, record.songId)}
                        size="xs"
                        variant="light"
                    >
                        Retry
                    </Button>
                )}
                <ActionIcon
                    icon="delete"
                    onClick={() => removeTrack(record.serverId, record.songId)}
                    tooltip={{ label: 'Remove download' }}
                    variant="subtle"
                />
            </Group>
        </div>
    );
};

const DownloadsRoute = () => {
    const { t } = useTranslation();
    const { setQueue } = usePlayer();
    const downloadedTracks = useOfflineDownloadedTracks();
    const jobs = useOfflineJobs();
    const offlineMode = useOfflineMode();

    const allTracks = useMemo(() => {
        const downloaded = downloadedTracks;
        const failedOrQueued = Object.values(jobs)
            .filter((job) => !downloaded.some((track) => track.id === job.id))
            .map(
                (job) =>
                    ({
                        artworkId: null,
                        audioBlob: null,
                        downloadedAt: null,
                        error: job.error,
                        id: job.id,
                        imageId: job.song.imageId,
                        lyricsId: null,
                        mimeType: null,
                        serverId: job.serverId,
                        sizeBytes: 0,
                        song: job.song,
                        songId: job.songId,
                        sourceRefs: [{ id: job.songId, type: LibraryItem.SONG }],
                        status:
                            job.status === 'downloading' || job.status === 'queued'
                                ? job.status
                                : 'failed',
                    }) satisfies OfflineTrackRecord,
            );

        return [...downloaded, ...failedOrQueued];
    }, [downloadedTracks, jobs]);

    const handlePlay = (trackId: string) => {
        const playableTracks = downloadedTracks.map((track) => track.song);
        const index = downloadedTracks.findIndex((track) => track.id === trackId);
        setQueue(playableTracks, index, 0);
    };

    return (
        <AnimatedPage>
            <NativeScrollArea
                pageHeaderProps={{
                    backgroundColor: 'var(--theme-colors-background)',
                    children: (
                        <LibraryHeaderBar>
                            <LibraryHeaderBar.Title>
                                {t('page.sidebar.downloads', {
                                    defaultValue: 'Downloads',
                                    postProcess: 'titleCase',
                                })}
                            </LibraryHeaderBar.Title>
                        </LibraryHeaderBar>
                    ),
                    offset: 200,
                }}
            >
                <LibraryContainer>
                    <Stack className={styles.content} gap="md" mb="5rem" px="2rem">
                        <Text isMuted size="sm">
                            {offlineMode
                                ? 'Offline mode active. Only downloaded tracks are guaranteed to play.'
                                : 'Manage songs saved for offline playback.'}
                        </Text>
                        {allTracks.length === 0 ? (
                            <div className={styles.emptyState}>
                                <Text fw={600}>No offline downloads yet.</Text>
                                <Text isMuted size="sm">
                                    Use the song, album, or playlist context menu in the web app to
                                    save music for offline playback.
                                </Text>
                            </div>
                        ) : (
                            allTracks.map((record) => {
                                const job = jobs[record.id];
                                const status =
                                    record.status === 'downloaded'
                                        ? 'Downloaded'
                                        : job?.status === 'downloading'
                                          ? `Downloading ${job.progress}%`
                                          : job?.status === 'queued'
                                            ? 'Queued'
                                            : record.error || 'Failed';

                                return (
                                    <DownloadsRow
                                        key={record.id}
                                        onPlay={() => handlePlay(record.id)}
                                        record={record}
                                        status={status}
                                    />
                                );
                            })
                        )}
                    </Stack>
                </LibraryContainer>
            </NativeScrollArea>
        </AnimatedPage>
    );
};

const DownloadsRouteWithBoundary = () => {
    return (
        <PageErrorBoundary>
            <Suspense fallback={<Spinner container />}>
                <DownloadsRoute />
            </Suspense>
        </PageErrorBoundary>
    );
};

export default DownloadsRouteWithBoundary;
