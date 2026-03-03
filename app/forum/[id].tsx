import { formatDistanceToNow } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, MessageCircle, MoreHorizontal, Send, ThumbsUp, Trash2, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ActivityIndicator,
    Dimensions,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
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
    addForumComment,
    deleteForumComment,
    deleteForumPost,
    fetchForumComments,
    fetchForumPostById,
    toggleForumUpvote,
} from '../../services/forum';
import { ForumComment, ForumPost } from '../../types';
import { isHKBUEmail } from '../../utils/userUtils';

const SCREEN_W = Dimensions.get('window').width;
const CONTENT_W = SCREEN_W - 32; // 16px padding each side
const IMG_MULTI_SIZE = Math.round((CONTENT_W - 12) / 3); // 3-col grid

/** Renders a single image at its natural aspect ratio */
const AutoHeightImage: React.FC<{ uri: string; style?: object }> = ({ uri, style }) => {
    const [size, setSize] = React.useState<{ width: number; height: number } | null>(null);
    React.useEffect(() => {
        Image.getSize(
            uri,
            (w, h) => setSize({ width: w, height: h }),
            (err) => console.warn('getSize error:', err),
        );
    }, [uri]);
    const displayHeight = size ? Math.round(CONTENT_W * size.height / size.width) : CONTENT_W;
    return (
        <Image
            source={{ uri }}
            style={[{ width: CONTENT_W, height: displayHeight, borderRadius: 12, backgroundColor: '#F3F4F6' }, style]}
            resizeMode="contain"
            onError={(e) => console.warn('Image load error:', e.nativeEvent.error)}
        />
    );
};

const isValidUrl = (url?: string) =>
    !!url && (url.startsWith('http://') || url.startsWith('https://'));

const categoryColor: Record<string, string> = {
    general: '#6366F1', activity: '#F59E0B', guide: '#10B981', lost_found: '#EF4444',
};

