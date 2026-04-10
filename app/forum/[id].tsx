import { formatDistanceToNow } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, MessageCircle, MoreHorizontal, Send, ThumbsUp, Trash2 } from 'lucide-react-native';
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
import { Toast, ToastType } from '../../components/campus/Toast';
import { CachedRemoteImage } from '../../components/common/CachedRemoteImage';
import { EduBadge } from '../../components/common/EduBadge';
import { TranslatableText } from '../../components/common/TranslatableText';
import { ZoomableImageCarousel } from '../../components/common/ZoomableImageCarousel';
import { useLoginPrompt } from '../../hooks/useLoginPrompt';
import { useUgcEntryActions } from '../../hooks/useUgcEntryActions';
import { getCurrentUser } from '../../services/auth';
import {
    addForumComment,
    deleteForumComment,
    deleteForumPost,
    fetchForumComments,
    fetchForumPostById,
    toggleForumUpvote,
} from '../../services/forum';
import { ForumComment, ForumPost } from '../../types';
import { isRemoteImageUrl } from '../../utils/remoteImage';
import { isHKBUEmail } from '../../utils/userUtils';

const SCREEN_W = Dimensions.get('window').width;
const CONTENT_W = SCREEN_W - 32; // 16px padding each side
const FORUM_IMAGE_HEIGHT = CONTENT_W;

const categoryColor: Record<string, string> = {
    general: '#6366F1', activity: '#F59E0B', guide: '#10B981', lost_found: '#EF4444',
};

