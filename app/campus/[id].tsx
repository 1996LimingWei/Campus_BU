import { formatDistanceToNow } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, MessageCircle, Send, Trash2 } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
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
    View
} from 'react-native';
import { ActionModal } from '../../components/campus/ActionModal';
import { PostCard } from '../../components/campus/PostCard';
import { Toast, ToastType } from '../../components/campus/Toast';
import { EduBadge } from '../../components/common/EduBadge';
import { getCurrentUser } from '../../services/auth';
import { addPostComment, deleteComment, deletePost, fetchPostById, fetchPostComments, togglePostLike } from '../../services/campus';
import { Post } from '../../types';
import { isHKBUEmail } from '../../utils/userUtils';

export default function PostDetailScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();

    const [post, setPost] = useState<Post | null>(null);
    const [comments, setComments] = useState<any[]>([]);
    const [commentText, setCommentText] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);

    // UI State
    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [deleteType, setDeleteType] = useState<'post' | 'comment'>('post');
    const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
    const [toast, setToast] = useState<{ visible: boolean; message: string; type: ToastType }>({
        visible: false,
        message: '',
        type: 'success'
    });

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
        if (!post) return;
        try {
            if (!currentUser) return;

            await togglePostLike(post.id, currentUser.uid);
            setPost(prev => prev ? {
                ...prev,
                isLiked: !prev.isLiked,
                likes: prev.isLiked ? prev.likes - 1 : prev.likes + 1
            } : null);
        } catch (error) {
            console.error('Error liking post:', error);
        }
    };

    const handleSendComment = async () => {
        if (!commentText.trim() || !post) return;

        try {
            setSubmitting(true);
            if (!currentUser) return;

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
                setToast({ visible: true, message: 'Comment added!', type: 'success' });
            }
        } catch (error) {
            console.error('Error adding comment:', error);
            setToast({ visible: true, message: 'Failed to add comment', type: 'error' });
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
                setToast({ visible: true, message: 'Post deleted', type: 'success' });
                setTimeout(() => router.back(), 1000);
            } catch (error) {
                console.error('Error deleting post:', error);
                setToast({ visible: true, message: 'Failed to delete post', type: 'error' });
                setDeleteModalVisible(false);
            }
        } else {
            if (!selectedCommentId) return;
            try {
                await deleteComment(selectedCommentId);
                setComments(prev => prev.filter(c => c.id !== selectedCommentId));
                setPost(prev => prev ? { ...prev, comments: Math.max(0, prev.comments - 1) } : null);
                setToast({ visible: true, message: 'Comment deleted', type: 'success' });
            } catch (error) {
                console.error('Error deleting comment:', error);
                setToast({ visible: true, message: 'Failed to delete comment', type: 'error' });
            } finally {
                setDeleteModalVisible(false);
                setSelectedCommentId(null);
            }
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
            <StatusBar barStyle="light-content" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <ChevronLeft size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Post Detail</Text>
                <View style={{ width: 24 }} />
            </View>

            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#1E3A8A" />
                </View>
            ) : !post ? (
                <View style={styles.emptyComments}>
                    <Text style={styles.emptyText}>Post not found.</Text>
                </View>
            ) : (
                <ScrollView
                    style={styles.content}
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                >
                    <PostCard
                        post={post}
                        onLike={handleLike}
                        onDelete={triggerDeletePost}
                        currentUserId={currentUser?.uid}
                    />

                    <View style={styles.commentsHeader}>
                        <Text style={styles.commentsTitle}>Comments ({post.comments || 0})</Text>
                    </View>

                    {comments && comments.length > 0 ? (
                        <View style={styles.repliesList}>
                            {comments.map(comment => (
                                <View key={comment.id} style={styles.replyItem}>
                                    <View style={styles.replyAvatar}>
                                        {comment.author_avatar ? (
                                            <Image source={{ uri: comment.author_avatar }} style={styles.avatarImage} />
                                        ) : (
                                            <Text style={styles.replyAvatarText}>
                                                {comment.author_name ? comment.author_name.charAt(0) : '?'}
                                            </Text>
                                        )}
                                    </View>
                                    <View style={styles.replyInfo}>
                                        <View style={styles.commentHeaderRow}>
                                            <Text style={styles.replyAuthor}>{comment.author_name}</Text>
                                            <EduBadge shouldShow={isHKBUEmail(comment.author_email)} size="small" />
                                            {currentUser?.uid === comment.author_id && (
                                                <TouchableOpacity
                                                    onPress={() => triggerDeleteComment(comment.id)}
                                                >
                                                    <Trash2 size={16} color="#EF4444" />
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                        <Text style={styles.replyContent}>{comment.content}</Text>
                                        <Text style={styles.replyTime}>
                                            {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    ) : (
                        <View style={styles.emptyComments}>
                            <MessageCircle size={48} color="#D1D5DB" />
                            <Text style={styles.emptyText}>No comments yet. Start the conversation!</Text>
                        </View>
                    )}
                </ScrollView>
            )}

            {/* Sticky Input */}
            <View style={styles.inputWrapper}>
                <View style={styles.inputContainer}>
                    <TextInput
                        style={styles.input}
                        placeholder="Write a comment..."
                        value={commentText}
                        onChangeText={setCommentText}
                        multiline
                    />
                    <TouchableOpacity
                        style={[styles.sendButton, (!commentText.trim() || submitting) && styles.sendButtonDisabled]}
                        onPress={handleSendComment}
                        disabled={!commentText.trim() || submitting}
                    >
                        {submitting ? (
                            <ActivityIndicator size="small" color="#1E3A8A" />
                        ) : (
                            <Send size={20} color={commentText.trim() ? "#1E3A8A" : "#9CA3AF"} />
                        )}
                    </TouchableOpacity>
                </View>
            </View>

            <ActionModal
                visible={deleteModalVisible}
                title={deleteType === 'post' ? "Delete Post" : "Delete Comment"}
                message={`Are you sure you want to delete this ${deleteType}? This action cannot be undone.`}
                onConfirm={confirmDelete}
                onCancel={() => setDeleteModalVisible(false)}
                confirmText="Delete"
            />

            <Toast
                visible={toast.visible}
                message={toast.message}
                type={toast.type}
                onHide={() => setToast(prev => ({ ...prev, visible: false }))}
            />
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    header: {
        paddingTop: 56,
        paddingBottom: 16,
        paddingHorizontal: 20,
        backgroundColor: '#1E3A8A',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff',
    },
    content: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 32,
    },
    commentsHeader: {
        marginTop: 24,
        marginBottom: 16,
        paddingHorizontal: 4,
    },
    commentsTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#111827',
    },
    repliesList: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    replyItem: {
        flexDirection: 'row',
        marginBottom: 20,
    },
    replyAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#F3E8FF',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
        overflow: 'hidden',
    },
    avatarImage: {
        width: '100%',
        height: '100%',
    },
    replyAvatarText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#7C3AED',
    },
    replyInfo: {
        flex: 1,
    },
    replyAuthor: {
        fontSize: 14,
        fontWeight: '700',
        color: '#111827',
    },
    commentHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 2,
    },
    replyContent: {
        fontSize: 14,
        color: '#374151',
        lineHeight: 20,
    },
    replyTime: {
        fontSize: 11,
        color: '#9CA3AF',
        marginTop: 4,
    },
    emptyComments: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
    emptyText: {
        marginTop: 12,
        fontSize: 14,
        color: '#6B7280',
        textAlign: 'center',
    },
    inputWrapper: {
        backgroundColor: '#fff',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
        paddingBottom: Platform.OS === 'ios' ? 32 : 12,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F3F4F6',
        borderRadius: 24,
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    input: {
        flex: 1,
        fontSize: 15,
        color: '#111827',
        maxHeight: 100,
    },
    sendButton: {
        padding: 8,
        marginLeft: 8,
    },
    sendButtonDisabled: {
        opacity: 0.5,
    },
});
