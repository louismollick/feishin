import { useMemo } from 'react';

import { useOfflineMode, useOfflineStoreBase } from '/@/renderer/store/offline.store';
import { toast } from '/@/shared/components/toast/toast';

const OFFLINE_READ_ONLY_MESSAGE = 'Offline mode is read-only. Reconnect to make changes.';

export const isOfflineReadOnly = () => useOfflineStoreBase.getState().offlineMode;

export const useOfflineReadOnly = () => {
    const offlineMode = useOfflineMode();

    return useMemo(
        () => ({
            canMutate: !offlineMode,
            offlineMode,
        }),
        [offlineMode],
    );
};

export const showOfflineReadOnlyToast = () => {
    toast.info({
        message: OFFLINE_READ_ONLY_MESSAGE,
    });
};
