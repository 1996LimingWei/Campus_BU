import { formatDistanceToNow } from 'date-fns';
import { Image as ExpoImage } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
    ChevronLeft,
    Heart,
    MessageCircle,
    MoreHorizontal,
    Send,
    Trash2,
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    FlatList,
    Image,
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
import { Toast, ToastType } from '../../components/campus/Toast';
import { EduBadge } from '../../components/common/EduBadge';
import { getCurrentUser } from '../../services/auth';
import {
    addPostComment,
    deleteComment,
    deletePost,
    fetchPostById,
    fetchPostComments,
    togglePostLike,
} from '../../services/campus';
import { Post } from '../../types';
import { isHKBUEmail } from '../../utils/userUtils';

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

const isValidUrl = (url?: string) =>
    !!url && (url.startsWith('http://') || url.startsWith('https://'));

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

    // ── Zoom entrance animation ────────────────────────────────────────────────
    const animScale = useRef(new Animated.Value(0.93)).current;
    const animOpacity = useRef(new Animated.Value(0)).current;

    const [post, setPost] = useState<Post | null>(null);
    const [comments, setComments] = useState<any[]>([]);
    const [commentText, setCommentText] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [imgIndex, setImgIndex] = useState(0);

    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [deleteType, setDeleteType] = useState<'post' | 'comment'>('post');
    const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
    const [toast, setToast] = useState<{ visible: boolean; message: string; type: ToastType }>({
        visible: false,
        message: '',
        type: 'success',
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
                const commentsData = await fetchPostComments(id as string);
                setComments(commentsData);
            }
        } catch (error) {
            console.error('Error loading post details:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [id]);

    const handleLike = async () => {
        if (!post || !currentUser) return;
        try {
            await togglePostLike(post.id, currentUser.uid);
            setPost(prev =>
                prev
                    ? { ...prev, isLiked: !prev.isLiked, likes: prev.isLiked ? prev.likes - 1 : prev.likes + 1 }
                    : null
            );
        } catch (error) {
            console.error('Error liking post:', error);
        }
    };

    const handleSendComment = async () => {
        if (!commentText.trim() || !post || !currentUser) return;
        try {
            setSubmitting(true);
            const newComment = await addPostComment({
                postId: post.id,
                authorId: currentUser.uid,
                authorName: currentUser.displayName || 'Anonymous',
                authorEmail: (currentUser as any).email,
                authorAvatar: currentUser.avatarUrl || undefined,
                content: commentText.trim(),
            });
            if (newComment) {
                setComments(prev => [...prev, newComment]);
                setPost(prev => prev ? { ...prev, comments: prev.comments + 1 } : null);
                setCommentText('');
                Keyboard.dismiss();
                setToast({ visible: true, message: '评论成功！', type: 'success' });
            }
        } catch (error) {
            setToast({ visible: true, message: '评论失败', type: 'error' });
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
                setToast({ visible: true, message: '已删除', type: 'success' });
                setTimeout(() => router.back(), 1000);
            } catch {
                setToast({ visible: true, message: '删除失败', type: 'error' });
                setDeleteModalVisible(false);
            }
        } else {
            if (!selectedCommentId) return;
            try {
                await deleteComment(selectedCommentId);
                setComments(prev => prev.filter(c => c.id !== selectedCommentId));
                setPost(prev => prev ? { ...prev, comments: Math.max(0, prev.comments - 1) } : null);
                setToast({ visible: true, message: '评论已删除', type: 'success' });
            } catch {
                setToast({ visible: true, message: '删除失败', type: 'error' });
            } finally {
                setDeleteModalVisible(false);
                setSelectedCommentId(null);
            }
        }
    };

    // ── Loading / not found states ────────────────────────────────────────────
    // No full-page spinner — we show the page immediately with a skeleton

    if (!loading && !post) {
        return (
            <View style={styles.loadingContainer}>
                <Text style={{ color: '#6B7280', fontSize: 16 }}>帖子不存在</Text>
                <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
                    <Text style={{ color: '#1E3A8A', fontSize: 15 }}>返回</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // ── Prepare image list ────────────────────────────────────────────────────
    // While loading, use the param-passed cover for instant display
    const resolvedImages = post
        ? (post.images?.length ? post.images : post.imageUrl ? [post.imageUrl] : []).filter(isValidUrl)
        : [];
    const coverFromParam = coverImageParam && isValidUrl(coverImageParam) ? coverImageParam : null;
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
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                        <ChevronLeft size={24} color="#1E3A8A" />
                    </TouchableOpacity>
                    <Text style={styles.topBarTitle}>HKCampus</Text>
                    {post && currentUser?.uid === post.authorId ? (
                        <TouchableOpacity style={styles.backBtn} onPress={triggerDeletePost}>
                            <MoreHorizontal size={22} color="#1E3A8A" />
                        </TouchableOpacity>
                    ) : (
                        <View style={{ width: 40 }} />
                    )}
                </View>

                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
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
                        <View style={styles.singleImageWrapper}>
                            <ExpoImage
                                source={{ uri: images[0] }}
                                style={styles.singleImage}
                                contentFit="cover"
                                cachePolicy="memory-disk"
                                transition={150}
                            />
                        </View>
                    ) : images.length > 1 ? (
                        /* Multi-image carousel */
                        <View>
                            <FlatList
                                data={images}
                                horizontal
                                pagingEnabled
                                showsHorizontalScrollIndicator={false}
                                keyExtractor={(_, i) => String(i)}
                                onMomentumScrollEnd={e => {
                                    setImgIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W));
                                }}
                                renderItem={({ item }) => (
                                    <View style={styles.singleImageWrapper}>
                                        <ExpoImage
                                            source={{ uri: item }}
                                            style={styles.singleImage}
                                            contentFit="cover"
                                            cachePolicy="memory-disk"
                                            transition={150}
                                        />
                                    </View>
                                )}
                            />
                            {/* Dot indicator */}
                            <View style={styles.dotRow}>
                                {images.map((_, i) => (
                                    <View
                                        key={i}
                                        style={[styles.dot, i === imgIndex && styles.dotActive]}
                                    />
                                ))}
                            </View>
                        </View>
                    ) : (
                        /* No image yet — gray placeholder that matches card bg */
                        <View style={[styles.singleImageWrapper, { backgroundColor: '#F3F4F6' }]} />
                    )}

                    {/* ══ AUTHOR INFO ═════════════════════════════════════════════ */}
                    <View style={styles.authorSection}>
                        <View style={styles.authorAvatar}>
                            {post && !post.isAnonymous && isValidUrl(post.authorAvatar) ? (
                                <Image source={{ uri: post.authorAvatar }} style={styles.avatarImg} />
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
                    </View>

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
                                <Text style={styles.bodyText}>{post?.content}</Text>
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
                                : comments.length > 0
                                    ? `共 ${comments.length} 条评论`
                                    : '暂无评论，来说点什么吧 👇'}
                        </Text>

                        {!loading && comments.map(comment => (
                            <View key={comment.id} style={styles.commentItem}>
                                <View style={styles.commentAvatar}>
                                    {comment.author_avatar && isValidUrl(comment.author_avatar) ? (
                                        <Image source={{ uri: comment.author_avatar }} style={styles.avatarImg} />
                                    ) : (
                                        <Text style={styles.avatarLetter}>
                                            {comment.author_name?.charAt(0).toUpperCase() ?? '?'}
                                        </Text>
                                    )}
                                </View>
                                <View style={styles.commentBody}>
                                    <View style={styles.commentHeader}>
                                        <Text style={styles.commentAuthor}>{comment.author_name}</Text>
                                        <EduBadge shouldShow={isHKBUEmail(comment.author_email)} size="small" />
                                        {currentUser?.uid === comment.author_id && (
                                            <TouchableOpacity
                                                onPress={() => triggerDeleteComment(comment.id)}
                                                style={styles.deleteCommentBtn}
                                            >
                                                <Trash2 size={14} color="#EF4444" />
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                    <Text style={styles.commentText}>{comment.content}</Text>
                                    <Text style={styles.commentTime}>
                                        {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                                    </Text>
                                </View>
                            </View>
                        ))}

                        {/* padding so content clears the bottom bar */}
                        <View style={{ height: 100 }} />
                    </View>
                </ScrollView>

                {/* ══ BOTTOM ACTION BAR ═══════════════════════════════════════════ */}
                <View style={styles.bottomBar}>
                    {/* Comment input */}
                    <View style={styles.inputPill}>
                        <TextInput
                            style={styles.textInput}
                            placeholder="说点什么..."
                            placeholderTextColor="#9CA3AF"
                            value={commentText}
                            onChangeText={setCommentText}
                            multiline
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

                {/* ── Modals ── */}
                <ActionModal
                    visible={deleteModalVisible}
                    title={deleteType === 'post' ? '删除帖子' : '删除评论'}
                    message={`确定删除这条${deleteType === 'post' ? '帖子' : '评论'}吗？此操作不可撤销。`}
                    onConfirm={confirmDelete}
                    onCancel={() => setDeleteModalVisible(false)}
                    confirmText="删除"
                />
                <Toast
                    visible={toast.visible}
                    message={toast.message}
                    type={toast.type}
                    onHide={() => setToast(prev => ({ ...prev, visible: false }))}
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
    singleImage: {
        width: '100%',
        height: '100%',
    },
    dotRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 6,
        marginTop: 10,
        marginBottom: 4,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#D1D5DB',
    },
    dotActive: {
        backgroundColor: '#1E3A8A',
        width: 16,
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
    commentItem: {
        flexDirection: 'row',
        marginBottom: 20,
        gap: 10,
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
        marginTop: 4,
    },

    // ── Bottom bar ────────────────────────────────────────────────────────────
    bottomBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: Platform.OS === 'ios' ? 34 : 14,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#F0F2F8',
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
});
