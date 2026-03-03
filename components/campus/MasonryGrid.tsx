import React from 'react';
import { StyleSheet, View } from 'react-native';

interface MasonryGridProps<T> {
    data: T[];
    renderItem: (item: T, index: number) => React.ReactNode;
    columnGap?: number;
    columnPadding?: number;
}

/**
 * Two-column masonry grid.
 * Distributes items by index (even → left, odd → right) which gives
 * a natural staggered appearance for posts of mixed heights.
 */
function MasonryGrid<T>({
    data,
    renderItem,
    columnGap = 8,
    columnPadding = 12,
}: MasonryGridProps<T>) {
    const leftItems: { item: T; index: number }[] = [];
    const rightItems: { item: T; index: number }[] = [];

    data.forEach((item, index) => {
        if (index % 2 === 0) {
            leftItems.push({ item, index });
        } else {
            rightItems.push({ item, index });
        }
    });

    return (
        <View
            style={[
                styles.container,
                {
                    paddingHorizontal: columnPadding,
                    gap: columnGap,
                },
            ]}
        >
            {/* Left Column */}
            <View style={[styles.column, { marginRight: columnGap / 2 }]}>
                {leftItems.map(({ item, index }) => (
                    <React.Fragment key={index}>
                        {renderItem(item, index)}
                    </React.Fragment>
                ))}
            </View>

            {/* Right Column — offset slightly for the XHS stagger effect */}
            <View style={[styles.column, styles.rightColumn, { marginLeft: columnGap / 2 }]}>
                {rightItems.map(({ item, index }) => (
                    <React.Fragment key={index}>
                        {renderItem(item, index)}
                    </React.Fragment>
                ))}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    column: {
        flex: 1,
    },
    rightColumn: {
        marginTop: 20, // stagger the right column slightly for visual interest
    },
});

export default MasonryGrid;
