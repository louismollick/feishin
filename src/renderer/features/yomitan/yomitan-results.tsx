import { useEffect, useMemo, useRef, useState } from 'react';

import styles from './yomitan-results.module.css';

import {
    createTermEntryRenderer,
    YomitanDictionarySummary,
    YomitanLookupEntry,
    YomitanRenderedTermEntry,
    YomitanRenderHostOptions,
    YomitanTermEntryRenderer,
} from '/@/renderer/features/yomitan/core';
import { useColorScheme } from '/@/renderer/themes/use-app-theme';

interface MountedEntryProps {
    entryNode: HTMLElement;
}

const MountedEntry = ({ entryNode }: MountedEntryProps) => {
    const ref = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const node = ref.current;

        if (!node) {
            return;
        }

        node.replaceChildren(entryNode);

        return () => {
            node.replaceChildren();
        };
    }, [entryNode]);

    return <div ref={ref} />;
};

interface YomitanResultsProps {
    dictionaryInfo: YomitanDictionarySummary[];
    entries: YomitanLookupEntry[];
}

export const YomitanResults = ({ dictionaryInfo, entries }: YomitanResultsProps) => {
    const colorScheme = useColorScheme();
    const mountNode = useRef<HTMLDivElement | null>(null);
    const [renderedEntries, setRenderedEntries] = useState<YomitanRenderedTermEntry[]>([]);
    const rendererRef = useRef<null | YomitanTermEntryRenderer>(null);

    const renderOptions = useMemo<YomitanRenderHostOptions>(
        () => ({
            language: 'en',
            theme: colorScheme,
        }),
        [colorScheme],
    );

    useEffect(() => {
        if (!mountNode.current) {
            return;
        }

        const renderer = createTermEntryRenderer();
        renderer.prepareHost(mountNode.current, renderOptions);
        rendererRef.current = renderer;

        return () => {
            setRenderedEntries([]);
            renderer.destroy();
            rendererRef.current = null;
        };
    }, [renderOptions]);

    useEffect(() => {
        if (!mountNode.current || !rendererRef.current) {
            return;
        }

        rendererRef.current.updateHost(mountNode.current, renderOptions);
        setRenderedEntries(
            rendererRef.current.renderTermEntries(entries, dictionaryInfo, renderOptions),
        );
    }, [dictionaryInfo, entries, renderOptions]);

    return (
        <div className={styles.results} ref={mountNode}>
            <div className={styles.entries}>
                {renderedEntries.map((renderedEntry) => (
                    <div className={styles.entry} key={renderedEntry.index}>
                        <MountedEntry entryNode={renderedEntry.entryNode} />
                    </div>
                ))}
            </div>
        </div>
    );
};
