import { useCallback } from 'react';

import {
    isOfflineReadOnly,
    showOfflineReadOnlyToast,
} from '/@/renderer/features/offline/offline-capabilities';
import { useSetRatingMutation } from '/@/renderer/features/shared/mutations/set-rating-mutation';
import { LibraryItem } from '/@/shared/types/domain-types';

export const useSetRating = () => {
    const setRatingMutation = useSetRatingMutation({});

    const setRating = useCallback(
        (serverId: string, id: string[], itemType: LibraryItem, rating: number) => {
            if (isOfflineReadOnly()) {
                showOfflineReadOnlyToast();
                return;
            }

            setRatingMutation.mutate({
                apiClientProps: { serverId },
                query: { id, rating, type: itemType },
            });
        },
        [setRatingMutation],
    );

    return setRating;
};
