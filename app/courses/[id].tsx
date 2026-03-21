import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check, ChevronLeft, Info, MessageCircle, MessageSquare, Plus, Send, Star, Tag, ThumbsUp, Trash2, UserPlus, Users, X } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ActivityIndicator,
    Animated,
    Alert,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { EduBadge } from '../../components/common/EduBadge';
import { TranslatableText } from '../../components/common/TranslatableText';
import { useCourseActivity } from '../../context/CourseActivityContext';
import { useLoginPrompt } from '../../hooks/useLoginPrompt';
import { useUgcEntryActions } from '../../hooks/useUgcEntryActions';
import storage from '../../lib/storage';
import { getCurrentUser } from '../../services/auth';
import { addReview, deleteReview, getCourseById, getReviewsAndHasReviewed, likeReview } from '../../services/courses';
import { reportContent, ReportReason } from '../../services/moderation';
import { supabase } from '../../services/supabase';
import { deleteTeamingRequest, fetchTeamingComments, fetchTeamingRequests, postTeamingComment, postTeamingRequest, toggleTeamingLike } from '../../services/teaming';
import { ContactMethod, Course, CourseTeaming, Review, TeamingComment } from '../../types';
import { isHKBUEmail } from '../../utils/userUtils';
// Helper function to check if string is a URL
const isImageUrl = (str: string): boolean => {
    if (!str) return false;
    return str.startsWith('http://') || str.startsWith('https://');
};

const normalizeChatUser = (userData?: { display_name?: string; avatar_url?: string; email?: string } | null) => ({
    ...userData,
    avatar_url: userData?.avatar_url || '',
});

// Mock Data
const MOCK_REVIEWS: Review[] = [
    {
        id: 'r1',
        courseId: '1',
        authorId: 'u1',
        authorName: '匿名同学',
        authorAvatar: '🐸',
        rating: 5,
        difficulty: 3,
        content: 'Jean 教得很好，只要认真听课，考试不难。Project 也不算太重，推荐！',
        tags: ['给分好', '内容实用'],
        likes: 12,
        createdAt: new Date('2025-01-15'),
        semester: '2024 Fall'
    }
];

