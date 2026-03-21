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
    onAuthorPress?: (authorId: string) => void;
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
    ({ post, onPress, onLike, currentUserId: _currentUserId, onAuthorPress }) => {
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

        const canOpenAuthor = !!onAuthorPress;

        return (
            <Animated.View style={[styles.cardWrapper, animatedStyle]}>
                <View style={styles.card}>
                    <TouchableOpacity
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
                                {post.isFollowingAuthor && (
                                    <View style={styles.followingBadgeTextCover}>
                                        <View style={styles.followingBadgeContent}>
                                            <View style={[styles.followingBadgeDot, styles.followingBadgeDotOnCover]} />
                                            <Text style={styles.followingBadgeTextOnCover}>{t('campus.following_badge')}</Text>
                                        </View>
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

                                {post.isFollowingAuthor && (
                                    <View style={styles.followingBadgeTextCover}>
                                        <View style={styles.followingBadgeContent}>
                                            <View style={[styles.followingBadgeDot, styles.followingBadgeDotOnCover]} />
                                            <Text style={styles.followingBadgeTextOnCover}>{t('campus.following_badge')}</Text>
                                        </View>
                                    </View>
                                )}

                                <View style={styles.textCoverContentWrap}>
                                    <Text
                                        style={[styles.textCoverContent, { color: palette!.text }]}
                                        numberOfLines={8}
                                    >
                                        {post.content}
                                    </Text>
                                </View>

                                {/* Fade-out hint at bottom */}
                                <View style={styles.textCoverFade} />
                            </View>
                        )}

                        <View style={styles.bodyPrimary}>
                            {/* Image card: one-line content preview above author */}
                            {!isTextOnly && !!post.content && (
                                <Text style={styles.contentPreview} numberOfLines={1}>
                                    {post.content}
                                </Text>
                            )}
                        </View>
                    </TouchableOpacity>

                    <View style={styles.bodyFooter}>
                        {/* Author row */}
                        <TouchableOpacity
                            style={styles.authorRow}
                            onPress={() => {
                                if (canOpenAuthor) {
                                    onAuthorPress?.(post.authorId);
                                }
                            }}
                            disabled={!canOpenAuthor}
                            activeOpacity={canOpenAuthor ? 0.7 : 1}
                            hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
                        >
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
                        </TouchableOpacity>


                        {/* Counts */}
                        <View style={styles.countRow}>
                            <TouchableOpacity style={styles.countItem} onPress={onPress} activeOpacity={0.7}>
                                <MessageCircle size={12} color="#9CA3AF" />
                                <Text style={styles.countText}>{post.comments}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.countItem} onPress={onLike} activeOpacity={0.7}>
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
                </View>
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
        borderRadius: 18,
        overflow: 'hidden',
        shadowColor: '#1E3A8A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.10,
        shadowRadius: 16,
        elevation: 6,
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
        top: 10,
        right: 10,
        minHeight: 22,
        paddingHorizontal: 8,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
    },
    categoryBadgeText: {
        fontSize: 9,
        fontWeight: '700',
        color: '#fff',
    },

    // ── Text cover (XHS style) ────────────────────────────────────────────────
    textCover: {
        width: '100%',
        aspectRatio: 3 / 4,
        paddingHorizontal: 16,
        paddingTop: 18,
        paddingBottom: 18,
        justifyContent: 'center',
        alignItems: 'center',
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
        position: 'absolute',
        top: 10,
        right: 10,
        backgroundColor: 'rgba(255,255,255,0.22)',
        borderRadius: 999,
        minHeight: 22,
        paddingHorizontal: 8,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2,
    },
    textCoverCategoryText: {
        fontSize: 9,
        fontWeight: '700',
        color: '#fff',
    },
    textCoverContentWrap: {
        flex: 1,
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 6,
    },
    textCoverContent: {
        fontSize: 22,
        fontWeight: '700',
        lineHeight: 31,
        letterSpacing: 0.2,
        textAlign: 'center',
        width: '100%',
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
    bodyPrimary: {
        paddingHorizontal: 10,
        paddingTop: 8,
        paddingBottom: 2,
    },
    bodyFooter: {
        paddingHorizontal: 10,
        paddingBottom: 10,
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
        fontWeight: '600',
    },
    followingBadgeInline: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginBottom: 6,
    },
    followingBadgeContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
    },
    followingBadgeDot: {
        width: 5,
        height: 5,
        borderRadius: 2.5,
        backgroundColor: '#1E3A8A',
    },
    followingBadgeText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#1E3A8A',
        letterSpacing: 0.1,
    },
    followingBadgeTextOnCover: {
        fontSize: 9,
        fontWeight: '700',
        color: '#1E3A8A',
        letterSpacing: 0.1,
    },
    followingBadgeTextCover: {
        position: 'absolute',
        top: 10,
        left: 10,
        backgroundColor: '#FFFFFF',
        minHeight: 22,
        paddingHorizontal: 7,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
        zIndex: 3,
    },
    followingBadgeDotOnCover: {
        backgroundColor: '#1E3A8A',
    },
});
