import { formatDistanceToNow } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { MessageCircle, ThumbsUp } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { ForumPost } from '../../types';
import { isRemoteImageUrl } from '../../utils/remoteImage';
import { isAdminSync, isHKBUEmail } from '../../utils/userUtils';
import { AdminBadge } from '../common/AdminBadge';
import { CachedRemoteImage } from '../common/CachedRemoteImage';
import { EduBadge } from '../common/EduBadge';

interface ForumPostRowProps {
    post: ForumPost;
    onPress: () => void;
    onAuthorPress?: (authorId: string) => void;
    onLongPress?: () => void;
}

const categoryColor: Record<string, string> = {
    general: '#1E3A8A',
    activity: '#3B82F6',
    guide: '#10B981',
    lost_found: '#F59E00',
    marketplace: '#EC4899',
    teaming: '#8B5CF6',
    confession: '#EF4444',
    help: '#F59E00',
};

/** Right-side thumbnail: fixed 80×80 square, preserves crop center */
const THUMB = 80;

/** Shows the first image as a compact square on the right */
const RightThumb: React.FC<{ uri: string }> = ({ uri }) => {
    const [ready, setReady] = useState(false);
    return (
        <CachedRemoteImage
            uri={uri}
            style={[styles.thumb, !ready && styles.thumbLoading]}
            onLoad={() => setReady(true)}
        />
    );
};

export const ForumPostRow: React.FC<ForumPostRowProps> = React.memo(({ post, onPress, onAuthorPress, onLongPress }) => {
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

    const thumbs = (post.images || []).filter(isRemoteImageUrl);
    const firstThumb = thumbs[0];          // show only first image on the right
    const hasImage = !!firstThumb;

    return (
        <Animated.View style={animStyle}>
            <TouchableOpacity
                style={styles.row}
                onPress={onPress}
                onLongPress={onLongPress}
                onPressIn={onPressIn}
                onPressOut={onPressOut}
                activeOpacity={1}
            >
                {/* Left: text content */}
                <View style={styles.left}>
                    {/* Author + category badge */}
                    <TouchableOpacity
                        style={styles.authorLine}
                        onPress={() => onAuthorPress?.(post.authorId)}
                        disabled={!onAuthorPress}
                        activeOpacity={onAuthorPress ? 0.7 : 1}
                    >
                        <Text style={styles.authorName} numberOfLines={1}>{post.authorName}</Text>
                        <AdminBadge shouldShow={isAdminSync(post.authorId)} size="small" />
                        <EduBadge shouldShow={isHKBUEmail(post.authorEmail)} size="small" />
                        <View style={[styles.catBadge, { backgroundColor: categoryColor[post.category] + '1A' }]}>
                            <Text style={[styles.catText, { color: categoryColor[post.category] }]}>
                                {t(`forum.compose.category_label.${post.category}`)}
                            </Text>
                        </View>
                        {post.isFollowingAuthor && (
                            <View style={styles.followingBadge}>
                                <View style={styles.followingBadgeDot} />
                                <Text style={styles.followingBadgeText}>{t('campus.following_badge')}</Text>
                            </View>
                        )}
                    </TouchableOpacity>

                    {/* Title with Badges */}
                    <Text style={styles.title} numberOfLines={hasImage ? 2 : 3}>
                        {!!(post.contentType === 'official') && (
                            <View style={[styles.inlineBadge, { backgroundColor: '#10B981' }]}>
                                <Text style={styles.inlineBadgeText}>{t('forum.badges.official')}</Text>
                            </View>
                        )}
                        {!!post.isPinned && (
                            <View style={[styles.inlineBadge, { backgroundColor: '#6366F1' }]}>
                                <Text style={styles.inlineBadgeText}>{t('forum.badges.featured')}</Text>
                            </View>
                        )}
                        {!!(post.upvoteCount >= 10 || (post.viewCount && post.viewCount > 100)) && (
                            <View style={[styles.inlineBadge, { backgroundColor: '#EF4444' }]}>
                                <Text style={styles.inlineBadgeText}>{t('forum.badges.hot')}</Text>
                            </View>
                        )}
                        <Text> </Text>
                        {post.title}
                    </Text>

                    {/* Snippet (Small preview of content) */}
                    {post.content && (
                        <Text style={styles.snippet} numberOfLines={hasImage ? 1 : 2}>
                            {post.content.replace(/\n/g, ' ')}
                        </Text>
                    )}

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
                        {post.viewCount !== undefined && post.viewCount > 0 && (
                            <View style={styles.statItem}>
                                <Text style={styles.statText}>
                                    {post.viewCount > 1000 ? `${(post.viewCount / 1000).toFixed(1)}k` : post.viewCount} {t('forum.row.views')}
                                </Text>
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
    followingBadge: {
        backgroundColor: '#EFF6FF',
        borderColor: '#BFDBFE',
        borderWidth: 1,
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 999,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    followingBadgeDot: {
        width: 5,
        height: 5,
        borderRadius: 2.5,
        backgroundColor: '#1D4ED8',
    },
    followingBadgeText: {
        fontSize: 9,
        fontWeight: '700',
        color: '#1D4ED8',
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
    inlineBadge: {
        borderRadius: 4,
        paddingHorizontal: 4,
        paddingVertical: 1,
        marginRight: 4,
        alignSelf: 'center',
        justifyContent: 'center',
        // Use a slight offset to align with text baseline
        top: 1,
    },
    inlineBadgeText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '900',
        lineHeight: 14,
    },
    snippet: {
        fontSize: 13,
        color: '#4B5563',
        lineHeight: 18,
        marginTop: 2,
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
