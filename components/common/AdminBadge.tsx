import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface AdminBadgeProps {
    shouldShow?: boolean;
    size?: 'small' | 'medium';
}

/**
 * AdminBadge - displays "Admin" tag for app administrators
 * Red color to distinguish from BU_Edu badge (blue)
 */
export const AdminBadge: React.FC<AdminBadgeProps> = ({ shouldShow = true, size = 'small' }) => {
    console.log('[AdminBadge] Rendered with shouldShow:', shouldShow, 'size:', size);
    
    if (!shouldShow) {
        console.log('[AdminBadge] Not rendering (shouldShow=false)');
        return null;
    }

    const styles = getStyles(size);

    console.log('[AdminBadge] Rendering Admin badge');
    return (
        <View style={styles.badge}>
            <Text style={styles.badgeText}>Admin</Text>
        </View>
    );
};

const getStyles = (size: 'small' | 'medium') => {
    if (size === 'small') {
        return StyleSheet.create({
            badge: {
                paddingHorizontal: 4,
                paddingVertical: 1,
                backgroundColor: '#DC2626', // Red background for admin
                borderRadius: 3,
                marginLeft: 4,
                borderWidth: 1,
                borderColor: '#991B1B', // Darker red border
            },
            badgeText: {
                fontSize: 9,
                fontWeight: '600',
                color: '#FFFFFF', // White text for contrast
                letterSpacing: 0.2,
            }
        });
    } else {
        return StyleSheet.create({
            badge: {
                paddingHorizontal: 6,
                paddingVertical: 2,
                backgroundColor: '#DC2626', // Red background for admin
                borderRadius: 4,
                marginLeft: 6,
                borderWidth: 1,
                borderColor: '#991B1B', // Darker red border
            },
            badgeText: {
                fontSize: 10,
                fontWeight: '600',
                color: '#FFFFFF', // White text for contrast
                letterSpacing: 0.2,
            }
        });
    }
};
