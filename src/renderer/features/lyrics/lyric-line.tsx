import clsx from 'clsx';
import { ComponentPropsWithoutRef, memo, ReactNode, useMemo } from 'react';

import styles from './lyric-line.module.css';

import { Box } from '/@/shared/components/box/box';
import { Stack } from '/@/shared/components/stack/stack';

interface LyricLineProps extends ComponentPropsWithoutRef<'div'> {
    alignment: 'center' | 'left' | 'right';
    fontSize: number;
    renderedContent?: ReactNode;
    text?: string;
    translatedText?: string;
}

export const LyricLine = memo(
    ({
        alignment,
        className,
        fontSize,
        renderedContent,
        text = '',
        translatedText,
        ...props
    }: LyricLineProps) => {
        const lines = useMemo(() => text.split('_BREAK_'), [text]);

        const style = useMemo(
            () => ({
                fontSize,
                textAlign: alignment,
            }),
            [fontSize, alignment],
        );

        return (
            <Box className={clsx(styles.lyricLine, className)} style={style} {...props}>
                <Stack gap={0}>
                    {renderedContent ? (
                        <span className={styles.tokenizedContent}>{renderedContent}</span>
                    ) : (
                        lines.map((line, index) => <span key={index}>{line}</span>)
                    )}
                    {translatedText ? (
                        <span className={styles.translatedLine}>{translatedText}</span>
                    ) : null}
                </Stack>
            </Box>
        );
    },
);

LyricLine.displayName = 'LyricLine';
