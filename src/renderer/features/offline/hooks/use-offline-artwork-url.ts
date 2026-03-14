import { useEffect, useState } from 'react';

import { getOfflineArtworkUrl } from '/@/renderer/features/offline/offline-service';

export const useOfflineArtworkUrl = (serverId?: string, imageId?: null | string) => {
    const [artworkUrl, setArtworkUrl] = useState<null | string>(null);

    useEffect(() => {
        let cancelled = false;

        if (!serverId || !imageId) {
            setArtworkUrl(null);
            return;
        }

        getOfflineArtworkUrl(serverId, imageId)
            .then((url) => {
                if (!cancelled) {
                    setArtworkUrl(url);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setArtworkUrl(null);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [imageId, serverId]);

    return artworkUrl;
};
