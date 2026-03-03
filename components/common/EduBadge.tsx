import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface EduBadgeProps {
    shouldShow?: boolean;
    size?: 'small' | 'medium';
}

/**
 * EduBadge - displays "edu" tag for HKBU affiliated users
 */
export const EduBadge: React.FC<EduBadgeProps> = ({ shouldShow = true, size = 'small' }) => {
    if (!shouldShow) {
        return null;
    }

    const styles = getStyles(size);

    return (
        <View style={styles.badge}>
            <Text style={styles.badgeText}>Edu</Text>
        </View>
    );
};

const getStyles = (size: 'small' | 'medium') => {
    if (size === 'small') {
        return StyleSheet.create({
            badge: {
                paddingHorizontal: 4,
                paddingVertical: 1,
                backgroundColor: 'transparent',
                borderRadius: 3,
                marginLeft: 4,
                borderWidth: 1,
                borderColor: '#1E3A8A',
            },
            badgeText: {
                fontSize: 9,
                fontWeight: '600',
                color: '#1E3A8A',
                letterSpacing: 0.2,
            }
        });
    } else {
        return StyleSheet.create({
            badge: {
                paddingHorizontal: 6,
                paddingVertical: 2,
                backgroundColor: 'transparent',
                borderRadius: 4,
                marginLeft: 6,
                borderWidth: 1,
                borderColor: '#1E3A8A',
            },
            badgeText: {
                fontSize: 10,
                fontWeight: '600',
                color: '#1E3A8A',
                letterSpacing: 0.2,
            }
        });
    }
};
