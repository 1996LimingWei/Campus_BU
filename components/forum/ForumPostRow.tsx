import { formatDistanceToNow } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { MessageCircle, ThumbsUp } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { ForumPost } from '../../types';
import { isHKBUEmail } from '../../utils/userUtils';
import { EduBadge } from '../common/EduBadge';

interface ForumPostRowProps {
    post: ForumPost;
    onPress: () => void;
}

const categoryColor: Record<string, string> = {
    general: '#6366F1',
    activity: '#F59E0B',
    guide: '#10B981',
    lost_found: '#EF4444',
};

const isValidUrl = (url?: string) =>
    !!url && (url.startsWith('http://') || url.startsWith('https://'));

/** Right-side thumbnail: fixed 80×80 square, preserves crop center */
const THUMB = 80;

/** Shows the first image as a compact square on the right */
const RightThumb: React.FC<{ uri: string }> = ({ uri }) => {
    const [ready, setReady] = useState(false);
    return (
        <Image
            source={{ uri }}
            style={[styles.thumb, !ready && styles.thumbLoading]}
            resizeMode="cover"
            onLoad={() => setReady(true)}
        />
    );
};

export const ForumPostRow: React.FC<ForumPostRowProps> = React.memo(({ post, onPress }) => {
    const { t } = useTranslation();
    const pressed = useSharedValue(1);

    const onPressIn = useCallback(() => {
        pressed.value = withSpring(0.98, { damping: 20, stiffness: 120 });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, []);

    const onPressOut = useCallback(() => {
        pressed.value = withSpring(1, { damping: 20, stiffness: 120 });
    }, []);

    const animStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pressed.value }],
    }));

    const timeDisplay = formatDistanceToNow(
        post.replyCount > 0 ? post.lastReplyAt : post.createdAt,
        { addSuffix: false }
    );

    const thumbs = (post.images || []).filter(isValidUrl);
    const firstThumb = thumbs[0];          // show only first image on the right
    const hasImage = !!firstThumb;

    return (
        <Animated.View style={animStyle}>
            <TouchableOpacity
                style={styles.row}
                onPress={onPress}
                onPressIn={onPressIn}
                onPressOut={onPressOut}
                activeOpacity={1}
            >
                {/* Left: text content */}
                <View style={styles.left}>
                    {/* Author + category badge */}
                    <View style={styles.authorLine}>
                        <Text style={styles.authorName} numberOfLines={1}>{post.authorName}</Text>
                        <EduBadge shouldShow={isHKBUEmail(post.authorEmail)} size="small" />
                        <View style={[styles.catBadge, { backgroundColor: categoryColor[post.category] + '1A' }]}>
                            <Text style={[styles.catText, { color: categoryColor[post.category] }]}>
                                {t(`forum.compose.category_label.${post.category}`)}
                            </Text>
                        </View>
                    </View>

                    {/* Title */}
                    <Text style={styles.title} numberOfLines={hasImage ? 2 : 3}>{post.title}</Text>

                    {/* Stats */}
                    <View style={styles.statsRow}>
                        <View style={styles.statItem}>
                            <MessageCircle size={14} color="#6B7280" />
                            <Text style={styles.statText}>{post.replyCount} {t('forum.row.replies')}</Text>
                        </View>
                        {post.upvoteCount > 0 && (
                            <View style={styles.statItem}>
                                <ThumbsUp size={14} color="#6B7280" />
                                <Text style={styles.statText}>{post.upvoteCount} {t('forum.row.likes')}</Text>
                            </View>
                        )}
                        <Text style={styles.timeText}>{timeDisplay}</Text>
                    </View>
                </View>

                {/* Right: first image thumbnail */}
                {hasImage && <RightThumb uri={firstThumb} />}
            </TouchableOpacity>
        </Animated.View>
    );
});

const styles = StyleSheet.create({
    row: {
        backgroundColor: '#fff',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#F0F2F8',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    left: {
        flex: 1,
        gap: 5,
    },
    authorLine: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    authorName: {
        fontSize: 12,
        color: '#6B7280',
        fontWeight: '500',
        maxWidth: 90,
    },
    catBadge: {
        paddingHorizontal: 5,
        paddingVertical: 1,
        borderRadius: 5,
    },
    catText: {
        fontSize: 10,
        fontWeight: '700',
    },
    title: {
        fontSize: 15,
        fontWeight: '700',
        color: '#111827',
        lineHeight: 22,
        letterSpacing: -0.1,
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    statItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
    },
    statText: {
        fontSize: 11,
        color: '#9CA3AF',
        fontWeight: '500',
    },
    timeText: {
        fontSize: 11,
        color: '#9CA3AF',
        marginLeft: 'auto',
    },

    // Right-side thumbnail
    thumb: {
        width: THUMB,
        height: THUMB,
        borderRadius: 8,
        flexShrink: 0,
    },
    thumbLoading: {
        backgroundColor: '#F3F4F6',
    },
});