export default function CourseDetailScreen() {
    const { t } = useTranslation();
    const router = useRouter();
    const { checkLogin } = useLoginPrompt();
    const { unreadByCourse, markCourseSeen, refresh: refreshCourseActivity } = useCourseActivity();
    const { id } = useLocalSearchParams();
    const courseUnread = typeof id === 'string' ? unreadByCourse[id] : undefined;
    const [activeTab, setActiveTab] = useState<'reviews' | 'chat' | 'teaming'>('reviews');
    const [course, setCourse] = useState<Course | null>(null);
    const [reviews, setReviews] = useState<Review[]>([]);
    const [modalVisible, setModalVisible] = useState(false);
    const [sortBy, setSortBy] = useState<'newest' | 'likes'>('newest');
    const [likedReviewIds, setLikedReviewIds] = useState<string[]>([]);
    const [teamingRequests, setTeamingRequests] = useState<CourseTeaming[]>([]);
    const [isTeamingModalVisible, setIsTeamingModalVisible] = useState(false);
    const [teamingLoading, setTeamingLoading] = useState(false);

    // Chat State
    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [user, setUser] = useState<any>(null);
    const flatListRef = useRef<FlatList>(null);

    const [hasReviewed, setHasReviewed] = useState(false);

    // Form State
    const [rating, setRating] = useState(0);
    const [difficulty, setDifficulty] = useState(0);
    const [reviewContent, setReviewContent] = useState('');
    const [isAnonymous, setIsAnonymous] = useState(false);

    // Teaming Form State
    const [teamingSection, setTeamingSection] = useState('');
    const [teamingSelfIntro, setTeamingSelfIntro] = useState('');
    const [teamingTarget, setTeamingTarget] = useState('');
    const [selectedTeamingMethods, setSelectedTeamingMethods] = useState<ContactMethod['platform'][]>([]);
    const [teamingContactValues, setTeamingContactValues] = useState<Record<string, string>>({});
    const [teamingOtherPlatformName, setTeamingOtherPlatformName] = useState('');
    const [teamingSubmitting, setTeamingSubmitting] = useState(false);
    const [selectedTeamingContact, setSelectedTeamingContact] = useState<CourseTeaming | null>(null);

    // Teaming Social State
    const [likedTeamingIds, setLikedTeamingIds] = useState<string[]>([]);
    const [isTeamingCommentModalVisible, setIsTeamingCommentModalVisible] = useState(false);
    const [selectedTeamingForComments, setSelectedTeamingForComments] = useState<CourseTeaming | null>(null);
    const [teamingComments, setTeamingComments] = useState<TeamingComment[]>([]);
    const [teamingCommentLoading, setTeamingCommentLoading] = useState(false);
    const [newTeamingComment, setNewTeamingComment] = useState('');
    const [teamingReplyTarget, setTeamingReplyTarget] = useState<TeamingComment | null>(null);
    const teamingCommentInputRef = useRef<TextInput>(null);
    const ugcActions = useUgcEntryActions({
        currentUserId: user?.uid,
        ensureLoggedIn: () => !!checkLogin(user),
    });

    const roomId = `course_${id}`;
    const REPORT_REASONS: Array<{ label: string; value: ReportReason }> = [
        { label: '垃圾内容', value: 'spam' },
        { label: '骚扰辱骂', value: 'harassment' },
        { label: '仇恨/歧视', value: 'hate_speech' },
        { label: '色情低俗', value: 'sexual_content' },
        { label: '其他', value: 'other' },
    ];

    useEffect(() => {
        loadData();
        setupRealtime();
        if (typeof id === 'string') {
            void markCourseSeen(id);
        }
        return () => {
            supabase.channel(roomId).unsubscribe();
        };
    }, [id, markCourseSeen]);

    const loadData = async () => {
        // ── Phase 1: get user + liked reviews from local cache (instant) ──
        const [currentUser, likedStr] = await Promise.all([
            getCurrentUser(),
            storage.getItem('hkcampus_liked_reviews').catch(() => null),
        ]);
        setUser(currentUser);
        if (likedStr) {
            try { setLikedReviewIds(JSON.parse(likedStr)); } catch { }
        }

        // ── Phase 2: fetch course + chat messages in parallel ──
        const isMockId = id === '1';
        const [courseData, messagesResult] = await Promise.all([
            getCourseById(id as string),
            supabase
                .from('messages')
                .select('*, users(display_name, avatar_url, email)')
                .eq('course_id', id as string)
                .order('created_at', { ascending: true }),
        ]);

        if (courseData) setCourse(courseData);
        else console.warn('Course not found for ID:', id);

        if (messagesResult.data) {
            setMessages(messagesResult.data.map((message: any) => ({
                ...message,
                users: normalizeChatUser(message.users),
            })));
        }

        // ── Phase 3: reviews + hasReviewed in one round-trip ──
        if (isMockId) {
            setReviews(MOCK_REVIEWS);
        } else {
            const { reviews, hasReviewed } = await getReviewsAndHasReviewed(
                id as string,
                currentUser?.uid ?? null,
                courseData?.code,
            );
            setReviews(reviews);
            setHasReviewed(hasReviewed);
        }

        // Teaming can load in background (not blocking the main view)
        loadTeaming();
    };

    const loadTeaming = async () => {
        setTeamingLoading(true);
        const data = await fetchTeamingRequests(id as string);
        setTeamingRequests(data);
        setTeamingLoading(false);
    };

    const organizedTeamingComments = React.useMemo(() => {
        const rootComments = teamingComments.filter(c => !c.parentCommentId);
        const replyMap: Record<string, TeamingComment[]> = {};

        teamingComments.forEach(c => {
            if (c.parentCommentId) {
                if (!replyMap[c.parentCommentId]) replyMap[c.parentCommentId] = [];
                replyMap[c.parentCommentId].push(c);
            }
        });

        return rootComments.map(root => ({
            ...root,
            replies: replyMap[root.id] || []
        }));
    }, [teamingComments]);

    const setupRealtime = () => {
        const channel = supabase
            .channel(roomId)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `course_id=eq.${id}`
            }, async (payload) => {
                // Fetch user info for the new message
                const { data: userData } = await supabase
                    .from('users')
                    .select('display_name, avatar_url, email')
                    .eq('id', payload.new.sender_id)
                    .single();

                const messageWithUser = {
                    ...payload.new,
                    users: normalizeChatUser(userData),
                };

                setMessages(prev => {
                    // Prevent duplicates if optimistic update already added it
                    if (prev.find(m => m.id === payload.new.id)) return prev;
                    return [...prev, messageWithUser];
                });
            })
            .on('postgres_changes', {
                event: 'DELETE',
                schema: 'public',
                table: 'messages',
                filter: `course_id=eq.${id}`
            }, (payload) => {
                setMessages(prev => prev.filter(message => message.id !== payload.old.id));
            })
            .subscribe();
    };

    const handleSendMessage = async () => {
        if (!checkLogin(user)) return;
        if (!newMessage.trim()) return;

        const { error } = await supabase
            .from('messages')
            .insert({
                course_id: id as string,
                sender_id: user.uid,
                content: newMessage.trim()
            });

        if (error) {
            Alert.alert('Error', 'Failed to send message');
        } else {
            // Optimistic update for immediate feedback
            const optimisticMsg = {
                id: `temp_${Date.now()}`,
                room_id: roomId,
                sender_id: user.uid,
                content: newMessage.trim(),
                created_at: new Date().toISOString(),
                users: {
                    display_name: user.displayName || 'Me',
                    avatar_url: user.avatarUrl || '👤',
                    email: user.email || ''
                }
            };
            setMessages(prev => [...prev, optimisticMsg]);
            setNewMessage('');
            void refreshCourseActivity();
        }
    };

    const handleDeleteChatMessage = async (messageId: string) => {
        if (!user?.uid) return;

        const previousMessages = messages;
        setMessages(prev => prev.filter(msg => msg.id !== messageId));

        const { error } = await supabase
            .from('messages')
            .delete()
            .eq('id', messageId)
            .eq('sender_id', user.uid);

        if (error) {
            console.error('Error deleting course chat message:', error);
            setMessages(previousMessages);
            Alert.alert('撤回失败', '请稍后再试。');
        }
    };

    const handleReportCourseMessage = async (messageId: string, reason: ReportReason) => {
        if (!user?.uid) return;

        try {
            await reportContent({
                reporterId: user.uid,
                targetId: messageId,
                targetType: 'comment',
                reason,
            });
            Alert.alert('已举报', '感谢你帮助维护社区安全。我们将核实此内容。');
        } catch (error) {
            console.error('Error reporting course chat message:', error);
            Alert.alert('举报失败', '请稍后再试。');
        }
    };

    const openCourseChatMessageActions = (msg: any) => {
        const copyText = String(msg.content || '').trim();
        const isOwnMessage = msg.sender_id === user?.uid;

        const actions: Array<{ text: string; onPress?: () => void; style?: 'default' | 'cancel' | 'destructive' }> = [
            {
                text: '复制',
                onPress: () => {
                    Clipboard.setStringAsync(copyText).then(() => {
                        Alert.alert('已复制', '内容已复制到剪贴板。');
                    }).catch((error) => {
                        console.error('Error copying course chat message:', error);
                        Alert.alert('复制失败', '请稍后再试。');
                    });
                },
            },
            {
                text: '举报',
                onPress: () => {
                    Alert.alert(
                        '举报内容',
                        '你为什么要举报这个消息？',
                        [
                            ...REPORT_REASONS.map((reason) => ({
                                text: reason.label,
                                onPress: () => { void handleReportCourseMessage(msg.id, reason.value); },
                            })),
                            { text: '取消', style: 'cancel' as const },
                        ],
                    );
                },
            },
        ];

        if (isOwnMessage) {
            actions.push({
                text: '撤回',
                style: 'destructive',
                onPress: () => {
                    Alert.alert(
                        '撤回消息',
                        '确定撤回这条消息吗？撤回即删除消息。',
                        [
                            { text: '取消', style: 'cancel' },
                            {
                                text: '撤回',
                                style: 'destructive',
                                onPress: () => { void handleDeleteChatMessage(msg.id); },
                            },
                        ],
                    );
                },
            });
        }

        actions.push({ text: '取消', style: 'cancel' });
        Alert.alert('消息操作', '请选择操作', actions);
    };

    const handleAddReview = async () => {
        if (!checkLogin(user)) return;

        if (!hasReviewed && rating === 0) {
            Alert.alert('Error', 'Please provide a star rating for your first evaluation of this course.');
            return;
        }

        if (!reviewContent.trim()) {
            Alert.alert('Error', 'Please provide some comments about the course.');
            return;
        }

        // Block only the demo ID '1'
        const isDemoId = id === '1';

        if (isDemoId) {
            Alert.alert('Demo Mode', 'This course is for demonstration. To enable real reviews, please add this course through the "Add Course" menu first.');
            return;
        }

        const reviewData: Partial<Review> = {
            courseId: id as string,
            authorId: user.uid,
            authorName: isAnonymous ? '匿名同学' : (user.displayName || 'Anonymous'),
            authorAvatar: isAnonymous ? '👤' : (user.avatarUrl || '👤'),
            rating: rating > 0 ? rating : undefined,
            difficulty: difficulty > 0 ? difficulty : 3,
            content: reviewContent.trim(),
            semester: '2025 Spring',
            isAnonymous: isAnonymous
        };

        const { error } = await addReview(reviewData);

        if (error) {
            Alert.alert('Error', `Failed to post review: ${error.message || 'Unknown error'}`);
            console.error('Add review UI error:', error);
        } else {
            // Optimistic update — show review immediately without waiting for a full reload
            const newReviewObj: Review = {
                id: `temp_${Date.now()}`,
                courseId: id as string,
                authorId: user.uid,
                authorName: user.displayName || 'Me',
                authorAvatar: user.avatarUrl || '👤',
                rating: rating > 0 ? rating : undefined,
                difficulty: difficulty > 0 ? difficulty : 3,
                content: reviewContent.trim(),
                tags: [],
                likes: 0,
                createdAt: new Date(),
                semester: '2025 Spring'
            };
            setReviews(prev => [newReviewObj, ...prev]);
            if (rating > 0) setHasReviewed(true);

            setModalVisible(false);
            setRating(0);
            setDifficulty(0);
            setReviewContent('');
            setIsAnonymous(false);
            Alert.alert('Success', 'Evaluation posted successfully!');

            // Silent background refresh to replace temp entry with real DB row
            getReviewsAndHasReviewed(id as string, user.uid, course?.code).then(({ reviews, hasReviewed }) => {
                setReviews(reviews);
                setHasReviewed(hasReviewed);
                void refreshCourseActivity();
            }).catch(() => { });
        }
    };

    const handleLike = async (reviewId: string) => {
        if (!checkLogin(user)) return;

        const isCurrentlyLiked = likedReviewIds.includes(reviewId);

        // Optimistic update
        setReviews(prev => prev.map(r =>
            r.id === reviewId ? { ...r, likes: isCurrentlyLiked ? Math.max(0, (r.likes || 0) - 1) : (r.likes || 0) + 1 } : r
        ));

        let newLikedIds;
        if (isCurrentlyLiked) {
            newLikedIds = likedReviewIds.filter(id => id !== reviewId);
        } else {
            newLikedIds = [...likedReviewIds, reviewId];
        }

        setLikedReviewIds(newLikedIds);

        try {
            await storage.setItem('hkcampus_liked_reviews', JSON.stringify(newLikedIds));
        } catch (e) {
            console.error('Error saving like status:', e);
        }

        const { error } = await likeReview(reviewId, id as string, isCurrentlyLiked);
        if (error) {
            console.error('Like error:', error);
        }
    };

    const handleDeleteReview = (review: Review) => {
        if (!user || review.authorId !== user.uid) return;

        Alert.alert('Delete Review', 'Are you sure you want to delete this review?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                    const { error } = await deleteReview(review.id, user.uid, id as string);
                    if (error) {
                        Alert.alert('Error', `Failed to delete review: ${error.message || 'Unknown error'}`);
                        return;
                    }

                    setReviews(prev => prev.filter(r => r.id !== review.id));
                    setHasReviewed(false);
                    loadData();
                    void refreshCourseActivity();
                }
            }
        ]);
    };

    const handleDeleteTeaming = (teaming: CourseTeaming) => {
        if (!user) {
            // This should technically never happen for a guest seeing their own post
            // but for safety:
            if (!checkLogin(user)) return;
        }
        if (teaming.userId !== user.uid) return;

        Alert.alert('Delete Teaming Post', 'Are you sure you want to delete this teaming post?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                    const { success, error } = await deleteTeamingRequest(teaming.id, user.uid);
                    if (!success) {
                        Alert.alert('Error', error || 'Failed to delete teaming post.');
                        return;
                    }

                    setTeamingRequests(prev => prev.filter(item => item.id !== teaming.id));
                    await loadTeaming();
                }
            }
        ]);
    };

    const handlePostTeaming = async () => {
        if (!checkLogin(user)) return;
        if (!teamingSection || selectedTeamingMethods.length === 0) {
            Alert.alert('Missing Info', 'Section and at least one contact method are required.');
            return;
        }

        setTeamingSubmitting(true);
        try {
            const contacts: ContactMethod[] = selectedTeamingMethods.map(p => ({
                platform: p,
                otherPlatformName: p === 'Other' ? teamingOtherPlatformName : undefined,
                value: teamingContactValues[p] || ''
            }));

            const { success, data, error } = await postTeamingRequest({
                courseId: id as string,
                userId: user.uid,
                userName: user.displayName || 'Anonymous',
                userAvatar: user.avatarUrl || '👤',
                userMajor: user.major || 'Student',
                section: teamingSection,
                selfIntro: teamingSelfIntro,
                targetTeammate: teamingTarget,
                contacts: contacts,
            });

            if (success && data) {
                setTeamingRequests(prev => [data, ...prev]);
                setIsTeamingModalVisible(false);
                resetTeamingForm();
                Alert.alert('Success', 'Teaming request posted!');
                void refreshCourseActivity();
            } else {
                Alert.alert('Error', error || 'Failed to post teaming request');
            }
        } catch (error) {
            Alert.alert('Error', 'Failed to post teaming request');
        } finally {
            setTeamingSubmitting(false);
        }
    };

    const resetTeamingForm = () => {
        setTeamingSection('');
        setTeamingSelfIntro('');
        setTeamingTarget('');
        setSelectedTeamingMethods([]);
        setTeamingContactValues({});
        setTeamingOtherPlatformName('');
    };

    const toggleTeamingMethod = (platform: ContactMethod['platform']) => {
        if (selectedTeamingMethods.includes(platform)) {
            setSelectedTeamingMethods(selectedTeamingMethods.filter(m => m !== platform));
        } else {
            setSelectedTeamingMethods([...selectedTeamingMethods, platform]);
        }
    };

    const handleLikeTeaming = async (teamingId: string) => {
        if (!checkLogin(user)) return;

        const isLiked = likedTeamingIds.includes(teamingId);
        setLikedTeamingIds(prev =>
            isLiked ? prev.filter(id => id !== teamingId) : [...prev, teamingId]
        );

        setTeamingRequests(prev => prev.map(req => {
            if (req.id === teamingId) {
                return { ...req, likes: isLiked ? req.likes - 1 : req.likes + 1 };
            }
            return req;
        }));

        const { success } = await toggleTeamingLike(teamingId, user.uid);
        if (!success) {
            setLikedTeamingIds(prev =>
                isLiked ? [...prev, teamingId] : prev.filter(id => id !== teamingId)
            );
            setTeamingRequests(prev => prev.map(req => {
                if (req.id === teamingId) {
                    return { ...req, likes: isLiked ? req.likes + 1 : req.likes - 1 };
                }
                return req;
            }));
        }
    };

    const handleOpenTeamingComments = async (teaming: CourseTeaming) => {
        setSelectedTeamingForComments(teaming);
        setIsTeamingCommentModalVisible(true);
        setTeamingCommentLoading(true);
        const comments = await fetchTeamingComments(teaming.id);
        setTeamingComments(comments);
        setTeamingCommentLoading(false);
    };

    const handleSendTeamingComment = async () => {
        if (!checkLogin(user)) return;
        if (!selectedTeamingForComments || !newTeamingComment.trim()) return;

        const { success, error } = await postTeamingComment(
            selectedTeamingForComments.id,
            user,
            newTeamingComment.trim(),
            teamingReplyTarget?.parentCommentId || teamingReplyTarget?.id,
            teamingReplyTarget?.authorName
        );
        if (success) {
            setNewTeamingComment('');
            setTeamingReplyTarget(null);
            const comments = await fetchTeamingComments(selectedTeamingForComments.id);
            setTeamingComments(comments);

            setTeamingRequests(prev => prev.map(req => {
                if (req.id === selectedTeamingForComments.id) {
                    return { ...req, commentCount: req.commentCount + 1 };
                }
                return req;
            }));
        } else {
            Alert.alert('Error', error || 'Failed to post comment.');
        }
    };

    const sortedReviews = [...reviews].sort((a, b) => {
        if (sortBy === 'likes') {
            return (b.likes || 0) - (a.likes || 0);
        }
        return b.createdAt.getTime() - a.createdAt.getTime();
    });

    // Helper: rating → left-bar color
    const ratingBarColor = (rating?: number) => {
        if (!rating) return '#D1D5DB';
        if (rating >= 4) return '#10B981';
        if (rating === 3) return '#3B82F6';
        return '#F59E0B';
    };

    const renderReviewItem = ({ item }: { item: Review }) => (
        <Animated.View
            style={[
                styles.reviewCard,
                { borderLeftColor: ratingBarColor(item.rating) },
                ugcActions.getHighlightStyle(item.id),
            ]}
        >
            <TouchableOpacity
                activeOpacity={0.96}
                onLongPress={() => ugcActions.openActions({
                    id: item.id,
                    targetId: item.id,
                    targetType: 'comment',
                    content: item.content,
                    authorId: item.isAnonymous ? undefined : item.authorId,
                    authorName: item.authorName,
                    isAnonymous: item.isAnonymous,
                })}
            >
            <View style={styles.reviewHeader}>
                <View style={styles.authorInfo}>
                    <View style={styles.avatarContainer}>
                        {item.authorAvatar && item.authorAvatar.length > 2 ? (
                            <Image source={{ uri: item.authorAvatar }} style={styles.avatarImage} />
                        ) : (
                            <Text style={styles.avatarFallbackText}>{item.authorAvatar || '👤'}</Text>
                        )}
                    </View>
                    <View>
                        <View style={styles.nameRow}>
                            <Text style={styles.authorName}>{item.authorName}</Text>
                            <EduBadge shouldShow={isHKBUEmail(item.authorEmail)} size="small" />
                        </View>
                        <Text style={styles.semester}>{item.semester}</Text>
                    </View>
                </View>
                {/* ⑦ 5-star visual */}
                <View style={styles.reviewRating}>
                    {item.rating ? (
                        <View style={{ flexDirection: 'row', gap: 2 }}>
                            {[1, 2, 3, 4, 5].map(s => (
                                <Star
                                    key={s}
                                    size={13}
                                    color="#F59E0B"
                                    fill={s <= item.rating! ? '#F59E0B' : 'transparent'}
                                />
                            ))}
                        </View>
                    ) : (
                        <Text style={[styles.ratingValue, { color: '#6B7280' }]}>Update</Text>
                    )}
                </View>
            </View>

            <View style={styles.tagsContainer}>
                {item.tags.map((tag, index) => (
                    <View key={index} style={styles.tag}>
                        <Text style={styles.tagText}>{tag}</Text>
                    </View>
                ))}
                <View style={[styles.tag, styles.difficultyTag]}>
                    <Text style={styles.tagText}>难度: {item.difficulty}/5</Text>
                </View>
            </View>

            <TranslatableText style={styles.reviewContent} text={item.content} />

            <View style={styles.reviewFooter}>
                <Text style={styles.date}>{item.createdAt.toLocaleDateString()}</Text>
                <View style={styles.reviewActions}>
                    {user && item.authorId === user.uid && (
                        <TouchableOpacity
                            onPress={() => handleDeleteReview(item)}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                        >
                            <Trash2 size={14} color="#EF4444" />
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity
                        style={styles.likeButton}
                        onPress={() => handleLike(item.id)}
                    >
                        <ThumbsUp
                            size={14}
                            color={likedReviewIds.includes(item.id) ? "#4B0082" : "#6B7280"}
                            fill={likedReviewIds.includes(item.id) ? "#4B0082" : "transparent"}
                        />
                        <Text style={[
                            styles.likeCount,
                            likedReviewIds.includes(item.id) && { color: '#4B0082', fontWeight: 'bold' }
                        ]}>
                            {item.likes}
                        </Text>
                    </TouchableOpacity>
                    {item.authorId === user?.uid && (
                        <TouchableOpacity style={styles.deleteTag} onPress={() => handleDeleteReview(item)}>
                            <Trash2 size={12} color="#B91C1C" />
                        </TouchableOpacity>
                    )}
                </View>
            </View>
            </TouchableOpacity>
        </Animated.View>
    );

    const renderTeamingItem = ({ item }: { item: CourseTeaming }) => (
        <Animated.View style={[styles.teamingCard, ugcActions.getHighlightStyle(item.id)]}>
            <TouchableOpacity
                activeOpacity={0.97}
                onLongPress={() => ugcActions.openActions({
                    id: item.id,
                    targetId: item.id,
                    targetType: 'post',
                    content: [item.selfIntro, item.targetTeammate].filter(Boolean).join('\n'),
                    authorId: item.userId,
                    authorName: item.userName,
                })}
            >
            <View style={styles.teamingHeader}>
                <View style={styles.authorInfo}>
                    <View style={styles.avatarContainer}>
                        {isImageUrl(item.userAvatar) ? (
                            <Image source={{ uri: item.userAvatar }} style={styles.avatarImage} />
                        ) : (
                            <Text style={styles.avatarFallbackText}>{item.userAvatar || '👤'}</Text>
                        )}
                    </View>
                    <View>
                        <View style={styles.nameRow}>
                            <Text style={styles.authorName}>{item.userName}</Text>
                            <EduBadge shouldShow={isHKBUEmail(item.userEmail)} size="small" />
                        </View>
                        <Text style={styles.userMajor}>{item.userMajor || 'Student'}</Text>
                    </View>
                </View>
                <View style={[styles.sectionBadge, { backgroundColor: '#EEF2FF' }]}>
                    <Users size={12} color="#4F46E5" />
                    <Text style={styles.sectionBadgeText}>{item.section}</Text>
                </View>
            </View>

            {item.selfIntro && (
                <View style={styles.teamingDetailBox}>
                    <Text style={styles.detailTitle}>About Me:</Text>
                    <TranslatableText style={styles.detailBody} text={item.selfIntro} />
                </View>
            )}

            {item.targetTeammate && (
                <View style={[styles.teamingDetailBox, { backgroundColor: '#F0FDF4' }]}>
                    <Text style={[styles.detailTitle, { color: '#166534' }]}>Looking for:</Text>
                    <TranslatableText style={[styles.detailBody, { color: '#166534' }]} text={item.targetTeammate} />
                </View>
            )}

            <View style={styles.teamingFooter}>
                <View style={styles.teamingStats}>
                    <TouchableOpacity
                        style={styles.teamingStatItem}
                        onPress={() => handleLikeTeaming(item.id)}
                    >
                        <ThumbsUp
                            size={14}
                            color={likedTeamingIds.includes(item.id) ? "#4B0082" : "#6B7280"}
                            fill={likedTeamingIds.includes(item.id) ? "#4B0082" : "transparent"}
                        />
                        <Text style={[
                            styles.teamingStatText,
                            likedTeamingIds.includes(item.id) && { color: '#4B0082', fontWeight: '600' }
                        ]}>{item.likes}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.teamingStatItem}
                        onPress={() => handleOpenTeamingComments(item)}
                    >
                        <MessageSquare size={14} color="#6B7280" />
                        <Text style={styles.teamingStatText}>{item.commentCount}</Text>
                    </TouchableOpacity>
                </View>
                <View style={styles.teamingRightActions}>
                    {item.userId === user?.uid && (
                        <TouchableOpacity style={styles.deleteTag} onPress={() => handleDeleteTeaming(item)}>
                            <Trash2 size={12} color="#B91C1C" />
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity
                        style={styles.contactIconBtn}
                        onPress={() => {
                            if (checkLogin(user)) {
                                setSelectedTeamingContact(item);
                            }
                        }}
                    >
                        <Send size={14} color="#fff" />
                        <Text style={styles.contactIconBtnText}>Contact</Text>
                    </TouchableOpacity>
                </View>
            </View>
            </TouchableOpacity>
        </Animated.View>
    );

    if (!course) return null;

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => {
                    if (router.canGoBack()) {
                        router.back();
                    } else {
                        router.replace('/(tabs)/course');
                    }
                }}>
                    <ChevronLeft size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle} numberOfLines={1}>{course.code}</Text>
                <View style={{ width: 24 }} />
            </View>

            <View style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    {/* ⑨ Course Info Card with gradient header */}
                    <View style={styles.courseInfoCard}>
                        <LinearGradient
                            colors={['#1E3A8A', '#3B82F6']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.courseInfoGradient}
                        >
                            <View style={styles.codeBadgeWhite}>
                                <Text style={styles.codeTextWhite}>{course.code}</Text>
                            </View>
                            <Text style={styles.courseNameWhite}>{course.name}</Text>
                        </LinearGradient>
                        <View style={styles.statsRowPadded}>
                            <View style={styles.statItem}>
                                <Star size={20} color="#F59E0B" fill="#F59E0B" />
                                <Text style={styles.statValue}>{course.rating}</Text>
                                <Text style={styles.statLabel}>Rating</Text>
                            </View>
                            <View style={styles.divider} />
                            <View style={styles.statItem}>
                                <MessageSquare size={20} color="#4B0082" />
                                <Text style={styles.statValue}>{reviews.length}</Text>
                                <Text style={styles.statLabel}>Reviews</Text>
                            </View>
                            <View style={styles.divider} />
                            <View style={styles.statItem}>
                                <Tag size={20} color="#10B981" />
                                <Text style={styles.statValue}>{course.credits}</Text>
                                <Text style={styles.statLabel}>Credits</Text>
                            </View>
                        </View>
                    </View>

                    {/* Tabs */}
                    <View style={styles.tabBar}>
                        <TouchableOpacity
                            style={[styles.tab, activeTab === 'reviews' && styles.activeTab]}
                            onPress={() => setActiveTab('reviews')}
                        >
                            {!!courseUnread?.reviews && <View style={styles.tabUnreadDot} />}
                            <MessageSquare size={18} color={activeTab === 'reviews' ? '#4B0082' : '#6B7280'} />
                            <Text style={[styles.tabText, activeTab === 'reviews' && styles.activeTabText]}>Reviews</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.tab, activeTab === 'chat' && styles.activeTab]}
                            onPress={() => setActiveTab('chat')}
                        >
                            {!!courseUnread?.chat && <View style={styles.tabUnreadDot} />}
                            <MessageCircle size={18} color={activeTab === 'chat' ? '#4B0082' : '#6B7280'} />
                            <Text style={[styles.tabText, activeTab === 'chat' && styles.activeTabText]}>Chatroom</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.tab, activeTab === 'teaming' && styles.activeTab]}
                            onPress={() => setActiveTab('teaming')}
                        >
                            {!!courseUnread?.teaming && <View style={styles.tabUnreadDot} />}
                            <UserPlus size={18} color={activeTab === 'teaming' ? '#4B0082' : '#6B7280'} />
                            <Text style={[styles.tabText, activeTab === 'teaming' && styles.activeTabText]}>Teaming</Text>
                        </TouchableOpacity>
                    </View>

                    {activeTab === 'reviews' ? (
                        <>
                            <View style={styles.sectionHeader}>
                                <Text style={styles.sectionTitle}>Reviews</Text>
                                <TouchableOpacity style={styles.writeButton} onPress={() => setModalVisible(true)}>
                                    <Plus size={16} color="#fff" />
                                    <Text style={styles.writeButtonText}>Write Review</Text>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.sortContainer}>
                                <TouchableOpacity
                                    style={[styles.sortButton, sortBy === 'newest' && styles.sortButtonActive]}
                                    onPress={() => setSortBy('newest')}
                                >
                                    <Text style={[styles.sortText, sortBy === 'newest' && styles.sortTextActive]}>Latest</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.sortButton, sortBy === 'likes' && styles.sortButtonActive]}
                                    onPress={() => setSortBy('likes')}
                                >
                                    <Text style={[styles.sortText, sortBy === 'likes' && styles.sortTextActive]}>Top Rated</Text>
                                </TouchableOpacity>
                            </View>

                            {sortedReviews.length === 0 ? (
                                <View style={styles.emptyContainer}>
                                    <MessageSquare size={48} color="#D1D5DB" />
                                    <Text style={styles.emptyText}>No reviews yet. Be the first!</Text>
                                </View>
                            ) : (
                                sortedReviews.map(review => (
                                    <View key={review.id} style={{ marginBottom: 12 }}>
                                        {renderReviewItem({ item: review })}
                                    </View>
                                ))
                            )}
                        </>
                    ) : activeTab === 'chat' ? (
                        <View style={styles.chatContainer}>
                            {messages.length === 0 ? (
                                <View style={styles.emptyContainer}>
                                    <MessageCircle size={48} color="#D1D5DB" />
                                    <Text style={styles.emptyText}>No messages yet. Be the first!</Text>
                                </View>
                            ) : (
                                messages.map((msg, index) => (
                                    <View key={msg.id || index} style={[
                                        styles.messageRow,
                                        msg.sender_id === user?.uid ? styles.myMessageRow : styles.otherMessageRow
                                    ]}>
                                        {msg.sender_id !== user?.uid && (
                                            isImageUrl(msg.users?.avatar_url || '') ? (
                                                <Image
                                                    source={{ uri: msg.users?.avatar_url }}
                                                    style={styles.chatAvatarImage}
                                                />
                                            ) : (
                                                <View style={styles.chatAvatarFallback}>
                                                    <Text style={styles.chatAvatarFallbackText}>👤</Text>
                                                </View>
                                            )
                                        )}
                                        <TouchableOpacity
                                            activeOpacity={0.9}
                                            onLongPress={() => openCourseChatMessageActions(msg)}
                                            style={[
                                                styles.messageBubble,
                                                msg.sender_id === user?.uid ? styles.myBubble : styles.otherBubble
                                            ]}
                                        >
                                            <View style={styles.messageAuthorRow}>
                                                <Text style={msg.sender_id === user?.uid ? styles.myMessageAuthor : styles.messageAuthor}>
                                                    {msg.users?.display_name || 'Student'}
                                                </Text>
                                                {isHKBUEmail(msg.users?.email) && (
                                                    <View style={styles.chatEduStarBadge}>
                                                        <Text style={styles.chatEduStarText}>Edu</Text>
                                                    </View>
                                                )}
                                            </View>
                                            <Text style={msg.sender_id === user?.uid ? styles.myMessageText : styles.messageText}>
                                                {msg.content}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                ))
                            )}
                        </View>
                    ) : (
                        <View style={styles.teamingContainer}>
                            <View style={styles.sectionHeader}>
                                <Text style={styles.sectionTitle}>Partners Wanted</Text>
                                <TouchableOpacity
                                    style={styles.writeButton}
                                    onPress={() => setIsTeamingModalVisible(true)}
                                >
                                    <Plus size={16} color="#fff" />
                                    <Text style={styles.writeButtonText}>New Post</Text>
                                </TouchableOpacity>
                            </View>

                            {teamingLoading ? (
                                <ActivityIndicator style={{ marginTop: 20 }} color="#4B0082" />
                            ) : teamingRequests.length === 0 ? (
                                <View style={styles.emptyContainer}>
                                    <Users size={48} color="#D1D5DB" />
                                    <Text style={styles.emptyText}>No teaming posts yet. Be the first!</Text>
                                </View>
                            ) : (
                                teamingRequests.map(item => (
                                    <View key={item.id} style={{ marginBottom: 16 }}>
                                        {renderTeamingItem({ item })}
                                    </View>
                                ))
                            )}
                        </View>
                    )}
                </ScrollView>

                {
                    activeTab === 'chat' && (
                        <KeyboardAvoidingView
                            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                            keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
                        >
                            <View style={styles.inputBar}>
                                <TextInput
                                    style={styles.chatInput}
                                    placeholder="Group chat with classmates..."
                                    value={newMessage}
                                    onChangeText={setNewMessage}
                                    multiline
                                />
                                <TouchableOpacity style={styles.sendButton} onPress={handleSendMessage}>
                                    <Send size={20} color="#fff" />
                                </TouchableOpacity>
                            </View>
                        </KeyboardAvoidingView>
                    )
                }
            </View >

            {/* Write Review Modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={modalVisible}
                onRequestClose={() => setModalVisible(false)}
            >
                <View style={{ flex: 1 }}>
                    <Pressable
                        style={[styles.modalOverlay, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }]}
                        onPress={() => setModalVisible(false)}
                    />
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
                        style={{ flex: 1, justifyContent: 'flex-end' }}
                        pointerEvents="box-none"
                    >
                        <View style={[styles.modalContent, { maxHeight: '90%' }]}>
                            <ScrollView
                                bounces={false}
                                showsVerticalScrollIndicator={false}
                                contentContainerStyle={{ paddingBottom: 100 }}
                                keyboardDismissMode="interactive"
                                keyboardShouldPersistTaps="handled"
                            >
                                <TouchableOpacity activeOpacity={1}>
                                    <View style={styles.modalHeader}>
                                        <Text style={styles.modalTitle}>{hasReviewed ? 'Course Update' : 'Rate Course'}</Text>
                                        <TouchableOpacity onPress={() => setModalVisible(false)}>
                                            <X size={24} color="#000" />
                                        </TouchableOpacity>
                                    </View>

                                    {hasReviewed && (
                                        <View style={styles.hintBox}>
                                            <MessageCircle size={16} color="#4B0082" />
                                            <Text style={styles.hintText}>
                                                Posting an update? Stars are optional. For chat, use the <Text style={{ fontWeight: 'bold' }}>Chatroom</Text> tab!
                                            </Text>
                                        </View>
                                    )}

                                    {/* Rating Stars */}
                                    <Text style={styles.label}>Overall Rating {hasReviewed && '(Optional)'}</Text>
                                    <View style={styles.starsContainer}>
                                        {[1, 2, 3, 4, 5].map((star) => (
                                            <TouchableOpacity key={star} onPress={() => setRating(star)}>
                                                <Star
                                                    size={32}
                                                    color={rating >= star ? "#F59E0B" : "#E5E7EB"}
                                                    fill={rating >= star ? "#F59E0B" : "transparent"}
                                                />
                                            </TouchableOpacity>
                                        ))}
                                    </View>

                                    {/* Difficulty */}
                                    <Text style={styles.label}>Difficulty (1=Easy, 5=Hard)</Text>
                                    <View style={styles.starsContainer}>
                                        {[1, 2, 3, 4, 5].map((level) => (
                                            <TouchableOpacity
                                                key={level}
                                                style={[
                                                    styles.diffButton,
                                                    difficulty === level && styles.diffButtonActive
                                                ]}
                                                onPress={() => setDifficulty(level)}
                                            >
                                                <Text style={[
                                                    styles.diffText,
                                                    difficulty === level && styles.diffTextActive
                                                ]}>{level}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>

                                    {/* Comment */}
                                    <Text style={styles.label}>{hasReviewed ? 'Update Details' : 'Comments'}</Text>
                                    <TextInput
                                        style={styles.input}
                                        multiline
                                        numberOfLines={4}
                                        placeholder={hasReviewed ? "How's the course going now?" : "Share your experience..."}
                                        value={reviewContent}
                                        onChangeText={setReviewContent}
                                        textAlignVertical="top"
                                    />

                                    {/* Anonymous Option */}
                                    <TouchableOpacity 
                                        style={styles.anonymousToggle}
                                        onPress={() => setIsAnonymous(!isAnonymous)}
                                        activeOpacity={0.7}
                                    >
                                        <View style={[
                                            styles.checkbox,
                                            isAnonymous && styles.checkboxActive
                                        ]}>
                                            {isAnonymous && (
                                                <Check size={16} color="#fff" />
                                            )}
                                        </View>
                                        <Text style={styles.anonymousText}>Post anonymously</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity style={styles.submitButton} onPress={handleAddReview}>
                                        <Text style={styles.submitText}>{hasReviewed ? 'Post Update' : 'Submit Review'}</Text>
                                    </TouchableOpacity>
                                </TouchableOpacity>
                            </ScrollView>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* Post Teaming Modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={isTeamingModalVisible}
                onRequestClose={() => setIsTeamingModalVisible(false)}
            >
                <View style={{ flex: 1 }}>
                    <Pressable
                        style={[styles.modalOverlay, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }]}
                        onPress={() => setIsTeamingModalVisible(false)}
                    />
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
                        style={{ flex: 1, justifyContent: 'flex-end' }}
                        pointerEvents="box-none"
                    >
                        <View style={[styles.modalContent, { maxHeight: '95%' }]}>
                            <ScrollView
                                bounces={false}
                                showsVerticalScrollIndicator={false}
                                contentContainerStyle={{ paddingBottom: 100 }}
                                keyboardDismissMode="interactive"
                                keyboardShouldPersistTaps="handled"
                            >
                                <TouchableOpacity activeOpacity={1}>
                                    <View style={styles.modalHeader}>
                                        <View>
                                            <Text style={styles.modalTitle}>Find Partners</Text>
                                            <Text style={styles.modalSubtitle}>{course?.code}</Text>
                                        </View>
                                        <TouchableOpacity onPress={() => setIsTeamingModalVisible(false)}>
                                            <X size={24} color="#000" />
                                        </TouchableOpacity>
                                    </View>

                                    <View style={styles.hintBox}>
                                        <Info size={16} color="#4B0082" />
                                        <Text style={styles.hintText}>
                                            Finding group mates for projects? Share your info here!
                                        </Text>
                                    </View>

                                    <Text style={styles.label}>Which Section? (Required)</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="e.g. Sec1, Sec2..."
                                        value={teamingSection}
                                        onChangeText={setTeamingSection}
                                    />

                                    <Text style={styles.label}>Self Introduction (Optional)</Text>
                                    <TextInput
                                        style={[styles.input, { height: 80 }]}
                                        multiline
                                        placeholder="Proficient in Python? Good at UX?"
                                        value={teamingSelfIntro}
                                        onChangeText={setTeamingSelfIntro}
                                        textAlignVertical="top"
                                    />

                                    <Text style={styles.label}>Looking for? (Optional)</Text>
                                    <TextInput
                                        style={[styles.input, { height: 80 }]}
                                        multiline
                                        placeholder="A frontend dev? A team leader?"
                                        value={teamingTarget}
                                        onChangeText={setTeamingTarget}
                                        textAlignVertical="top"
                                    />

                                    <Text style={styles.label}>Contact Methods (Required)</Text>
                                    <View style={styles.chipContainer}>
                                        {CONTACT_PLATFORMS.map((platform) => (
                                            <TouchableOpacity
                                                key={platform.value}
                                                style={[
                                                    styles.chip,
                                                    selectedTeamingMethods.includes(platform.value) && styles.chipActive
                                                ]}
                                                onPress={() => toggleTeamingMethod(platform.value)}
                                            >
                                                <Text style={[
                                                    styles.chipText,
                                                    selectedTeamingMethods.includes(platform.value) && styles.chipTextActive
                                                ]}>
                                                    {platform.icon} {platform.label}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>

                                    {selectedTeamingMethods.map(platform => (
                                        <View key={platform} style={styles.dynamicInputContainer}>
                                            <Text style={styles.dynamicLabel}>
                                                {platform === 'Other' ? (teamingOtherPlatformName || 'Platform') : platform} ID
                                            </Text>

                                            {platform === 'Other' && (
                                                <TextInput
                                                    style={[styles.input, { marginBottom: 12 }]}
                                                    placeholder="Platform Name (e.g. Discord)"
                                                    value={teamingOtherPlatformName}
                                                    onChangeText={setTeamingOtherPlatformName}
                                                />
                                            )}

                                            <TextInput
                                                style={styles.input}
                                                placeholder={`Enter ID`}
                                                value={teamingContactValues[platform] || ''}
                                                onChangeText={(text) => setTeamingContactValues(prev => ({ ...prev, [platform]: text }))}
                                            />
                                        </View>
                                    ))}

                                    <TouchableOpacity
                                        style={[styles.submitButton, teamingSubmitting && { opacity: 0.7 }]}
                                        onPress={handlePostTeaming}
                                        disabled={teamingSubmitting}
                                    >
                                        {teamingSubmitting ? (
                                            <ActivityIndicator color="#fff" />
                                        ) : (
                                            <Text style={styles.submitText}>Post Request</Text>
                                        )}
                                    </TouchableOpacity>
                                </TouchableOpacity>
                            </ScrollView>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* Teaming Contact Detail Modal */}
            <Modal
                animationType="fade"
                transparent={true}
                visible={!!selectedTeamingContact}
                onRequestClose={() => setSelectedTeamingContact(null)}
            >
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Pressable
                        style={[styles.modalOverlay, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }]}
                        onPress={() => setSelectedTeamingContact(null)}
                    />
                    <View style={[styles.modalContent, {
                        width: '85%',
                        maxHeight: '70%',
                        borderRadius: 24,
                        paddingBottom: 20
                    }]}>
                        <View style={styles.modalHeader}>
                            <View>
                                <Text style={styles.modalTitle}>Contact Teammate</Text>
                                <Text style={styles.modalSubtitle}>{selectedTeamingContact?.userName}</Text>
                            </View>
                            <TouchableOpacity onPress={() => setSelectedTeamingContact(null)}>
                                <X size={24} color="#000" />
                            </TouchableOpacity>
                        </View>

                        <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
                            <Text style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>Click to copy the ID</Text>
                            {selectedTeamingContact?.contacts.map((contact, idx) => (
                                <TouchableOpacity
                                    key={idx}
                                    style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        backgroundColor: '#F3F4F6',
                                        padding: 16,
                                        borderRadius: 16,
                                        marginBottom: 12
                                    }}
                                    onPress={() => {
                                        Clipboard.setStringAsync(contact.value);
                                        const platform = contact.platform === 'Other' && contact.otherPlatformName
                                            ? contact.otherPlatformName
                                            : contact.platform;
                                        Alert.alert('Copied', `${platform} ID copied!`);
                                    }}
                                >
                                    <View style={{
                                        width: 40,
                                        height: 40,
                                        borderRadius: 20,
                                        backgroundColor: '#fff',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        marginRight: 12
                                    }}>
                                        <Text style={{ fontSize: 18 }}>
                                            {CONTACT_PLATFORMS.find(p => p.value === contact.platform)?.icon || '🔗'}
                                        </Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase' }}>
                                            {contact.platform === 'Other' && contact.otherPlatformName ? contact.otherPlatformName : contact.platform}
                                        </Text>
                                        <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827' }}>{contact.value}</Text>
                                    </View>
                                    <View style={{ backgroundColor: '#EEF2FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                                        <Text style={{ color: '#4F46E5', fontSize: 12, fontWeight: '600' }}>Copy</Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Teaming Comment Modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={isTeamingCommentModalVisible}
                onRequestClose={() => setIsTeamingCommentModalVisible(false)}
            >
                <View style={{ flex: 1 }}>
                    <Pressable
                        style={[styles.modalOverlay, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }]}
                        onPress={() => setIsTeamingCommentModalVisible(false)}
                    />
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                        style={{ flex: 1, justifyContent: 'flex-end' }}
                        pointerEvents="box-none"
                    >
                        <View style={[styles.modalContent, { maxHeight: '80%' }]}>
                            <View style={styles.modalHeader}>
                                <View>
                                    <Text style={styles.modalTitle}>Comments</Text>
                                    <Text style={styles.modalSubtitle}>Teaming Request</Text>
                                </View>
                                <TouchableOpacity onPress={() => setIsTeamingCommentModalVisible(false)}>
                                    <X size={24} color="#000" />
                                </TouchableOpacity>
                            </View>

                            {teamingCommentLoading ? (
                                <ActivityIndicator style={{ padding: 40 }} color="#4B0082" />
                            ) : (
                                <FlatList
                                    data={organizedTeamingComments}
                                    keyExtractor={(item) => item.id}
                                    renderItem={({ item }) => (
                                        <Animated.View style={[styles.teamingCommentContainer, ugcActions.getHighlightStyle(item.id)]}>
                                            <View style={styles.teamingCommentRow}>
                                                {isImageUrl(item.authorAvatar) ? (
                                                    <Image
                                                        source={{ uri: item.authorAvatar }}
                                                        style={styles.teamingCommentAvatar}
                                                    />
                                                ) : (
                                                    <Text style={styles.teamingCommentAvatarEmoji}>{item.authorAvatar || '👤'}</Text>
                                                )}
                                                <TouchableOpacity
                                                    style={styles.teamingCommentInfo}
                                                    activeOpacity={0.95}
                                                    onLongPress={() => ugcActions.openActions({
                                                        id: item.id,
                                                        targetId: item.id,
                                                        targetType: 'comment',
                                                        content: item.content,
                                                        authorId: item.authorId,
                                                        authorName: item.authorName,
                                                    })}
                                                >
                                                    <View style={styles.teamingCommentHeader}>
                                                        <View style={styles.commentAuthorRow}>
                                                            <Text style={styles.commentAuthorName}>{item.authorName}</Text>
                                                            <EduBadge shouldShow={isHKBUEmail(item.authorEmail)} size="small" />
                                                        </View>
                                                        <TouchableOpacity onPress={() => {
                                                            setTeamingReplyTarget(item);
                                                            setTimeout(() => teamingCommentInputRef.current?.focus(), 100);
                                                        }}>
                                                            <Text style={styles.teamingReplyBtn}>{t('forum.row.replies')}</Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                    <TranslatableText style={styles.teamingCommentText} text={item.content} />
                                                    <Text style={styles.teamingCommentTime}>
                                                        {new Date(item.createdAt).toLocaleString()}
                                                    </Text>
                                                </TouchableOpacity>
                                            </View>

                                            {/* Replies */}
                                            {item.replies && item.replies.length > 0 && (
                                                <View style={styles.teamingNestedReplies}>
                                                    {item.replies.map((reply: TeamingComment) => (
                                                        <Animated.View key={reply.id} style={[styles.teamingCommentRowSmall, ugcActions.getHighlightStyle(reply.id)]}>
                                                            {isImageUrl(reply.authorAvatar) ? (
                                                                <Image
                                                                    source={{ uri: reply.authorAvatar }}
                                                                    style={styles.teamingCommentAvatarSmall}
                                                                />
                                                            ) : (
                                                                <Text style={styles.teamingCommentAvatarEmojiSmall}>{reply.authorAvatar || '👤'}</Text>
                                                            )}
                                                            <TouchableOpacity
                                                                style={styles.teamingCommentInfoSmall}
                                                                activeOpacity={0.95}
                                                                onLongPress={() => ugcActions.openActions({
                                                                    id: reply.id,
                                                                    targetId: reply.id,
                                                                    targetType: 'comment',
                                                                    content: reply.content,
                                                                    authorId: reply.authorId,
                                                                    authorName: reply.authorName,
                                                                })}
                                                            >
                                                                <View style={styles.teamingCommentHeader}>
                                                                    <View style={styles.commentAuthorRow}>
                                                                        <Text style={styles.commentAuthorName}>{reply.authorName}</Text>
                                                                        {reply.replyToName && (
                                                                            <Text style={styles.replyIndicator}> ▶ {reply.replyToName}</Text>
                                                                        )}
                                                                    </View>
                                                                    <TouchableOpacity onPress={() => {
                                                                        setTeamingReplyTarget(reply);
                                                                        setTimeout(() => teamingCommentInputRef.current?.focus(), 100);
                                                                    }}>
                                                                        <Text style={styles.teamingReplyBtnSmall}>{t('forum.row.replies')}</Text>
                                                                    </TouchableOpacity>
                                                                </View>
                                                                <TranslatableText style={styles.teamingCommentTextSmall} text={reply.content} />
                                                                <Text style={styles.teamingCommentTimeSmall}>
                                                                    {new Date(reply.createdAt).toLocaleString()}
                                                                </Text>
                                                            </TouchableOpacity>
                                                        </Animated.View>
                                                    ))}
                                                </View>
                                            )}
                                        </Animated.View>
                                    )}
                                    contentContainerStyle={{ paddingBottom: 20 }}
                                    ListEmptyComponent={
                                        <View style={{ alignItems: 'center', padding: 40 }}>
                                            <MessageSquare size={48} color="#E5E7EB" />
                                            <Text style={{ color: '#9CA3AF', marginTop: 12 }}>No comments yet. Start the conversation!</Text>
                                        </View>
                                    }
                                />
                            )}

                            {teamingReplyTarget && (
                                <View style={styles.teamingReplyBar}>
                                    <Text style={styles.teamingReplyBarText} numberOfLines={1}>
                                        {t('forum.detail.replying_to', { name: teamingReplyTarget.authorName })}: {teamingReplyTarget.content}
                                    </Text>
                                    <TouchableOpacity onPress={() => setTeamingReplyTarget(null)}>
                                        <X size={16} color="#4B0082" />
                                    </TouchableOpacity>
                                </View>
                            )}
                            <View style={{
                                flexDirection: 'row',
                                padding: 16,
                                borderTopWidth: 1,
                                borderTopColor: '#F3F4F6',
                                backgroundColor: '#fff',
                                alignItems: 'center',
                                paddingBottom: Platform.OS === 'ios' ? 32 : 16
                            }}>
                                <TextInput
                                    ref={teamingCommentInputRef}
                                    style={{
                                        flex: 1,
                                        backgroundColor: '#F3F4F6',
                                        borderRadius: 20,
                                        paddingHorizontal: 16,
                                        paddingVertical: 8,
                                        marginRight: 12,
                                        maxHeight: 100
                                    }}
                                    placeholder={teamingReplyTarget ? t('forum.detail.replying_to', { name: teamingReplyTarget.authorName }) : "Add a comment..."}
                                    placeholderTextColor="#9CA3AF"
                                    value={newTeamingComment}
                                    onChangeText={setNewTeamingComment}
                                    multiline
                                />
                                <TouchableOpacity
                                    style={{
                                        width: 40,
                                        height: 40,
                                        borderRadius: 20,
                                        backgroundColor: newTeamingComment.trim() ? '#4B0082' : '#E5E7EB',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                    onPress={handleSendTeamingComment}
                                    disabled={!newTeamingComment.trim()}
                                >
                                    <Send size={20} color="#fff" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>
            {ugcActions.ActionSheet}
        </View >
    );
}

const CONTACT_PLATFORMS = [
    { label: 'WeChat', value: 'WeChat', icon: '💬' },
    { label: 'WhatsApp', value: 'WhatsApp', icon: '📱' },
    { label: 'Email', value: 'Email', icon: '📧' },
    { label: 'TG', value: 'Telegram', icon: '✈️' },
    { label: 'Other', value: 'Other', icon: '🔗' },
] as const;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 56,
        paddingBottom: 24,
        paddingHorizontal: 20,
        backgroundColor: '#1E3A8A',
    },
    backButton: { padding: 4 },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
    scrollContent: { paddingTop: 10, paddingBottom: 40 },
    courseInfoCard: {
        backgroundColor: '#fff',
        margin: 20,
        marginTop: 10,
        borderRadius: 20,
        overflow: 'hidden',
        shadowColor: '#1E3A8A',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.15,
        shadowRadius: 14,
        elevation: 7,
    },
    // ⑨ Gradient header inside card
    courseInfoGradient: {
        paddingHorizontal: 24,
        paddingTop: 24,
        paddingBottom: 20,
        alignItems: 'center',
    },
    codeBadgeWhite: {
        backgroundColor: 'rgba(255,255,255,0.22)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 10,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.35)',
    },
    codeTextWhite: { color: '#fff', fontWeight: '800', fontSize: 14, letterSpacing: 0.5 },
    courseNameWhite: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff',
        textAlign: 'center',
        lineHeight: 26,
    },
    // Keep old codeBadge for backward-compat (unused but safe)
    codeBadge: {
        backgroundColor: '#F3E8FF',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        marginBottom: 12,
    },
    codeText: { color: '#4B0082', fontWeight: 'bold', fontSize: 14 },
    courseName: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#111827',
        textAlign: 'center',
        marginBottom: 8,
    },
    instructor: { fontSize: 14, color: '#6B7280', marginBottom: 24 },
    statsRowPadded: {
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
        justifyContent: 'space-around',
        paddingVertical: 16,
        paddingHorizontal: 8,
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        width: '100%',
        justifyContent: 'space-around',
    },
    statItem: { alignItems: 'center' },
    statValue: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginTop: 4 },
    statLabel: { fontSize: 12, color: '#6B7280' },
    divider: { width: 1, height: 30, backgroundColor: '#E5E7EB' },

    // Tabs
    tabBar: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        marginBottom: 20,
        gap: 8,
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        paddingHorizontal: 4,
        borderRadius: 12,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        position: 'relative',
    },
    activeTab: {
        backgroundColor: '#F3E8FF',
        borderColor: '#4B0082',
    },
    tabText: {
        marginLeft: 4,
        fontSize: 13,
        fontWeight: '600',
        color: '#6B7280',
    },
    activeTabText: { color: '#4B0082' },
    tabUnreadDot: {
        position: 'absolute',
        top: 8,
        right: 10,
        width: 8,
        height: 8,
        borderRadius: 999,
        backgroundColor: '#EF4444',
    },

    // Reviews
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        marginBottom: 16,
    },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
    writeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1E3A8A',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
    },
    writeButtonText: { color: '#fff', fontSize: 12, fontWeight: '600', marginLeft: 4 },
    reviewCard: {
        backgroundColor: '#FAFBFF',
        marginHorizontal: 20,
        marginBottom: 16,
        borderRadius: 16,
        padding: 16,
        // ⑧ Left rating color bar
        borderLeftWidth: 4,
        shadowColor: '#1E3A8A',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
        elevation: 3,
    },
    reviewHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    authorInfo: { flexDirection: 'row', alignItems: 'center' },
    avatarContainer: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
        overflow: 'hidden',
    },
    avatarImage: {
        width: '100%',
        height: '100%',
    },
    avatarFallbackText: {
        fontSize: 18,
    },
    authorName: { fontSize: 14, fontWeight: '600', color: '#111827', marginRight: 6 },
    nameRow: { flexDirection: 'row', alignItems: 'center' },
    semester: { fontSize: 11, color: '#9CA3AF' },
    reviewRating: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFBEB',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    ratingValue: { color: '#D97706', fontWeight: 'bold', marginLeft: 4, fontSize: 12 },
    tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12, gap: 8 },
    tag: { backgroundColor: '#F3F4F6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    difficultyTag: { backgroundColor: '#FEF2F2' },
    tagText: { fontSize: 11, color: '#4B5563' },
    reviewContent: { fontSize: 14, color: '#374151', lineHeight: 20, marginBottom: 12 },
    reviewFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: '#F9FAFB',
        paddingTop: 12,
    },
    date: { fontSize: 11, color: '#9CA3AF' },
    reviewActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    likeButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    likeCount: { fontSize: 12, color: '#6B7280' },
    deleteTag: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#FCA5A5',
        backgroundColor: '#FEF2F2',
    },

    // Sorting
    sortContainer: { flexDirection: 'row', gap: 12, marginBottom: 16, paddingHorizontal: 20 },
    sortButton: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, backgroundColor: '#F3F4F6' },
    sortButtonActive: { backgroundColor: '#4B0082' },
    sortText: { fontSize: 12, color: '#6B7280', fontWeight: '500' },
    sortTextActive: { color: '#fff' },

    // Chat
    chatContainer: { paddingHorizontal: 20, paddingBottom: 20 },
    messageRow: { flexDirection: 'row', marginBottom: 16, alignItems: 'flex-end' },
    myMessageRow: { justifyContent: 'flex-end' },
    otherMessageRow: { justifyContent: 'flex-start' },
    chatAvatarImage: {
        width: 28,
        height: 28,
        borderRadius: 14,
        marginRight: 8,
        marginBottom: 4,
        backgroundColor: '#E5E7EB',
    },
    chatAvatarFallback: {
        width: 28,
        height: 28,
        borderRadius: 14,
        marginRight: 8,
        marginBottom: 4,
        backgroundColor: '#E5E7EB',
        alignItems: 'center',
        justifyContent: 'center',
    },
    chatAvatarFallbackText: {
        fontSize: 14,
    },
    messageBubble: { maxWidth: '80%', padding: 12, borderRadius: 16 },
    myBubble: { backgroundColor: '#4B0082', borderBottomRightRadius: 4 },
    otherBubble: { backgroundColor: '#fff', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#E5E7EB' },
    messageAuthor: { fontSize: 10, color: '#9CA3AF', marginBottom: 4, marginRight: 6 },
    myMessageAuthor: { fontSize: 10, color: 'rgba(255,255,255,0.7)', marginBottom: 4, marginRight: 6 },
    messageAuthorRow: { flexDirection: 'row', alignItems: 'center' },
    chatEduStarBadge: {
        height: 13,
        paddingHorizontal: 4,
        borderRadius: 7,
        borderWidth: 1,
        borderColor: '#F59E0B',
        backgroundColor: 'rgba(245,158,11,0.12)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
    },
    chatEduStarText: {
        fontSize: 9,
        color: '#F59E0B',
        fontWeight: '700',
        lineHeight: 10,
    },
    messageText: { fontSize: 14, color: '#374151' },
    myMessageText: { fontSize: 14, color: '#fff' },
    inputBar: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        paddingBottom: Platform.OS === 'ios' ? 32 : 16,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
    },
    chatInput: {
        flex: 1,
        backgroundColor: '#F3F4F6',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 8,
        marginRight: 12,
        maxHeight: 100,
    },
    sendButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#1E3A8A',
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        paddingBottom: 40,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#111827' },
    label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 12 },
    starsContainer: { flexDirection: 'row', gap: 16, marginBottom: 24 },
    diffButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    diffButtonActive: { backgroundColor: '#4B0082' },
    diffText: { color: '#6B7280', fontWeight: '600' },
    diffTextActive: { color: '#fff' },
    input: {
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        padding: 16,
        minHeight: 120,
        marginBottom: 24,
        fontSize: 15,
    },
    submitButton: {
        backgroundColor: '#1E3A8A',
        borderRadius: 16,
        paddingVertical: 16,
        alignItems: 'center',
    },
    submitText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

    // Anonymous Option
    anonymousToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
        paddingVertical: 8,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: '#D1D5DB',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    checkboxActive: {
        backgroundColor: '#4B0082',
        borderColor: '#4B0082',
    },
    anonymousText: {
        fontSize: 15,
        fontWeight: '500',
        color: '#374151',
    },

    // Teaming Styles
    teamingCard: {
        backgroundColor: '#fff',
        marginHorizontal: 20,
        marginBottom: 16,
        borderRadius: 20,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 3,
        borderWidth: 1,
        borderColor: '#F3F4F6',
    },
    teamingHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    userMajor: {
        fontSize: 11,
        color: '#9CA3AF',
        marginTop: 2,
    },
    sectionBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 10,
        gap: 6,
    },
    sectionBadgeText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#4F46E5',
    },
    teamingDetailBox: {
        backgroundColor: '#F8FAFC',
        padding: 12,
        borderRadius: 12,
        marginBottom: 10,
    },
    detailTitle: {
        fontSize: 11,
        fontWeight: '800',
        color: '#64748B',
        textTransform: 'uppercase',
        marginBottom: 4,
        letterSpacing: 0.5,
    },
    detailBody: {
        fontSize: 13,
        color: '#334155',
        lineHeight: 18,
    },
    teamingFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 6,
        borderTopWidth: 1,
        borderTopColor: '#F8FAFC',
        paddingTop: 12,
    },
    teamingStats: {
        flexDirection: 'row',
        gap: 16,
    },
    teamingStatItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    teamingStatText: {
        fontSize: 12,
        color: '#6B7280',
        fontWeight: '600',
    },
    contactIconBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#4B0082',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 10,
        gap: 6,
    },
    contactIconBtnText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '700',
    },
    teamingRightActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    teamingContainer: {
        flex: 1,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
        gap: 12,
    },
    emptyText: {
        fontSize: 14,
        color: '#9CA3AF',
        fontWeight: '500',
    },
    modalSubtitle: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 2,
    },
    commentAuthorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        marginRight: 8,
    },
    commentAuthorName: {
        fontWeight: '700',
        color: '#111827',
        marginRight: 6,
    },
    chipContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 16,
    },
    chip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        backgroundColor: '#F3F4F6',
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    chipActive: {
        backgroundColor: '#F3E8FF',
        borderColor: '#4B0082',
    },
    chipText: {
        fontSize: 12,
        color: '#6B7280',
    },
    chipTextActive: {
        color: '#4B0082',
        fontWeight: '600',
    },
    dynamicInputContainer: {
        marginBottom: 16,
    },
    dynamicLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: '#374151',
        marginBottom: 8,
    },
    hintBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F3E8FF',
        padding: 12,
        borderRadius: 12,
        marginBottom: 20,
        gap: 10,
    },
    hintText: {
        flex: 1,
        fontSize: 12,
        color: '#4B0082',
        lineHeight: 18,
    },
    teamingCommentContainer: {
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
        paddingVertical: 12,
    },
    teamingCommentRow: {
        flexDirection: 'row',
        paddingHorizontal: 16,
    },
    teamingCommentRowSmall: {
        flexDirection: 'row',
        marginBottom: 12,
    },
    teamingCommentAvatar: {
        width: 36, height: 36, borderRadius: 18, marginRight: 12
    },
    teamingCommentAvatarEmoji: {
        fontSize: 24, marginRight: 12
    },
    teamingCommentAvatarSmall: {
        width: 28, height: 28, borderRadius: 14, marginRight: 10
    },
    teamingCommentAvatarEmojiSmall: {
        fontSize: 20, marginRight: 10
    },
    teamingCommentInfo: {
        flex: 1,
    },
    teamingCommentInfoSmall: {
        flex: 1,
        backgroundColor: '#F9FAFB',
        padding: 10,
        borderRadius: 14,
    },
    teamingCommentHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    teamingCommentText: {
        color: '#374151', fontSize: 14, lineHeight: 20
    },
    teamingCommentTextSmall: {
        color: '#4B5563', fontSize: 13, lineHeight: 18
    },
    teamingCommentTime: {
        fontSize: 11, color: '#9CA3AF', marginTop: 4
    },
    teamingCommentTimeSmall: {
        fontSize: 10, color: '#9CA3AF', marginTop: 2
    },
    teamingReplyBtn: {
        fontSize: 12, color: '#4B0082', fontWeight: '700'
    },
    teamingReplyBtnSmall: {
        fontSize: 11, color: '#4B0082', fontWeight: '700'
    },
    teamingNestedReplies: {
        marginLeft: 64,
        marginTop: 12,
        paddingHorizontal: 0,
    },
    teamingReplyBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#F3E8FF',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderTopWidth: 1,
        borderTopColor: '#E9D5FF',
    },
    teamingReplyBarText: {
        fontSize: 12, color: '#4B0082', flex: 1, marginRight: 10
    },
    replyIndicator: {
        fontSize: 12, color: '#9CA3AF', marginLeft: 4
    },
});
