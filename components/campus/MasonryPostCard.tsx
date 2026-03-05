import { formatDistanceToNow } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Heart, MessageCircle } from 'lucide-react-native';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Image as RNImage,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';
import { Post } from '../../types';
import { isHKBUEmail } from '../../utils/userUtils';
import { EduBadge } from '../common/EduBadge';

interface MasonryPostCardProps {
    post: Post;
    onPress: () => void;
    onLike: () => void;
    currentUserId?: string;
}

const categoryColors: Record<string, string> = {
    Events: '#FF6B6B',
    Reviews: '#4ECDC4',
    Guides: '#FFB347',
    'Lost & Found': '#95E1D3',
};

const categoryKeyMap: Record<string, string> = {
    'Events': 'events',
    'Reviews': 'reviews',
    'Guides': 'guides',
    'Lost & Found': 'lost_found'
};

/** Palette of warm/cool gradient pairs for text-cover cards */
const TEXT_CARD_PALETTES: Array<{ bg: string; accent: string; text: string }> = [
    { bg: '#1E3A8A', accent: '#3B82F6', text: '#fff' },   // deep blue
    { bg: '#7C3AED', accent: '#A78BFA', text: '#fff' },   // violet
    { bg: '#0F766E', accent: '#2DD4BF', text: '#fff' },   // teal
    { bg: '#B45309', accent: '#FBBF24', text: '#fff' },   // amber
    { bg: '#BE185D', accent: '#F472B6', text: '#fff' },   // pink
    { bg: '#166534', accent: '#4ADE80', text: '#fff' },   // green
    { bg: '#1D4ED8', accent: '#93C5FD', text: '#fff' },   // sky blue
    { bg: '#9D174D', accent: '#F9A8D4', text: '#fff' },   // rose
    { bg: '#374151', accent: '#9CA3AF', text: '#fff' },   // slate
    { bg: '#92400E', accent: '#FDE68A', text: '#fff' },   // warm brown
];

/** Deterministic palette picker from post id */
function getPalette(id: string) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = (hash * 31 + id.charCodeAt(i)) & 0xffffffff;
    }
    return TEXT_CARD_PALETTES[Math.abs(hash) % TEXT_CARD_PALETTES.length];
}

const isValidUrl = (url?: string) =>
    !!url && (url.startsWith('http://') || url.startsWith('https://'));

export const MasonryPostCard: React.FC<MasonryPostCardProps> = React.memo(
    ({ post, onPress, onLike, currentUserId }) => {
        const { t } = useTranslation();
        const pressed = useSharedValue(1);

        // Resolved image list
        const images = post.images?.length
            ? post.images
            : post.imageUrl
                ? [post.imageUrl]
                : [];
        const coverImage = images.find(img => isValidUrl(img));
        const isTextOnly = !coverImage;

        const palette = isTextOnly ? getPalette(post.id) : null;
        const timeAgo = formatDistanceToNow(post.createdAt, { addSuffix: true });

        const onPressIn = useCallback(() => {
            pressed.value = withSpring(0.97, { damping: 20, stiffness: 120 });
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }, []);

        const onPressOut = useCallback(() => {
            pressed.value = withSpring(1, { damping: 20, stiffness: 120 });
        }, []);

        const animatedStyle = useAnimatedStyle(() => ({
            transform: [{ scale: pressed.value }],
        }));

        return (
            <Animated.View style={[styles.cardWrapper, animatedStyle]}>
                <TouchableOpacity
                    style={styles.card}
                    onPress={onPress}
                    onPressIn={onPressIn}
                    onPressOut={onPressOut}
                    activeOpacity={1}
                >
                    {/* ── Cover area ── */}
                    {coverImage ? (
                        /* Real image cover */
                        <View style={styles.imageWrapper}>
                            <Image
                                source={{ uri: coverImage }}
                                style={styles.coverImage}
                                contentFit="cover"
                                cachePolicy="memory-disk"
                                recyclingKey={coverImage}
                            />
                            {post.category && post.category !== 'All' && (
                                <View
                                    style={[
                                        styles.categoryBadge,
                                        { backgroundColor: categoryColors[post.category] || '#6B7280' },
                                    ]}
                                >
                                    <Text style={styles.categoryBadgeText}>
                                        {categoryKeyMap[post.category] ? t(`campus.categories.${categoryKeyMap[post.category]}`) : post.category}
                                    </Text>
                                </View>
                            )}
                        </View>
                    ) : (
                        /* Text-cover card (XHS style) */
                        <View style={[styles.textCover, { backgroundColor: palette!.bg }]}>
                            {/* Decorative accent blobs */}
                            <View
                                style={[
                                    styles.blob,
                                    styles.blobTopRight,
                                    { backgroundColor: palette!.accent + '55' },
                                ]}
                            />
                            <View
                                style={[
                                    styles.blob,
                                    styles.blobBottomLeft,
                                    { backgroundColor: palette!.accent + '33' },
                                ]}
                            />

                            {/* Category pill */}
                            {post.category && post.category !== 'All' && (
                                <View style={styles.textCoverCategory}>
                                    <Text style={styles.textCoverCategoryText}>
                                        {categoryKeyMap[post.category] ? t(`campus.categories.${categoryKeyMap[post.category]}`) : post.category}
                                    </Text>
                                </View>
                            )}

                            {/* Main text */}
                            <Text
                                style={[styles.textCoverContent, { color: palette!.text }]}
                                numberOfLines={7}
                            >
                                {post.content}
                            </Text>

                            {/* Fade-out hint at bottom */}
                            <View style={styles.textCoverFade} />
                        </View>
                    )}

                    {/* ── Card body: content preview + author + counts ── */}
                    <View style={styles.body}>
                        {/* Text-card: single-line title from content */}
                        {isTextOnly && (
                            <Text style={styles.textTitle} numberOfLines={1}>
                                {post.content}
                            </Text>
                        )}

                        {/* Image card: one-line content preview above author */}
                        {!isTextOnly && !!post.content && (
                            <Text style={styles.contentPreview} numberOfLines={1}>
                                {post.content}
                            </Text>
                        )}

                        {/* Author row */}
                        <View style={styles.authorRow}>
                            <View style={styles.avatarSmall}>
                                {!post.isAnonymous && isValidUrl(post.authorAvatar) ? (
                                    <RNImage
                                        source={{ uri: post.authorAvatar! }}
                                        style={styles.avatarImage}
                                    />
                                ) : (
                                    <Text style={styles.avatarLetter}>
                                        {post.isAnonymous ? '?' : post.authorName.charAt(0).toUpperCase()}
                                    </Text>
                                )}
                            </View>
                            <Text style={styles.authorName} numberOfLines={1}>
                                {post.isAnonymous ? t('teachers.anonymous_student') : post.authorName}
                            </Text>
                            <EduBadge
                                shouldShow={!post.isAnonymous && isHKBUEmail(post.authorEmail)}
                                size="small"
                            />
                        </View>

                        {/* Counts */}
                        <View style={styles.countRow}>
                            <View style={styles.countItem}>
                                <MessageCircle size={12} color="#9CA3AF" />
                                <Text style={styles.countText}>{post.comments}</Text>
                            </View>
                            <TouchableOpacity style={styles.countItem} onPress={onLike}>
                                <Heart
                                    size={12}
                                    color={post.isLiked ? '#EF4444' : '#9CA3AF'}
                                    fill={post.isLiked ? '#EF4444' : 'transparent'}
                                />
                                <Text style={[styles.countText, post.isLiked && styles.likedText]}>
                                    {post.likes}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </TouchableOpacity>
            </Animated.View>
        );
    }
);

