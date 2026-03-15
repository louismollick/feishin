import isElectron from 'is-electron';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '/@/renderer/api';
import { useOfflineActions, useOfflineTracksMap } from '/@/renderer/store';
import { useCurrentServer } from '/@/renderer/store/auth.store';
import { ContextMenu } from '/@/shared/components/context-menu/context-menu';
import { LibraryItem, Song } from '/@/shared/types/domain-types';

interface DownloadActionProps {
    ids: string[];
    itemType: LibraryItem;
    songs?: Song[];
}

const utils = isElectron() ? window.api.utils : null;

export const DownloadAction = ({ ids, itemType, songs }: DownloadActionProps) => {
    const { t } = useTranslation();
    const server = useCurrentServer();
    const offlineTracks = useOfflineTracksMap();
    const { queueCollectionDownload, removeTrack } = useOfflineActions();
    const areAllSongsDownloaded =
        !isElectron() &&
        Boolean(songs?.length) &&
        songs!.every((song) => Boolean(offlineTracks[`${song._serverId}:${song.id}`]));

    const onSelect = useCallback(async () => {
        try {
            if (isElectron()) {
                for (const id of ids) {
                    const downloadUrl = api.controller.getDownloadUrl({
                        apiClientProps: { serverId: server.id },
                        query: { id },
                    });

                    utils?.download(downloadUrl);
                }
                return;
            }

            if (songs?.length && areAllSongsDownloaded) {
                for (const song of songs) {
                    await removeTrack(song._serverId, song.id);
                }
                return;
            }

            await queueCollectionDownload({
                ids,
                itemType,
                serverId: server.id,
                songs,
            });
        } catch (error) {
            console.error('Failed to download items:', error);
        }
    }, [
        areAllSongsDownloaded,
        ids,
        itemType,
        queueCollectionDownload,
        removeTrack,
        server.id,
        songs,
    ]);

    return (
        <ContextMenu.Item leftIcon="download" onSelect={onSelect}>
            {areAllSongsDownloaded
                ? t('page.contextMenu.removeOfflineDownload', {
                      defaultValue: 'remove offline download',
                      postProcess: 'sentenceCase',
                  })
                : t('page.contextMenu.downloadOffline', {
                      defaultValue: 'download for offline',
                      postProcess: 'sentenceCase',
                  })}
        </ContextMenu.Item>
    );
};
