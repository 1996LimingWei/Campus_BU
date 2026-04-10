import { formatDistanceToNow } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
    ChevronLeft,
    Heart,
    MessageCircle,
    MoreHorizontal,
    Send,
    Share2,
    Trash2,
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ActivityIndicator,
    Animated,
    DeviceEventEmitter,
    Dimensions,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { ActionModal } from '../../components/campus/ActionModal';
import { AdminDeletionModal, DeletionReason } from '../../components/campus/AdminDeletionModal';
import { BottomSheet } from '../../components/campus/BottomSheet';
import { SharePostModal } from '../../components/campus/SharePostModal';
import { Toast, ToastType } from '../../components/campus/Toast';
import { CachedRemoteImage } from '../../components/common/CachedRemoteImage';
import { EduBadge } from '../../components/common/EduBadge';
import { TranslatableText } from '../../components/common/TranslatableText';
import { ZoomableImageCarousel } from '../../components/common/ZoomableImageCarousel';
import { useLoginPrompt } from '../../hooks/useLoginPrompt';
import { useUgcEntryActions } from '../../hooks/useUgcEntryActions';
import { getCurrentUser } from '../../services/auth';
import {
    addPostComment,
    deleteComment,
    deletePost,
    fetchPostById,
    fetchPostComments,
    togglePostLike,
} from '../../services/campus';
import { sendDirectMessage } from '../../services/messages';
import { Post, PostComment } from '../../types';
import { isRemoteImageUrl } from '../../utils/remoteImage';
import { isAdmin, isHKBUEmail } from '../../utils/userUtils';

const { width: SCREEN_W } = Dimensions.get('window');

// ── Palette for text-only cover (same as MasonryPostCard) ──────────────────
const TEXT_CARD_PALETTES = [
    { bg: '#1E3A8A', accent: '#3B82F6', text: '#fff' },
    { bg: '#7C3AED', accent: '#A78BFA', text: '#fff' },
    { bg: '#0F766E', accent: '#2DD4BF', text: '#fff' },
    { bg: '#B45309', accent: '#FBBF24', text: '#fff' },
    { bg: '#BE185D', accent: '#F472B6', text: '#fff' },
    { bg: '#166534', accent: '#4ADE80', text: '#fff' },
    { bg: '#1D4ED8', accent: '#93C5FD', text: '#fff' },
    { bg: '#9D174D', accent: '#F9A8D4', text: '#fff' },
    { bg: '#374151', accent: '#9CA3AF', text: '#fff' },
    { bg: '#92400E', accent: '#FDE68A', text: '#fff' },
];

function getPalette(id: string) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = (hash * 31 + id.charCodeAt(i)) & 0xffffffff;
    }
    return TEXT_CARD_PALETTES[Math.abs(hash) % TEXT_CARD_PALETTES.length];
}

const categoryColors: Record<string, string> = {
    Events: '#FF6B6B',
    Reviews: '#4ECDC4',
    Guides: '#FFB347',
    'Lost & Found': '#95E1D3',
};

