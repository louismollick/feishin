import { useEffect, useMemo, useRef, useState } from 'react';

import { api } from '/@/renderer/api';
import { resolvePlayableSource } from '/@/renderer/features/offline/offline-service';
import { TranscodingConfig } from '/@/renderer/store';
import { QueueSong } from '/@/shared/types/domain-types';

export function useSongUrl(
    song: QueueSong | undefined,
    current: boolean,
    transcode: TranscodingConfig,
): string | undefined {
    const prior = useRef(['', '']);
    const [offlineUrl, setOfflineUrl] = useState<string>();

    useEffect(() => {
        let cancelled = false;
        let revoke: (() => void) | null = null;

        if (!song?._serverId) {
            setOfflineUrl(undefined);
            return;
        }

        resolvePlayableSource(song)
            .then((source) => {
                if (cancelled || !source) {
                    source?.revoke();
                    if (!cancelled) {
                        setOfflineUrl(undefined);
                    }
                    return;
                }

                revoke = source.revoke;
                setOfflineUrl(source.url);
            })
            .catch(() => {
                if (!cancelled) {
                    setOfflineUrl(undefined);
                }
            });

        return () => {
            cancelled = true;
            revoke?.();
        };
    }, [song]);

    const remoteUrl = useMemo(() => {
        if (song?._serverId) {
            // If we are the current track, we do not want a transcoding
            // reconfiguration to force a restart.
            if (current && prior.current[0] === song._uniqueId) {
                return prior.current[1];
            }

            const url = api.controller.getStreamUrl({
                apiClientProps: { serverId: song._serverId },
                query: {
                    bitrate: transcode.bitrate,
                    format: transcode.format,
                    id: song.id,
                    transcode: transcode.enabled,
                },
            });

            // transcoding enabled; save the updated result
            prior.current = [song._uniqueId, url];
            return url;
        }

        // no track; clear result
        prior.current = ['', ''];
        return undefined;
    }, [
        song?._serverId,
        song?._uniqueId,
        song?.id,
        current,
        transcode.bitrate,
        transcode.format,
        transcode.enabled,
    ]);

    if (offlineUrl) {
        return offlineUrl;
    }

    if (!navigator.onLine) {
        return undefined;
    }

    return remoteUrl;
}

export const getSongUrl = (song: QueueSong, transcode: TranscodingConfig) => {
    return api.controller.getStreamUrl({
        apiClientProps: { serverId: song._serverId },
        query: {
            bitrate: transcode.bitrate,
            format: transcode.format,
            id: song.id,
            transcode: transcode.enabled,
        },
    });
};