const styles = StyleSheet.create({
    cardWrapper: {
        marginBottom: 10,
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07,
        shadowRadius: 8,
        elevation: 3,
    },

    // ── Real image cover ───────────────────────────────────────────────────────
    imageWrapper: {
        width: '100%',
        aspectRatio: 3 / 4,
        position: 'relative',
        backgroundColor: '#F3F4F6',
    },
    coverImage: {
        width: '100%',
        height: '100%',
    },
    categoryBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
    },
    categoryBadgeText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#fff',
    },

    // ── Text cover (XHS style) ────────────────────────────────────────────────
    textCover: {
        width: '100%',
        aspectRatio: 3 / 4,
        padding: 14,
        justifyContent: 'flex-end',
        overflow: 'hidden',
        position: 'relative',
    },
    blob: {
        position: 'absolute',
        borderRadius: 999,
    },
    blobTopRight: {
        width: 90,
        height: 90,
        top: -20,
        right: -20,
    },
    blobBottomLeft: {
        width: 60,
        height: 60,
        bottom: 30,
        left: -10,
    },
    textCoverCategory: {
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(255,255,255,0.22)',
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 3,
        marginBottom: 8,
    },
    textCoverCategoryText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#fff',
    },
    textCoverContent: {
        fontSize: 14,
        fontWeight: '600',
        lineHeight: 20,
        letterSpacing: 0.1,
    },
    textCoverFade: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 30,
        // subtle bottom transparency — purely decorative, no gradient lib needed
        backgroundColor: 'transparent',
    },

    // ── Card body ─────────────────────────────────────────────────────────────
    body: {
        padding: 10,
    },
    textTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: '#1F2937',
        marginBottom: 6,
    },
    contentPreview: {
        fontSize: 12,
        color: '#6B7280',
        marginBottom: 6,
        lineHeight: 16,
    },
    authorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
        gap: 4,
    },
    avatarSmall: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: '#1E3A8A',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0,
    },
    avatarImage: {
        width: '100%',
        height: '100%',
    },
    avatarLetter: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '700',
    },
    authorName: {
        fontSize: 11,
        color: '#6B7280',
        fontWeight: '500',
        flex: 1,
    },
    countRow: {
        flexDirection: 'row',
        gap: 10,
    },
    countItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
    },
    countText: {
        fontSize: 11,
        color: '#9CA3AF',
        fontWeight: '500',
    },
    likedText: {
        color: '#EF4444',
    },
});