export default function PostDetailScreen() {
    const { id, coverImage: coverImageParam, isTextOnly: isTextOnlyParam } = useLocalSearchParams<{
        id: string;
        coverImage?: string;
        isTextOnly?: string;
    }>();
    const router = useRouter();
    const { t } = useTranslation();
    const { checkLogin } = useLoginPrompt();

    // ── Zoom entrance animation ────────────────────────────────────────────────
    const animScale = useRef(new Animated.Value(0.93)).current;
    const animOpacity = useRef(new Animated.Value(0)).current;

    const [post, setPost] = useState<Post | null>(null);
    const [comments, setComments] = useState<PostComment[]>([]);
    const [commentText, setCommentText] = useState('');
    const [loading, setLoading] = useState(true);
    const [imageZoomed, setImageZoomed] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);

    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [deleteType, setDeleteType] = useState<'post' | 'comment'>('post');
    const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
    const [settingsSheetVisible, setSettingsSheetVisible] = useState(false);
    const [adminDeletionModalVisible, setAdminDeletionModalVisible] = useState(false);
    const [userDeletionConfirmVisible, setUserDeletionConfirmVisible] = useState(false);
    const [isAdminUser, setIsAdminUser] = useState(false);
    const [isOwnPost, setIsOwnPost] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);

    // Check if current user is admin
    React.useEffect(() => {
        const checkAdminStatus = async () => {
            if (currentUser?.uid) {
                const admin = await isAdmin(currentUser.uid);
                setIsAdminUser(admin);
            } else {
                setIsAdminUser(false);
            }
        };
        checkAdminStatus();
    }, [currentUser?.uid]);

    // Check if current user owns the post
    React.useEffect(() => {
        if (post && currentUser?.uid) {
            setIsOwnPost(post.authorId === currentUser.uid);
        } else {
            setIsOwnPost(false);
        }
    }, [post, currentUser?.uid]);

    const openUserProfile = (authorId?: string, anonymous?: boolean) => {
        if (!authorId || anonymous) return;

        if (authorId === currentUser?.uid) {
            router.push('/(tabs)/profile');
            return;
        }

        router.push({ pathname: '/profile/[id]' as any, params: { id: authorId } });
    };

    const [toast, setToast] = useState<{ visible: boolean; message: string; type: ToastType }>({
        visible: false,
        message: '',
        type: 'success',
    });
    const [replyTarget, setReplyTarget] = useState<PostComment | null>(null);
    const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);
    const commentInputRef = useRef<TextInput>(null);
    const commentFlashAnim = useRef(new Animated.Value(0)).current;
    const triggerCommentFlash = (commentId: string) => {
        setHighlightedCommentId(commentId);
        commentFlashAnim.stopAnimation();
        commentFlashAnim.setValue(0);
        Animated.sequence([
            Animated.timing(commentFlashAnim, {
                toValue: 1,
                duration: 140,
                useNativeDriver: false,
            }),
            Animated.timing(commentFlashAnim, {
                toValue: 0,
                duration: 260,
                useNativeDriver: false,
            }),
        ]).start(() => {
            setHighlightedCommentId(current => (current === commentId ? null : current));
        });
    };
    const ugcActions = useUgcEntryActions({
        currentUserId: currentUser?.uid,
        ensureLoggedIn: () => !!checkLogin(currentUser),
        onFlash: triggerCommentFlash,
        onBlockedUser: (blockedUserId) => {
            setComments((prev) => prev.filter((comment) => comment.authorId !== blockedUserId));
            if (post?.authorId === blockedUserId) {
                setPost(null);
            }
        },
    });

    // Fire zoom animation immediately on mount
    useEffect(() => {
        Animated.parallel([
            Animated.spring(animScale, {
                toValue: 1,
                useNativeDriver: true,
                damping: 22,
                stiffness: 200,
                mass: 0.8,
            }),
            Animated.timing(animOpacity, {
                toValue: 1,
                duration: 180,
                useNativeDriver: true,
            }),
        ]).start();
    }, []);

    const loadData = async () => {
        if (!id) return;
        try {
            setLoading(true);
            const user = await getCurrentUser();
            setCurrentUser(user);
            const postData = await fetchPostById(id as string, user?.uid);
            if (postData) {
                setPost(postData);
                const commentsData = await fetchPostComments(id as string, user?.uid);
                setComments(commentsData);
            }
        } catch (error) {
            console.error('Error loading post details:', error);
        } finally {
            setLoading(false);
        }
    };

    const organizedComments = React.useMemo(() => {
        const rootComments = comments.filter(c => !c.parentCommentId);
        const replyMap: Record<string, PostComment[]> = {};

        comments.forEach(c => {
            if (c.parentCommentId) {
                if (!replyMap[c.parentCommentId]) replyMap[c.parentCommentId] = [];
                replyMap[c.parentCommentId].push(c);
            }
        });

        return rootComments.map(root => ({
            ...root,
            replies: replyMap[root.id] || []
        }));
    }, [comments]);

    useEffect(() => {
        loadData();
    }, [id]);

    const triggerReply = (comment: PostComment) => {
        setReplyTarget(comment);
        triggerCommentFlash(comment.id);
        setTimeout(() => commentInputRef.current?.focus(), 100);
    };

    const handleLike = async () => {
        if (!checkLogin(currentUser)) return;
        if (!post) return;
        const wasLiked = post.isLiked;
        const previousLikes = post.likes;

        // Optimistic update
        setPost(prev =>
            prev
                ? { ...prev, isLiked: !wasLiked, likes: wasLiked ? previousLikes - 1 : previousLikes + 1 }
                : null
        );

        try {
            await togglePostLike(post.id, currentUser.uid);
            // Global sync
            DeviceEventEmitter.emit('campus_post_updated', {
                id: post.id,
                updates: { isLiked: !wasLiked, likes: wasLiked ? previousLikes - 1 : previousLikes + 1 }
            });
        } catch (error) {
            console.error('Error liking post:', error);
            // Rollback on error
            setPost(prev =>
                prev
                    ? { ...prev, isLiked: wasLiked, likes: previousLikes }
                    : null
            );
        }
    };

    const handleSendComment = async () => {
        if (!checkLogin(currentUser)) return;
        if (!commentText.trim() || !post) return;
        try {
            setSubmitting(true);
            const newComment = await addPostComment({
                postId: post.id,
                authorId: currentUser.uid,
                authorName: currentUser.displayName || 'Anonymous',
                authorEmail: (currentUser as any).email,
                authorAvatar: currentUser.avatarUrl || undefined,
                content: commentText.trim(),
                parentCommentId: replyTarget?.parentCommentId || replyTarget?.id || undefined,
                replyToName: replyTarget?.authorName || undefined,
            });
            if (newComment) {
                setComments(prev => [...prev, newComment]);
                const nextCommentsCount = post.comments + 1;
                setPost(prev => (prev ? { ...prev, comments: nextCommentsCount } : null));
                DeviceEventEmitter.emit('campus_post_updated', {
                    id: post.id,
                    updates: { comments: nextCommentsCount }
                });
                setCommentText('');
                setReplyTarget(null);
                Keyboard.dismiss();
                setToast({ visible: true, message: t('campus_detail.comment_success', '评论成功！'), type: 'success' });
            }
        } catch (error) {
            setToast({ visible: true, message: t('campus_detail.comment_error', '评论失败'), type: 'error' });
        } finally {
            setSubmitting(false);
        }
    };

    const triggerDeletePost = () => {
        setDeleteType('post');
        setDeleteModalVisible(true);
    };

    const triggerDeleteComment = (commentId: string) => {
        setSelectedCommentId(commentId);
        setDeleteType('comment');
        setDeleteModalVisible(true);
    };

    const confirmDelete = async () => {
        if (deleteType === 'post') {
            if (!post) return;
            try {
                await deletePost(post.id);
                setDeleteModalVisible(false);
                setToast({ visible: true, message: t('campus_detail.deleted', '已删除'), type: 'success' });
                // Global sync for deletion
                DeviceEventEmitter.emit('campus_post_updated', { id: post.id, deleted: true });
                setTimeout(() => {
                    if (router.canGoBack()) {
                        router.back();
                    } else {
                        router.replace('/(tabs)/campus' as any);
                    }
                }, 1000);
            } catch {
                setToast({ visible: true, message: t('campus_detail.delete_failed', '删除失败'), type: 'error' });
                setDeleteModalVisible(false);
            }
        } else {
            if (!selectedCommentId) return;
            try {
                await deleteComment(selectedCommentId);
                setComments(prev => prev.filter(c => c.id !== selectedCommentId));
                setPost(prev => prev ? { ...prev, comments: Math.max(0, prev.comments - 1) } : null);
                setToast({ visible: true, message: t('campus_detail.comment_deleted', '评论已删除'), type: 'success' });
            } catch {
                setToast({ visible: true, message: t('campus_detail.delete_failed', '删除失败'), type: 'error' });
            } finally {
                setDeleteModalVisible(false);
                setSelectedCommentId(null);
            }
        }
    };

    // Admin deletion handlers
    const handleAdminDeletePress = () => {
        setSettingsSheetVisible(false);
        setTimeout(() => {
            setAdminDeletionModalVisible(true);
        }, 300);
    };

    const handleAdminDeleteConfirm = async (reason: DeletionReason, customReason?: string) => {
        if (!post) {
            console.error('[PostDetail] No post to delete');
            return;
        }

        try {
            setAdminDeletionModalVisible(false);
            setLoading(true);

            // Call the delete function
            await deletePost(post.id);

            // Show success toast
            const reasonText = reason === 'other' && customReason
                ? t('campus_detail.deletion_reason_custom', { defaultValue: '原因：{{reason}}', reason: customReason })
                : getReasonDisplayText(reason);
            setToast({
                visible: true,
                message: t('campus_detail.post_deleted_with_reason', {
                    defaultValue: '帖子已删除（{{reason}}）',
                    reason: reasonText,
                }),
                type: 'success'
            });

            // Global sync for deletion
            DeviceEventEmitter.emit('campus_post_updated', {
                id: post.id,
                deleted: true,
                deletionReason: reason,
                deletionCustomReason: customReason
            });

            // Navigate back after short delay
            setTimeout(() => {
                if (router.canGoBack()) {
                    router.back();
                } else {
                    router.replace('/(tabs)/campus' as any);
                }
            }, 1500);
        } catch (error) {
            console.error('[PostDetail] Error deleting post:', error);
            setToast({
                visible: true,
                message: t('campus_detail.delete_failed_retry', '删除失败，请重试'),
                type: 'error'
            });
            setAdminDeletionModalVisible(false);
        } finally {
            setLoading(false);
        }
    };

    const handleAdminDeleteCancel = () => {
        setAdminDeletionModalVisible(false);
    };

    // User deletion handlers (for own posts)
    const handleUserDeletePress = () => {
        setSettingsSheetVisible(false);
        setTimeout(() => {
            setUserDeletionConfirmVisible(true);
        }, 300);
    };

    const handleUserDeleteConfirm = async () => {
        if (!post) {
            console.error('[PostDetail] No post to delete');
            return;
        }

        try {
            setUserDeletionConfirmVisible(false);
            setLoading(true);

            // Call the delete function
            await deletePost(post.id);

            // Show success toast
            setToast({
                visible: true,
                message: t('campus_detail.post_deleted', '帖子已删除'),
                type: 'success'
            });

            // Global sync for deletion
            DeviceEventEmitter.emit('campus_post_updated', {
                id: post.id,
                deleted: true,
                deletionReason: 'user_requested'
            });

            // Navigate back after short delay
            setTimeout(() => {
                if (router.canGoBack()) {
                    router.back();
                } else {
                    router.replace('/(tabs)/campus' as any);
                }
            }, 1500);
        } catch (error) {
            console.error('[PostDetail] Error deleting post (user deletion):', error);
            setToast({
                visible: true,
                message: t('campus_detail.delete_failed_retry', '删除失败，请重试'),
                type: 'error'
            });
            setLoading(false);
        }
    };

    const handleUserDeleteCancel = () => {
        setUserDeletionConfirmVisible(false);
    };

    // Helper function to get display text for reason
    const getReasonDisplayText = (reason: DeletionReason): string => {
        switch (reason) {
            case 'spam':
                return t('campus_detail.deletion_reason_spam', '垃圾内容/广告');
            case 'unfriendly':
                return t('campus_detail.deletion_reason_unfriendly', '不友善/违规内容');
            case 'duplicate':
                return t('campus_detail.deletion_reason_duplicate', '重复内容');
            case 'other':
                return t('campus_detail.deletion_reason_other', '其他');
            default:
                return t('campus_detail.deletion_reason_unknown', '未知原因');
        }
    };

    // ── Loading / not found states ────────────────────────────────────────────
    // No full-page spinner — we show the page immediately with a skeleton

    if (!loading && !post) {
        return (
            <View style={styles.loadingContainer}>
                <Text style={{ color: '#6B7280', fontSize: 16 }}>{t('campus_detail.post_not_found', '帖子不存在')}</Text>
                <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
                    <Text style={{ color: '#1E3A8A', fontSize: 15 }}>{t('common.back', '返回')}</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // ── Prepare image list ────────────────────────────────────────────────────
    // While loading, use the param-passed cover for instant display
    const resolvedImages = post
        ? (post.images?.length ? post.images : post.imageUrl ? [post.imageUrl] : []).filter(isRemoteImageUrl)
        : [];
    const coverFromParam = isRemoteImageUrl(coverImageParam) ? coverImageParam : null;
    const images = resolvedImages.length > 0 ? resolvedImages : coverFromParam ? [coverFromParam] : [];
    const paramIsTextOnly = isTextOnlyParam === '1';
    const isTextOnly = post ? images.length === 0 : paramIsTextOnly;
    const palette = isTextOnly ? getPalette(id as string) : null;

    // ── Main render ───────────────────────────────────────────────────────────
    return (
        <KeyboardAvoidingView
            style={styles.root}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <StatusBar barStyle="dark-content" backgroundColor="#fff" />
            <Animated.View
                style={[
                    styles.animatedWrapper,
                    { opacity: animOpacity, transform: [{ scale: animScale }] },
                ]}
            >

                {/* ── Top header bar ── */}
                <View style={styles.topBar}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => {
                        // Check if we can go back, otherwise navigate to campus feed
                        if (router.canGoBack()) {
                            router.back();
                        } else {
                            router.replace('/(tabs)/campus' as any);
                        }
                    }}>
                        <ChevronLeft size={24} color="#1E3A8A" />
                    </TouchableOpacity>
                    <Text style={styles.topBarTitle}>HKCampus</Text>
                    <TouchableOpacity style={styles.settingsBtn} onPress={() => {
                        setSettingsSheetVisible(true);
                    }}>
                        <MoreHorizontal size={22} color="#1E3A8A" />
                    </TouchableOpacity>
                </View>

                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    scrollEnabled={!imageZoomed}
                >
                    {/* ══ COVER AREA ══════════════════════════════════════════════ */}
                    {isTextOnly ? (
                        /* Text-only cover — use param palette while loading */
                        <View style={[styles.textCover, { backgroundColor: palette?.bg ?? '#1E3A8A' }]}>
                            <View style={[styles.blob, styles.blobTR, { backgroundColor: (palette?.accent ?? '#3B82F6') + '55' }]} />
                            <View style={[styles.blob, styles.blobBL, { backgroundColor: (palette?.accent ?? '#3B82F6') + '33' }]} />
                            {post ? (
                                <Text style={[styles.textCoverContent, { color: palette?.text ?? '#fff' }]} numberOfLines={12}>
                                    {post.content}
                                </Text>
                            ) : (
                                // Skeleton lines while loading
                                <View style={{ gap: 8 }}>
                                    {[80, 65, 72, 55].map((w, i) => (
                                        <View key={i} style={[styles.skeletonLine, { width: `${w}%` }]} />
                                    ))}
                                </View>
                            )}
                        </View>
                    ) : images.length === 1 ? (
                        /* Single image — renders immediately from cache */
                        <ZoomableImageCarousel
                            images={images}
                            width={SCREEN_W}
                            height={COVER_HEIGHT}
                            contentFit="cover"
                            onZoomStateChange={setImageZoomed}
                        />
                    ) : images.length > 1 ? (
                        <ZoomableImageCarousel
                            images={images}
                            width={SCREEN_W}
                            height={COVER_HEIGHT}
                            contentFit="cover"
                            onZoomStateChange={setImageZoomed}
                        />
                    ) : (
                        /* No image yet — gray placeholder that matches card bg */
                        <View style={[styles.singleImageWrapper, { backgroundColor: '#F3F4F6' }]} />
                    )}

                    {/* ══ AUTHOR INFO ═════════════════════════════════════════════ */}
                    <TouchableOpacity
                        style={styles.authorSection}
                        onPress={() => openUserProfile(post?.authorId, post?.isAnonymous)}
                        disabled={!post?.authorId || post?.isAnonymous}
                        activeOpacity={post?.isAnonymous ? 1 : 0.7}
                    >
                        <View style={styles.authorAvatar}>
                            {post && !post.isAnonymous && isRemoteImageUrl(post.authorAvatar) ? (
                                <CachedRemoteImage uri={post.authorAvatar} style={styles.avatarImg} />
                            ) : loading ? null : (
                                <Text style={styles.avatarLetter}>
                                    {post?.isAnonymous ? '?' : post?.authorName.charAt(0).toUpperCase()}
                                </Text>
                            )}
                        </View>
                        {loading ? (
                            // Author skeleton
                            <View style={{ flex: 1, gap: 6 }}>
                                <View style={[styles.skeletonLine, { width: '45%', height: 14, borderRadius: 7, backgroundColor: '#E5E7EB' }]} />
                                <View style={[styles.skeletonLine, { width: '30%', height: 11, borderRadius: 5, backgroundColor: '#F3F4F6' }]} />
                            </View>
                        ) : (
                            <View style={{ flex: 1 }}>
                                <View style={styles.authorNameRow}>
                                    <Text style={styles.authorName}>
                                        {post?.isAnonymous ? '匿名用户' : post?.authorName}
                                    </Text>
                                    <EduBadge shouldShow={!post?.isAnonymous && isHKBUEmail(post?.authorEmail)} />
                                </View>
                                <Text style={styles.timeText}>
                                    {post?.createdAt ? formatDistanceToNow(post.createdAt, { addSuffix: true }) : ''}
                                </Text>
                            </View>
                        )}
                        {/* Category pill */}
                        {post && post.category && post.category !== 'All' && (
                            <View style={[styles.catPill, { backgroundColor: categoryColors[post.category] + '22' }]}>
                                <Text style={[styles.catPillText, { color: categoryColors[post.category] }]}>
                                    {post.category}
                                </Text>
                            </View>
                        )}
                    </TouchableOpacity>

                    {/* ══ CONTENT ═════════════════════════════════════════════════ */}
                    <View style={styles.contentSection}>
                        {loading ? (
                            // Content skeleton
                            <View style={{ gap: 10 }}>
                                {[100, 88, 92, 70].map((w, i) => (
                                    <View key={i} style={[styles.skeletonLine, { width: `${w}%`, height: 16, borderRadius: 8, backgroundColor: '#F3F4F6' }]} />
                                ))}
                            </View>
                        ) : (
                            <>
                                <TranslatableText style={styles.bodyText} text={post?.content ?? ''} />
                                {post?.location?.name && (
                                    <View style={styles.locationTag}>
                                        <Text style={styles.locationTagText}>📍 {post.location.name}</Text>
                                    </View>
                                )}
                            </>
                        )}
                    </View>

                    {/* ══ COMMENTS SECTION ════════════════════════════════════════ */}
                    <View style={styles.divider} />
                    <View style={styles.commentsSection}>
                        <Text style={styles.commentsLabel}>
                            {loading
                                ? ''
                                : organizedComments.length > 0
                                    ? t('campus_detail.comments_count', '{{count}} 条评论', { count: comments.length })
                                    : t('campus_detail.empty_comments', '暂无评论，来说点什么吧 👇')}
                        </Text>

                        {!loading && organizedComments.map(comment => (
                            <View key={comment.id} style={styles.commentContainer}>
                                <Animated.View
                                    style={[
                                        styles.commentItem,
                                        highlightedCommentId === comment.id
                                            ? {
                                                backgroundColor: commentFlashAnim.interpolate({
                                                    inputRange: [0, 1],
                                                    outputRange: ['rgba(30, 58, 138, 0)', 'rgba(30, 58, 138, 0.10)'],
                                                }),
                                            }
                                            : null,
                                    ]}
                                >
                                    <TouchableOpacity
                                        style={styles.commentAvatar}
                                        onPress={() => openUserProfile(comment.authorId, comment.isAnonymous)}
                                        disabled={comment.isAnonymous}
                                        activeOpacity={comment.isAnonymous ? 1 : 0.7}
                                    >
                                        {isRemoteImageUrl(comment.authorAvatar) ? (
                                            <CachedRemoteImage uri={comment.authorAvatar} style={styles.avatarImg} />
                                        ) : (
                                            <Text style={styles.avatarLetter}>
                                                {comment.authorName?.charAt(0).toUpperCase() ?? '?'}
                                            </Text>
                                        )}
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.commentBody}
                                        activeOpacity={0.75}
                                        onPress={() => triggerReply(comment)}
                                        onLongPress={() => ugcActions.openActions({
                                            id: comment.id,
                                            targetId: comment.id,
                                            targetType: 'comment',
                                            content: comment.content,
                                            authorId: comment.isAnonymous ? undefined : comment.authorId,
                                            authorName: comment.authorName,
                                            isAnonymous: comment.isAnonymous,
                                        })}
                                    >
                                        <View style={styles.commentHeader}>
                                            <Text style={styles.commentAuthor}>{comment.authorName}</Text>
                                            <EduBadge shouldShow={!comment.isAnonymous && isHKBUEmail(comment.authorEmail)} size="small" />
                                            <View style={{ flex: 1 }} />
                                            {currentUser?.uid === comment.authorId && (
                                                <TouchableOpacity
                                                    onPress={() => triggerDeleteComment(comment.id)}
                                                    style={styles.commentActionBtn}
                                                >
                                                    <Trash2 size={14} color="#EF4444" />
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                        <TranslatableText style={styles.commentText} text={comment.content} />
                                        <View style={styles.commentFooter}>
                                            <Text style={styles.commentTime}>
                                                {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                                            </Text>
                                            <TouchableOpacity
                                                style={styles.replyBtn}
                                                onPress={() => triggerReply(comment)}
                                            >
                                                <Text style={styles.replyBtnText}>回复</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </TouchableOpacity>
                                </Animated.View>

                                {/* Nested Replies */}
                                {comment.replies && comment.replies.length > 0 && (
                                    <View style={styles.repliesList}>
                                        {comment.replies.map((reply: PostComment) => (
                                            <Animated.View
                                                key={reply.id}
                                                style={[
                                                    styles.replyItem,
                                                    highlightedCommentId === reply.id
                                                        ? {
                                                            backgroundColor: commentFlashAnim.interpolate({
                                                                inputRange: [0, 1],
                                                                outputRange: ['rgba(30, 58, 138, 0)', 'rgba(30, 58, 138, 0.10)'],
                                                            }),
                                                        }
                                                        : null,
                                                ]}
                                            >
                                                <TouchableOpacity
                                                    style={styles.commentAvatarSmall}
                                                    onPress={() => openUserProfile(reply.authorId, reply.isAnonymous)}
                                                    disabled={reply.isAnonymous}
                                                    activeOpacity={reply.isAnonymous ? 1 : 0.7}
                                                >
                                                    {isRemoteImageUrl(reply.authorAvatar) ? (
                                                        <CachedRemoteImage uri={reply.authorAvatar} style={styles.avatarImg} />
                                                    ) : (
                                                        <Text style={styles.avatarLetterSmall}>
                                                            {reply.authorName?.charAt(0).toUpperCase() ?? '?'}
                                                        </Text>
                                                    )}
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    style={styles.commentBody}
                                                    activeOpacity={0.75}
                                                    onPress={() => triggerReply(reply)}
                                                    onLongPress={() => ugcActions.openActions({
                                                        id: reply.id,
                                                        targetId: reply.id,
                                                        targetType: 'comment',
                                                        content: reply.content,
                                                        authorId: reply.isAnonymous ? undefined : reply.authorId,
                                                        authorName: reply.authorName,
                                                        isAnonymous: reply.isAnonymous,
                                                    })}
                                                >
                                                    <View style={styles.commentHeader}>
                                                        <Text style={styles.commentAuthorSmall}>{reply.authorName}</Text>
                                                        {reply.replyToName && (
                                                            <Text style={styles.replyToText}>
                                                                {' '}▶ {reply.replyToName}
                                                            </Text>
                                                        )}
                                                        <EduBadge shouldShow={!reply.isAnonymous && isHKBUEmail(reply.authorEmail)} size="small" />
                                                        <View style={{ flex: 1 }} />
                                                        {currentUser?.uid === reply.authorId && (
                                                            <TouchableOpacity
                                                                onPress={() => triggerDeleteComment(reply.id)}
                                                                style={styles.commentActionBtn}
                                                            >
                                                                <Trash2 size={12} color="#EF4444" />
                                                            </TouchableOpacity>
                                                        )}
                                                    </View>
                                                    <TranslatableText style={styles.commentTextSmall} text={reply.content} />
                                                    <View style={styles.commentFooter}>
                                                        <Text style={styles.commentTimeSmall}>
                                                            {formatDistanceToNow(new Date(reply.createdAt), { addSuffix: true })}
                                                        </Text>
                                                        <TouchableOpacity
                                                            style={styles.replyBtn}
                                                            onPress={() => triggerReply(reply)}
                                                        >
                                                            <Text style={styles.replyBtnTextSmall}>回复</Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                </TouchableOpacity>
                                            </Animated.View>
                                        ))}
                                    </View>
                                )}
                            </View>
                        ))}

                        {/* padding so content clears the bottom bar */}
                        <View style={{ height: 100 }} />
                    </View>
                </ScrollView>

                {/* ══ BOTTOM ACTION BAR ═══════════════════════════════════════════ */}
                <View style={styles.bottomBarContainer}>
                    {replyTarget && (
                        <View style={styles.replyTargetBar}>
                            <Text style={styles.replyTargetText} numberOfLines={1}>
                                回复 @{replyTarget.authorName}: {replyTarget.content}
                            </Text>
                            <TouchableOpacity onPress={() => setReplyTarget(null)}>
                                <Text style={styles.cancelReplyText}>取消</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                    <View style={styles.bottomBar}>
                        {/* Comment input */}
                        <View style={styles.inputPill}>
                            <TextInput
                                ref={commentInputRef}
                                style={styles.textInput}
                                placeholder={replyTarget ? `回复 @${replyTarget.authorName}...` : "说点什么..."}
                                placeholderTextColor="#9CA3AF"
                                value={commentText}
                                onChangeText={setCommentText}
                                multiline
                                autoFocus={!!replyTarget}
                            />
                            {commentText.trim().length > 0 && (
                                <TouchableOpacity
                                    style={styles.sendBtn}
                                    onPress={handleSendComment}
                                    disabled={submitting}
                                >
                                    {submitting ? (
                                        <ActivityIndicator size="small" color="#fff" />
                                    ) : (
                                        <Send size={16} color="#fff" />
                                    )}
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* Like */}
                        <TouchableOpacity style={styles.actionBtn} onPress={handleLike} disabled={loading || !post}>
                            <Heart
                                size={24}
                                color={post?.isLiked ? '#EF4444' : '#6B7280'}
                                fill={post?.isLiked ? '#EF4444' : 'transparent'}
                            />
                            <Text style={[styles.actionCount, post?.isLiked && { color: '#EF4444' }]}>
                                {post?.likes ?? 0}
                            </Text>
                        </TouchableOpacity>

                        {/* Comment count */}
                        <TouchableOpacity style={styles.actionBtn}>
                            <MessageCircle size={24} color="#6B7280" />
                            <Text style={styles.actionCount}>{post?.comments ?? 0}</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* ── Modals ── */}
                <BottomSheet
                    visible={settingsSheetVisible}
                    onClose={() => setSettingsSheetVisible(false)}
                >
                    {/* Share post option - always shown at the top */}
                    {currentUser?.uid && (
                        <TouchableOpacity
                            style={styles.shareOption}
                            onPress={() => {
                                setSettingsSheetVisible(false);
                                setShowShareModal(true);
                            }}
                            activeOpacity={0.7}
                        >
                            <View style={styles.shareIconContainer}>
                                <Share2 size={20} color="#1E3A8A" />
                            </View>
                            <Text style={styles.shareText}>{t('profile.share.share_post', '分享帖子')}</Text>
                        </TouchableOpacity>
                    )}

                    {!!post && !isOwnPost && (
                        <TouchableOpacity
                            style={styles.shareOption}
                            onPress={() => {
                                setSettingsSheetVisible(false);
                                ugcActions.openActions({
                                    id: post.id,
                                    targetId: post.id,
                                    targetType: 'post',
                                    content: post.content,
                                    authorId: post.authorId,
                                    authorName: post.authorName,
                                    isAnonymous: post.isAnonymous,
                                });
                            }}
                            activeOpacity={0.7}
                        >
                            <View style={styles.shareIconContainer}>
                                <MoreHorizontal size={20} color="#1E3A8A" />
                            </View>
                            <Text style={styles.shareText}>{t('moderation.ugc_actions_entry', '举报 / 屏蔽')}</Text>
                        </TouchableOpacity>
                    )}

                    {/* Admin-only delete option (for admin viewing others' posts) */}
                    {isAdminUser && !isOwnPost && (
                        <TouchableOpacity
                            style={styles.adminDeleteOption}
                            onPress={handleAdminDeletePress}
                            activeOpacity={0.7}
                        >
                            <View style={styles.adminDeleteIconContainer}>
                                <Trash2 size={20} color="#DC2626" />
                            </View>
                            <Text style={styles.adminDeleteText}>{t('campus_detail.admin_delete', '管理员删除')}</Text>
                        </TouchableOpacity>
                    )}

                    {/* User delete option (for own posts - normal users and admins) */}
                    {isOwnPost && (
                        <TouchableOpacity
                            style={styles.adminDeleteOption}
                            onPress={handleUserDeletePress}
                            activeOpacity={0.7}
                        >
                            <View style={styles.adminDeleteIconContainer}>
                                <Trash2 size={20} color="#111827" />
                            </View>
                            <Text style={[styles.adminDeleteText, { color: '#111827' }]}>{t('campus_detail.delete_post_title', '删除帖子')}</Text>
                        </TouchableOpacity>
                    )}

                    {/* Admin viewing own post: show both options (user + admin) */}
                    {isAdminUser && isOwnPost && (
                        <TouchableOpacity
                            style={styles.adminDeleteOption}
                            onPress={handleAdminDeletePress}
                            activeOpacity={0.7}
                        >
                            <View style={styles.adminDeleteIconContainer}>
                                <Trash2 size={20} color="#DC2626" />
                            </View>
                            <Text style={styles.adminDeleteText}>{t('campus_detail.admin_delete', '管理员删除')}</Text>
                        </TouchableOpacity>
                    )}

                    {/* Empty content for non-admin users viewing others' posts (no share) */}
                    {!currentUser && !isAdminUser && !isOwnPost && <View style={{ flex: 1 }} />}
                </BottomSheet>
                <AdminDeletionModal
                    visible={adminDeletionModalVisible}
                    onConfirm={handleAdminDeleteConfirm}
                    onCancel={handleAdminDeleteCancel}
                />
                <ActionModal
                    visible={userDeletionConfirmVisible}
                    title={t('campus_detail.delete_post_title', '删除帖子')}
                    message={t('campus_detail.delete_own_post_msg', '确定删除你的帖子吗？此操作不可撤销。')}
                    onConfirm={handleUserDeleteConfirm}
                    onCancel={handleUserDeleteCancel}
                    confirmText={t('campus_detail.delete_confirm', '删除')}
                />
                <ActionModal
                    visible={deleteModalVisible}
                    title={deleteType === 'post'
                        ? t('campus_detail.delete_post_title', '删除帖子')
                        : t('campus_detail.delete_comment_title', '删除评论')}
                    message={t('campus_detail.delete_post_or_comment_msg', {
                        defaultValue: '确定删除这条{{type}}吗？此操作不可撤销。',
                        type: deleteType === 'post'
                            ? t('campus_detail.type_post', '帖子')
                            : t('campus_detail.type_comment', '评论'),
                    })}
                    onConfirm={confirmDelete}
                    onCancel={() => setDeleteModalVisible(false)}
                    confirmText={t('campus_detail.delete_confirm', '删除')}
                />
                <Toast
                    visible={toast.visible}
                    message={toast.message}
                    type={toast.type}
                    onHide={() => setToast(prev => ({ ...prev, visible: false }))}
                />
                {ugcActions.ActionSheet}
                <SharePostModal
                    visible={showShareModal}
                    onClose={() => {
                        setShowShareModal(false);
                    }}
                    onBack={() => {
                        setShowShareModal(false);
                        setSettingsSheetVisible(true);
                    }}
                    currentUserId={currentUser?.uid || ''}
                    postId={id}
                    postContent={post?.content || ''}
                    postImageUrl={post?.imageUrl}
                    onShare={async (receiverId: string, message: string) => {
                        await sendDirectMessage(currentUser?.uid || '', receiverId, message);
                    }}
                />
            </Animated.View>
        </KeyboardAvoidingView>
    );
}

const COVER_HEIGHT = SCREEN_W; // 1:1 square, same as XHS

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: '#fff',
    },
    animatedWrapper: {
        flex: 1,
    },
    skeletonLine: {
        backgroundColor: 'rgba(255,255,255,0.3)',
        borderRadius: 10,
        height: 18,
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fff',
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 20,
    },

    // ── Cover ─────────────────────────────────────────────────────────────────
    textCover: {
        width: SCREEN_W,
        height: COVER_HEIGHT,
        padding: 28,
        justifyContent: 'flex-end',
        overflow: 'hidden',
    },
    textCoverContent: {
        fontSize: 22,
        fontWeight: '700',
        lineHeight: 32,
        letterSpacing: 0.2,
    },
    blob: {
        position: 'absolute',
        borderRadius: 999,
    },
    blobTR: {
        width: 180,
        height: 180,
        top: -40,
        right: -40,
    },
    blobBL: {
        width: 120,
        height: 120,
        bottom: 60,
        left: -20,
    },
    singleImageWrapper: {
        width: SCREEN_W,
        height: COVER_HEIGHT,
        backgroundColor: '#F3F4F6',
    },

    // Top navigation bar
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#fff',
        paddingTop: Platform.OS === 'ios' ? 54 : 16,
        paddingBottom: 14,
        paddingHorizontal: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#F0F2F8',
    },
    backBtn: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 20,
    },
    settingsBtn: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 20,
    },
    topBarTitle: {
        flex: 1,
        fontSize: 20,
        fontWeight: '800',
        color: '#1E3A8A',
        textAlign: 'center',
        letterSpacing: -0.5,
    },

    // ── Author row ────────────────────────────────────────────────────────────
    authorSection: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 10,
        gap: 10,
    },
    authorAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#1E3A8A',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    avatarImg: {
        width: '100%',
        height: '100%',
    },
    avatarLetter: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    authorNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    authorName: {
        fontSize: 15,
        fontWeight: '700',
        color: '#111827',
    },
    timeText: {
        fontSize: 12,
        color: '#9CA3AF',
        marginTop: 2,
    },
    catPill: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 10,
    },
    catPillText: {
        fontSize: 11,
        fontWeight: '700',
    },
    moreBtn: {
        padding: 6,
    },

    // ── Body text ─────────────────────────────────────────────────────────────
    contentSection: {
        paddingHorizontal: 16,
        paddingBottom: 16,
    },
    bodyText: {
        fontSize: 16,
        lineHeight: 26,
        color: '#1F2937',
        fontWeight: '400',
    },
    locationTag: {
        marginTop: 12,
        alignSelf: 'flex-start',
        backgroundColor: '#EFF6FF',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
    },
    locationTagText: {
        fontSize: 12,
        color: '#1E3A8A',
        fontWeight: '600',
    },

    // ── Comments ──────────────────────────────────────────────────────────────
    divider: {
        height: 8,
        backgroundColor: '#F4F6FB',
    },
    commentsSection: {
        paddingHorizontal: 16,
        paddingTop: 16,
    },
    commentsLabel: {
        fontSize: 13,
        color: '#6B7280',
        fontWeight: '500',
        marginBottom: 16,
    },
    commentContainer: {
        marginBottom: 20,
    },
    commentItem: {
        flexDirection: 'row',
        marginBottom: 20,
        gap: 10,
        borderRadius: 12,
        paddingHorizontal: 8,
        paddingVertical: 6,
    },
    commentAvatar: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: '#1E3A8A',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0,
    },
    commentBody: {
        flex: 1,
    },
    commentHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 4,
    },
    commentAuthor: {
        fontSize: 13,
        fontWeight: '700',
        color: '#111827',
    },
    commentActionBtn: {
        padding: 4,
    },
    deleteCommentBtn: {
        marginLeft: 'auto',
        padding: 4,
    },
    commentText: {
        fontSize: 14,
        lineHeight: 20,
        color: '#374151',
    },
    commentTime: {
        fontSize: 11,
        color: '#9CA3AF',
    },
    commentFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 6,
        gap: 12,
    },
    replyBtn: {
        paddingVertical: 2,
    },
    replyBtnText: {
        fontSize: 12,
        color: '#6B7280',
        fontWeight: '600',
    },
    repliesList: {
        marginLeft: 44,
        marginTop: 12,
        backgroundColor: '#fff',
        borderRadius: 8,
        padding: 8,
    },
    replyItem: {
        flexDirection: 'row',
        marginBottom: 12,
        gap: 8,
        borderRadius: 10,
        paddingHorizontal: 6,
        paddingVertical: 6,
    },
    commentAvatarSmall: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#1E3A8A',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0,
    },
    avatarLetterSmall: {
        fontSize: 10,
        color: '#fff',
        fontWeight: '700',
    },
    commentAuthorSmall: {
        fontSize: 12,
        fontWeight: '700',
        color: '#374151',
    },
    replyToText: {
        fontSize: 12,
        color: '#6B7280',
    },
    commentTextSmall: {
        fontSize: 13,
        lineHeight: 18,
        color: '#4B5563',
        marginTop: 2,
    },
    commentTimeSmall: {
        fontSize: 10,
        color: '#9CA3AF',
    },
    replyBtnTextSmall: {
        fontSize: 11,
        color: '#6B7280',
        fontWeight: '600',
    },

    // ── Bottom bar ────────────────────────────────────────────────────────────
    bottomBarContainer: {
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#F0F2F8',
    },
    replyTargetBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: '#F9FAFB',
        justifyContent: 'space-between',
    },
    replyTargetText: {
        fontSize: 12,
        color: '#6B7280',
        flex: 1,
        marginRight: 12,
    },
    cancelReplyText: {
        fontSize: 12,
        color: '#1E3A8A',
        fontWeight: '600',
    },
    bottomBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: Platform.OS === 'ios' ? 34 : 14,
    },
    inputPill: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F4F6FB',
        borderRadius: 24,
        paddingHorizontal: 14,
        paddingVertical: 8,
        minHeight: 40,
    },
    textInput: {
        flex: 1,
        fontSize: 14,
        color: '#111827',
        maxHeight: 80,
    },
    sendBtn: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: '#1E3A8A',
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 8,
    },
    actionBtn: {
        alignItems: 'center',
        gap: 2,
    },
    actionCount: {
        fontSize: 11,
        color: '#6B7280',
        fontWeight: '600',
    },
    shareOption: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 16,
        gap: 12,
    },
    shareIconContainer: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#EFF6FF',
        alignItems: 'center',
        justifyContent: 'center',
    },
    shareText: {
        fontSize: 16,
        color: '#111827',
        fontWeight: '600',
    },
    adminDeleteOption: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 16,
        gap: 12,
    },
    adminDeleteIconContainer: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#FEF2F2',
        alignItems: 'center',
        justifyContent: 'center',
    },
    adminDeleteText: {
        fontSize: 16,
        color: '#DC2626',
        fontWeight: '600',
    },
    settingsSheetContent: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 20,
    },
    settingsSheetTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#111827',
        marginBottom: 8,
    },
    settingsSheetSubtitle: {
        fontSize: 14,
        color: '#9CA3AF',
    },
});
