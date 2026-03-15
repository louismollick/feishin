import clsx from 'clsx';

import styles from './player-bar.module.css';

import { Playerbar } from '/@/renderer/features/player/components/playerbar';
import { useFullScreenPlayerStore } from '/@/renderer/store';
import { usePlayerbarOpenDrawer } from '/@/renderer/store';

export const PlayerBar = () => {
    const playerbarOpenDrawer = usePlayerbarOpenDrawer();
    const { activeTab, expanded: isFullScreenPlayerExpanded } = useFullScreenPlayerStore();
    const isLyricsOverlayOpen = isFullScreenPlayerExpanded && activeTab === 'lyrics';

    return (
        <div
            className={clsx({
                [styles.container]: true,
                [styles.locked]: isLyricsOverlayOpen,
                [styles.openDrawer]: playerbarOpenDrawer,
            })}
            id="player-bar"
        >
            <Playerbar />
        </div>
    );
};