export default function ForumPostDetailScreen() {
    const { id } = useLocalSearchParams();
    const { t } = useTranslation();
    const router = useRouter();

    const [post, setPost] = useState<ForumPost | null>(null);
    const [comments, setComments] = useState<ForumComment[]>([]);
    const [loading, setLoading] = useState(true);
    const [commentText, setCommentText] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [deleteModal, setDeleteModal] = useState(false);
    const [deleteType, setDeleteType] = useState<'post' | 'comment'>('post');
    const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [toast, setToast] = useState<{ visible: boolean; message: string; type: ToastType }>({
        visible: false, message: '', type: 'success',
    });

    useEffect(() => {
        const load = async () => {
            if (!id) return;
            try {
                const user = await getCurrentUser();
                setCurrentUser(user);
                const [p, c] = await Promise.all([
                    fetchForumPostById(id as string, user?.uid),
                    fetchForumComments(id as string),
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

    const handleUpvote = async () => {
        if (!post || !currentUser) return;
        const result = await toggleForumUpvote(post.id, currentUser.uid);
        setPost(prev => prev ? {
            ...prev,
            isUpvoted: result.upvoted,
            upvoteCount: result.upvoted ? prev.upvoteCount + 1 : Math.max(0, prev.upvoteCount - 1),
        } : null);
    };

    const handleSendComment = async () => {
        if (!commentText.trim() || !post || !currentUser) return;
        try {
            setSubmitting(true);
            const c = await addForumComment({
                postId: post.id,
                authorId: currentUser.uid,
                authorName: currentUser.displayName || t('common.anonymous'),
                authorEmail: (currentUser as any).email,
                authorAvatar: currentUser.avatarUrl || undefined,
                content: commentText.trim(),
            });
            setComments(prev => [...prev, c]);
            setPost(prev => prev ? { ...prev, replyCount: prev.replyCount + 1 } : null);
            setCommentText('');
            Keyboard.dismiss();
            setToast({ visible: true, message: t('forum.detail.toast.comment_success'), type: 'success' });
        } catch {
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

    const images = (post.images || []).filter(isValidUrl);

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
                {currentUser?.uid === post.authorId ? (
                    <TouchableOpacity style={styles.iconBtn} onPress={() => { setDeleteType('post'); setDeleteModal(true); }}>
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
                <Text style={styles.title}>{post.title}</Text>

                {/* Author row */}
                <View style={styles.authorRow}>
                    <View style={styles.avatar}>
                        {isValidUrl(post.authorAvatar) ? (
                            <Image source={{ uri: post.authorAvatar }} style={styles.avatarImg} />
                        ) : (
                            <Text style={styles.avatarLetter}>{post.authorName.charAt(0).toUpperCase()}</Text>
                        )}
                    </View>
                    <Text style={styles.authorName}>{post.authorName}</Text>
                    <EduBadge shouldShow={isHKBUEmail(post.authorEmail)} size="small" />
                </View>

                {/* Content */}
                {!!post.content && (
                    <Text style={styles.bodyText}>{post.content}</Text>
                )}

                {/* Images – original aspect ratio */}
                {images.length > 0 && (
                    <View style={styles.imageGrid}>
                        {images.length === 1 ? (
                            // Single image: natural aspect ratio at full width
                            <TouchableOpacity activeOpacity={0.9} onPress={() => setPreviewImage(images[0])}>
                                <AutoHeightImage uri={images[0]} />
                            </TouchableOpacity>
                        ) : (
                            // Multiple images: square grid thumbnails
                            images.map((uri, i) => (
                                <TouchableOpacity key={i} activeOpacity={0.8} onPress={() => setPreviewImage(uri)}>
                                    <Image
                                        source={{ uri }}
                                        style={{ width: IMG_MULTI_SIZE, height: IMG_MULTI_SIZE, borderRadius: 8, backgroundColor: '#F3F4F6' }}
                                        resizeMode="cover"
                                        onError={(e) => console.warn('Image load error:', e.nativeEvent.error)}
                                    />
                                </TouchableOpacity>
                            ))
                        )}
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

                {comments.map(c => (
                    <View key={c.id} style={styles.commentItem}>
                        <View style={styles.commentAvatar}>
                            {isValidUrl(c.authorAvatar) ? (
                                <Image source={{ uri: c.authorAvatar! }} style={styles.avatarImg} />
                            ) : (
                                <Text style={styles.avatarLetter}>{c.authorName.charAt(0).toUpperCase()}</Text>
                            )}
                        </View>
                        <View style={styles.commentBody}>
                            <View style={styles.commentHeader}>
                                <Text style={styles.commentAuthor}>{c.authorName}</Text>
                                <EduBadge shouldShow={isHKBUEmail(c.authorEmail)} size="small" />
                                {currentUser?.uid === c.authorId && (
                                    <TouchableOpacity
                                        style={{ marginLeft: 'auto' }}
                                        onPress={() => { setSelectedCommentId(c.id); setDeleteType('comment'); setDeleteModal(true); }}
                                    >
                                        <Trash2 size={14} color="#EF4444" />
                                    </TouchableOpacity>
                                )}
                            </View>
                            <Text style={styles.commentText}>{c.content}</Text>
                            <Text style={styles.commentTime}>
                                {formatDistanceToNow(c.createdAt, { addSuffix: true })}
                            </Text>
                        </View>
                    </View>
                ))}
                <View style={{ height: 100 }} />
            </ScrollView>

            {/* Bottom bar */}
            <View style={styles.bottomBar}>
                <View style={styles.inputPill}>
                    <TextInput
                        style={styles.textInput}
                        placeholder={t('forum.detail.comment_placeholder')}
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

            <ActionModal
                visible={deleteModal}
                title={deleteType === 'post' ? t('forum.detail.delete_post_title') : t('forum.detail.delete_comment_title')}
                message={deleteType === 'post' ? t('forum.detail.delete_post_confirm') : t('forum.detail.delete_comment_confirm')}
                onConfirm={confirmDelete}
                onCancel={() => setDeleteModal(false)}
                confirmText={t('common.delete')}
                cancelText={t('common.cancel')}
            />
            <Toast
                visible={toast.visible}
                message={toast.message}
                type={toast.type}
                onHide={() => setToast(p => ({ ...p, visible: false }))}
            />

            {/* Image Preview Modal */}
            <Modal
                visible={!!previewImage}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setPreviewImage(null)}
            >
                <TouchableOpacity
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setPreviewImage(null)}
                >
                    <StatusBar barStyle="light-content" backgroundColor="#000" />
                    {previewImage && (
                        <Image
                            source={{ uri: previewImage }}
                            style={styles.fullImage}
                            resizeMode="contain"
                        />
                    )}
                    <TouchableOpacity
                        style={styles.modalCloseBtn}
                        onPress={() => setPreviewImage(null)}
                    >
                        <X size={28} color="#fff" />
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>
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

    imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },

    upvoteRow: { flexDirection: 'row', marginBottom: 16 },
    upvoteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
    upvoteText: { fontSize: 14, color: '#9CA3AF', fontWeight: '600' },
    upvoteTextActive: { color: '#1E3A8A' },

    divider: { height: 8, backgroundColor: '#F4F6FB', marginHorizontal: -16, marginBottom: 16 },
    commentsLabel: { fontSize: 13, color: '#6B7280', fontWeight: '500', marginBottom: 16 },

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
    commentTime: { fontSize: 11, color: '#9CA3AF', marginTop: 4 },

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
    textInput: { flex: 1, fontSize: 14, color: '#111827', maxHeight: 80 },
    sendBtn: {
        width: 30, height: 30, borderRadius: 15,
        backgroundColor: '#1E3A8A',
        alignItems: 'center', justifyContent: 'center', marginLeft: 8,
    },
    actionBtn: { alignItems: 'center', gap: 2 },
    actionCount: { fontSize: 11, color: '#6B7280', fontWeight: '600' },

    // Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.9)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    fullImage: {
        width: '100%',
        height: '80%',
    },
    modalCloseBtn: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 60 : 30,
        right: 20,
        padding: 5,
    },
});