export default function ForumPostDetailScreen() {
    const { id } = useLocalSearchParams();
    const { t } = useTranslation();
    const router = useRouter();
    const { checkLogin } = useLoginPrompt();

    const [post, setPost] = useState<ForumPost | null>(null);
    const [comments, setComments] = useState<ForumComment[]>([]);
    const [loading, setLoading] = useState(true);
    const [imageZoomed, setImageZoomed] = useState(false);
    const [commentText, setCommentText] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [user, setUser] = useState<any>(null);
    const inputRef = useRef<TextInput>(null);
    const [deleteModal, setDeleteModal] = useState(false);
    const [deleteType, setDeleteType] = useState<'post' | 'comment'>('post');
    const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
    const [toast, setToast] = useState<{ visible: boolean; message: string; type: ToastType }>({
        visible: false, message: '', type: 'success',
    });
    const [replyTarget, setReplyTarget] = useState<ForumComment | null>(null);
    const ugcActions = useUgcEntryActions({
        currentUserId: user?.uid,
        ensureLoggedIn: () => !!checkLogin(user),
        onBlockedUser: (blockedUserId) => {
            setComments((prev) => prev.filter((comment) => comment.authorId !== blockedUserId));
            if (post?.authorId === blockedUserId) {
                setPost(null);
            }
        },
    });

    const openPublicProfile = (authorId?: string) => {
        if (!authorId) return;
        if (authorId === user?.uid) return;
        router.push(`/profile/${authorId}` as any);
    };

    useEffect(() => {
        const load = async () => {
            if (!id) return;
            try {
                const currentUser = await getCurrentUser();
                setUser(currentUser);
                const [p, c] = await Promise.all([
                    fetchForumPostById(id as string, currentUser?.uid),
                    fetchForumComments(id as string, currentUser?.uid),
                ]);
                if (p) setPost(p);
                setComments(c);
            } catch (e) {
                console.error('Forum post load error:', e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [id]);

    const organizedComments = React.useMemo(() => {
        const rootComments = comments.filter(c => !c.parentCommentId);
        const replyMap: Record<string, ForumComment[]> = {};

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

    const handleUpvote = async () => {
        if (!checkLogin(user)) return;
        if (!post) return;

        const wasUpvoted = post.isUpvoted;
        const previousUpvotes = post.upvoteCount;

        // Optimistic update
        setPost(prev => prev ? {
            ...prev,
            isUpvoted: !wasUpvoted,
            upvoteCount: wasUpvoted ? previousUpvotes - 1 : previousUpvotes + 1,
        } : null);

        try {
            await toggleForumUpvote(post.id, user.uid);
            // Global sync
            DeviceEventEmitter.emit('forum_post_updated', {
                id: post.id,
                updates: { isUpvoted: !wasUpvoted, upvoteCount: wasUpvoted ? previousUpvotes - 1 : previousUpvotes + 1 }
            });
        } catch (error) {
            console.error('Error upvoting post:', error);
            // Rollback on error
            setPost(prev => prev ? {
                ...prev,
                isUpvoted: wasUpvoted,
                upvoteCount: previousUpvotes,
            } : null);
        }
    };

    const handleSendComment = async () => {
        if (!checkLogin(user)) return;
        if (!commentText.trim() || !post) return;
        try {
            setSubmitting(true);
            const c = await addForumComment({
                postId: post.id,
                authorId: user.uid,
                authorName: user.displayName || t('common.anonymous'),
                authorEmail: (user as any).email,
                authorAvatar: user.avatarUrl || undefined,
                content: commentText.trim(),
                parentCommentId: replyTarget?.parentCommentId || replyTarget?.id || undefined,
                replyToName: replyTarget?.authorName || undefined,
            });
            setComments(prev => [...prev, c]);
            setPost(prev => {
                const updated = prev ? { ...prev, replyCount: prev.replyCount + 1 } : null;
                if (updated) {
                    DeviceEventEmitter.emit('forum_post_updated', {
                        id: post.id,
                        updates: { replyCount: updated.replyCount }
                    });
                }
                return updated;
            });
            setCommentText('');
            setReplyTarget(null);
            Keyboard.dismiss();
            setToast({ visible: true, message: t('forum.detail.toast.comment_success'), type: 'success' });
        } catch (e) {
            console.error('Error adding comment:', e);
            setToast({ visible: true, message: t('forum.detail.toast.comment_error'), type: 'error' });
        } finally {
            setSubmitting(false);
        }
    };

    const confirmDelete = async () => {
        if (deleteType === 'post' && post) {
            try {
                await deleteForumPost(post.id);
                setDeleteModal(false);
                setToast({ visible: true, message: t('common.deleted'), type: 'success' });
                // Global sync for deletion
                DeviceEventEmitter.emit('forum_post_updated', { id: post.id, deleted: true });
                setTimeout(() => router.back(), 1000);
            } catch {
                setDeleteModal(false);
                setToast({ visible: true, message: t('forum.detail.toast.delete_error'), type: 'error' });
            }
        } else if (deleteType === 'comment' && selectedCommentId && post) {
            try {
                await deleteForumComment(selectedCommentId, post.id);
                setComments(prev => prev.filter(c => c.id !== selectedCommentId));
                setPost(prev => prev ? { ...prev, replyCount: Math.max(0, prev.replyCount - 1) } : null);
                setToast({ visible: true, message: t('forum.detail.toast.delete_success'), type: 'success' });
            } catch {
                setToast({ visible: true, message: t('forum.detail.toast.delete_error'), type: 'error' });
            } finally {
                setDeleteModal(false);
                setSelectedCommentId(null);
            }
        }
    };

    if (loading) {
        return (
            <View style={styles.center}>
                <StatusBar barStyle="dark-content" />
                <ActivityIndicator size="large" color="#1E3A8A" />
            </View>
        );
    }

    if (!post) {
        return (
            <View style={styles.center}>
                <Text style={{ color: '#6B7280' }}>{t('common.error')}</Text>
                <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
                    <Text style={{ color: '#1E3A8A' }}>{t('common.back')}</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const images = (post.images || []).filter(isRemoteImageUrl);

    return (
        <KeyboardAvoidingView
            style={styles.root}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <StatusBar barStyle="dark-content" backgroundColor="#fff" />

            {/* Top bar */}
            <View style={styles.topBar}>
                <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
                    <ChevronLeft size={24} color="#1E3A8A" />
                </TouchableOpacity>
                <Text style={styles.topBarLogo}>HKCampus</Text>
                {user?.uid === post.authorId ? (
                    <TouchableOpacity style={styles.iconBtn} onPress={() => { setDeleteType('post'); setDeleteModal(true); }}>
                        <MoreHorizontal size={22} color="#1E3A8A" />
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity
                        style={styles.iconBtn}
                        onPress={() => ugcActions.openActions({
                            id: post.id,
                            targetId: post.id,
                            targetType: 'forum_post',
                            content: `${post.title}\n${post.content || ''}`.trim(),
                            authorId: post.authorId,
                            authorName: post.authorName,
                        })}
                    >
                        <MoreHorizontal size={22} color="#1E3A8A" />
                    </TouchableOpacity>
                )}
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                scrollEnabled={!imageZoomed}
            >
                {/* Category + meta */}
                <View style={styles.metaRow}>
                    <View style={[styles.catPill, { backgroundColor: categoryColor[post.category] + '1A' }]}>
                        <Text style={[styles.catPillText, { color: categoryColor[post.category] }]}>
                            {t(`forum.compose.category_label.${post.category}`)}
                        </Text>
                    </View>
                    <Text style={styles.metaTime}>{formatDistanceToNow(post.createdAt, { addSuffix: true })}</Text>
                </View>

                {/* Title */}
                <TranslatableText style={styles.title} text={post.title} />

                {/* Author row */}
                <View style={styles.authorRow}>
                    <TouchableOpacity
                        style={styles.avatar}
                        onPress={() => openPublicProfile(post.authorId)}
                        activeOpacity={0.7}
                    >
                        {isRemoteImageUrl(post.authorAvatar) ? (
                            <CachedRemoteImage uri={post.authorAvatar} style={styles.avatarImg} />
                        ) : (
                            <Text style={styles.avatarLetter}>{post.authorName.charAt(0).toUpperCase()}</Text>
                        )}
                    </TouchableOpacity>
                    <Text style={styles.authorName}>{post.authorName}</Text>
                    <EduBadge shouldShow={isHKBUEmail(post.authorEmail)} size="small" />
                </View>

                {/* Content */}
                {!!post.content && (
                    <TranslatableText style={styles.bodyText} text={post.content} />
                )}

                {/* Images – inline pinch zoom + swipe */}
                {images.length > 0 && (
                    <View style={styles.imageCarouselWrap}>
                        <ZoomableImageCarousel
                            images={images}
                            width={CONTENT_W}
                            height={FORUM_IMAGE_HEIGHT}
                            contentFit="contain"
                            onZoomStateChange={setImageZoomed}
                        />
                    </View>
                )}

                {/* Upvote row */}
                <View style={styles.upvoteRow}>
                    <TouchableOpacity style={styles.upvoteBtn} onPress={handleUpvote}>
                        <ThumbsUp
                            size={18}
                            color={post.isUpvoted ? '#1E3A8A' : '#9CA3AF'}
                            fill={post.isUpvoted ? '#1E3A8A' : 'transparent'}
                        />
                        <Text style={[styles.upvoteText, post.isUpvoted && styles.upvoteTextActive]}>
                            {post.upvoteCount > 0 ? `${post.upvoteCount} ${t('forum.detail.recommend')}` : t('forum.detail.recommend')}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Comments section */}
                <View style={styles.divider} />
                <Text style={styles.commentsLabel}>
                    {comments.length > 0
                        ? t('forum.detail.replies_count', { count: comments.length })
                        : t('forum.detail.empty_comments')}
                </Text>

                {organizedComments.map(c => (
                    <View key={c.id} style={styles.commentContainer}>
                        <Animated.View style={[styles.commentItem, ugcActions.getHighlightStyle(c.id)]}>
                            <TouchableOpacity
                                style={styles.commentAvatar}
                                onPress={() => openPublicProfile(c.authorId)}
                                activeOpacity={0.7}
                            >
                                {isRemoteImageUrl(c.authorAvatar) ? (
                                    <CachedRemoteImage uri={c.authorAvatar} style={styles.avatarImg} />
                                ) : (
                                    <Text style={styles.avatarLetter}>{c.authorName.charAt(0).toUpperCase()}</Text>
                                )}
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.commentBody}
                                activeOpacity={0.95}
                                    onLongPress={() => ugcActions.openActions({
                                        id: c.id,
                                        targetId: c.id,
                                        targetType: 'forum_comment',
                                        content: c.content,
                                        authorId: c.authorId,
                                        authorName: c.authorName,
                                })}
                            >
                                <View style={styles.commentHeader}>
                                    <Text style={styles.commentAuthor}>{c.authorName}</Text>
                                    <EduBadge shouldShow={isHKBUEmail(c.authorEmail)} size="small" />
                                    {user?.uid === c.authorId && (
                                        <TouchableOpacity
                                            style={{ marginLeft: 'auto' }}
                                            onPress={() => { setSelectedCommentId(c.id); setDeleteType('comment'); setDeleteModal(true); }}
                                        >
                                            <Trash2 size={14} color="#EF4444" />
                                        </TouchableOpacity>
                                    )}
                                </View>
                                <TranslatableText style={styles.commentText} text={c.content} />
                                <View style={styles.commentFooter}>
                                    <Text style={styles.commentTime}>
                                        {formatDistanceToNow(c.createdAt, { addSuffix: true })}
                                    </Text>
                                    <TouchableOpacity
                                        style={styles.replyBtn}
                                        onPress={() => {
                                            setReplyTarget(c);
                                            setTimeout(() => inputRef.current?.focus(), 100);
                                        }}
                                    >
                                        <Text style={styles.replyBtnText}>{t('forum.row.replies')}</Text>
                                    </TouchableOpacity>
                                </View>
                            </TouchableOpacity>
                        </Animated.View>

                        {/* Nested Replies */}
                        {c.replies && c.replies.length > 0 && (
                            <View style={styles.repliesList}>
                                {c.replies.map((reply: ForumComment) => (
                                    <Animated.View key={reply.id} style={[styles.replyItem, ugcActions.getHighlightStyle(reply.id)]}>
                                        <TouchableOpacity
                                            style={styles.commentAvatarSmall}
                                            onPress={() => openPublicProfile(reply.authorId)}
                                            activeOpacity={0.7}
                                        >
                                            {isRemoteImageUrl(reply.authorAvatar) ? (
                                                <CachedRemoteImage uri={reply.authorAvatar} style={styles.avatarImg} />
                                            ) : (
                                                <Text style={styles.avatarLetterSmall}>{reply.authorName.charAt(0).toUpperCase()}</Text>
                                            )}
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={styles.commentBody}
                                            activeOpacity={0.95}
                                            onLongPress={() => ugcActions.openActions({
                                                id: reply.id,
                                                targetId: reply.id,
                                                targetType: 'forum_comment',
                                                content: reply.content,
                                                authorId: reply.authorId,
                                                authorName: reply.authorName,
                                            })}
                                        >
                                            <View style={styles.commentHeader}>
                                                <Text style={styles.commentAuthorSmall}>{reply.authorName}</Text>
                                                {reply.replyToName && (
                                                    <Text style={styles.replyToText}> ▶ {reply.replyToName}</Text>
                                                )}
                                                <EduBadge shouldShow={isHKBUEmail(reply.authorEmail)} size="small" />
                                                {user?.uid === reply.authorId && (
                                                    <TouchableOpacity
                                                        style={{ marginLeft: 'auto' }}
                                                        onPress={() => { setSelectedCommentId(reply.id); setDeleteType('comment'); setDeleteModal(true); }}
                                                    >
                                                        <Trash2 size={12} color="#EF4444" />
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                            <TranslatableText style={styles.commentTextSmall} text={reply.content} />
                                            <View style={styles.commentFooter}>
                                                <Text style={styles.commentTimeSmall}>
                                                    {formatDistanceToNow(reply.createdAt, { addSuffix: true })}
                                                </Text>
                                                <TouchableOpacity
                                                    style={styles.replyBtn}
                                                    onPress={() => {
                                                        setReplyTarget(reply);
                                                        setTimeout(() => inputRef.current?.focus(), 100);
                                                    }}
                                                >
                                                    <Text style={styles.replyBtnTextSmall}>{t('forum.row.replies')}</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </TouchableOpacity>
                                    </Animated.View>
                                ))}
                            </View>
                        )}
                    </View>
                ))}
                <View style={{ height: 100 }} />
            </ScrollView>

            {/* Bottom bar */}
            <View style={styles.bottomBarContainer}>
                {replyTarget && (
                    <View style={styles.replyTargetBar}>
                        <Text style={styles.replyTargetText} numberOfLines={1}>
                            {t('forum.detail.replying_to', { name: replyTarget.authorName })}: {replyTarget.content}
                        </Text>
                        <TouchableOpacity onPress={() => setReplyTarget(null)}>
                            <Text style={styles.cancelReplyText}>{t('forum.detail.cancel_reply')}</Text>
                        </TouchableOpacity>
                    </View>
                )}
                <View style={styles.bottomBar}>
                    <View style={styles.inputPill}>
                        <TextInput
                            ref={inputRef}
                            style={styles.textInput}
                            placeholder={replyTarget ? t('forum.detail.replying_to', { name: replyTarget.authorName }) : t('forum.detail.comment_placeholder')}
                            placeholderTextColor="#9CA3AF"
                            value={commentText}
                            onChangeText={setCommentText}
                            multiline
                        />
                        {commentText.trim().length > 0 && (
                            <TouchableOpacity style={styles.sendBtn} onPress={handleSendComment} disabled={submitting}>
                                {submitting
                                    ? <ActivityIndicator size="small" color="#fff" />
                                    : <Send size={16} color="#fff" />
                                }
                            </TouchableOpacity>
                        )}
                    </View>
                    <TouchableOpacity style={styles.actionBtn} onPress={handleUpvote}>
                        <ThumbsUp
                            size={22}
                            color={post.isUpvoted ? '#1E3A8A' : '#6B7280'}
                            fill={post.isUpvoted ? '#1E3A8A' : 'transparent'}
                        />
                        <Text style={[styles.actionCount, post.isUpvoted && { color: '#1E3A8A' }]}>
                            {post.upvoteCount}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn}>
                        <MessageCircle size={22} color="#6B7280" />
                        <Text style={styles.actionCount}>{post.replyCount}</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <ActionModal
                visible={deleteModal}
                title={deleteType === 'post' ? t('forum.detail.delete_post_title') : t('forum.detail.delete_comment_title')}
                message={deleteType === 'post' ? t('forum.detail.delete_post_confirm') : t('forum.detail.delete_comment_confirm')}
                onConfirm={confirmDelete}
                onCancel={() => setDeleteModal(false)}
                confirmText={t('forum.detail.delete_action')}
                cancelText={t('common.cancel')}
            />
            <Toast
                visible={toast.visible}
                message={toast.message}
                type={toast.type}
                onHide={() => setToast(p => ({ ...p, visible: false }))}
            />
            {ugcActions.ActionSheet}

        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#fff' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },

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
    iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
    topBarLogo: { fontSize: 20, fontWeight: '800', color: '#1E3A8A', letterSpacing: -0.5 },

    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 20 },

    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    catPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    catPillText: { fontSize: 12, fontWeight: '700' },
    metaTime: { fontSize: 12, color: '#9CA3AF' },

    title: { fontSize: 22, fontWeight: '800', color: '#111827', lineHeight: 30, marginBottom: 14, letterSpacing: -0.3 },

    authorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
    avatar: {
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: '#1E3A8A',
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    avatarImg: { width: '100%', height: '100%' },
    avatarLetter: { color: '#fff', fontSize: 13, fontWeight: '700' },
    authorName: { fontSize: 14, fontWeight: '600', color: '#374151' },

    bodyText: { fontSize: 16, lineHeight: 26, color: '#374151', marginBottom: 16 },

    imageCarouselWrap: {
        width: CONTENT_W,
        height: FORUM_IMAGE_HEIGHT,
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 16,
        backgroundColor: '#F3F4F6',
    },

    upvoteRow: { flexDirection: 'row', marginBottom: 16 },
    upvoteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
    upvoteText: { fontSize: 14, color: '#9CA3AF', fontWeight: '600' },
    upvoteTextActive: { color: '#1E3A8A' },

    divider: { height: 8, backgroundColor: '#F4F6FB', marginHorizontal: -16, marginBottom: 16 },
    commentsLabel: { fontSize: 13, color: '#6B7280', fontWeight: '500', marginBottom: 16 },

    commentContainer: { marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F0F2F8', paddingBottom: 16 },

    commentItem: { flexDirection: 'row', marginBottom: 20, gap: 10 },
    commentAvatar: {
        width: 34, height: 34, borderRadius: 17,
        backgroundColor: '#1E3A8A',
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0,
    },
    commentBody: { flex: 1 },
    commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    commentAuthor: { fontSize: 13, fontWeight: '700', color: '#111827' },
    commentText: { fontSize: 14, lineHeight: 20, color: '#374151' },
    commentTime: { fontSize: 11, color: '#9CA3AF' },
    commentFooter: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
    replyBtn: { paddingVertical: 4, paddingHorizontal: 0 },
    replyBtnText: { fontSize: 12, fontWeight: '600', color: '#1E3A8A' },

    // Nested Replies
    repliesList: { marginLeft: 44, marginTop: 12, gap: 12 },
    replyItem: { flexDirection: 'row', gap: 8 },
    commentAvatarSmall: {
        width: 24, height: 24, borderRadius: 12,
        backgroundColor: '#1E3A8A',
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0,
    },
    avatarLetterSmall: { color: '#fff', fontSize: 10, fontWeight: '700' },
    commentAuthorSmall: { fontSize: 12, fontWeight: '700', color: '#374151' },
    replyToText: { fontSize: 12, color: '#6B7280' },
    commentTextSmall: { fontSize: 13, lineHeight: 18, color: '#4B5563', marginTop: 2 },
    commentTimeSmall: { fontSize: 10, color: '#9CA3AF' },
    replyBtnTextSmall: { fontSize: 11, fontWeight: '600', color: '#1E3A8A' },

    // Bottom Bar
    bottomBarContainer: {
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#F0F2F8',
    },
    replyTargetBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#F8FAFC',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    replyTargetText: { flex: 1, fontSize: 12, color: '#64748B' },
    cancelReplyText: { fontSize: 12, color: '#1E3A8A', fontWeight: '600', marginLeft: 8 },
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
    textInput: { flex: 1, fontSize: 14, color: '#111827', maxHeight: 80 },
    sendBtn: {
        width: 30, height: 30, borderRadius: 15,
        backgroundColor: '#1E3A8A',
        alignItems: 'center', justifyContent: 'center', marginLeft: 8,
    },
    actionBtn: { alignItems: 'center', gap: 2 },
    actionCount: { fontSize: 11, color: '#6B7280', fontWeight: '600' },
});
