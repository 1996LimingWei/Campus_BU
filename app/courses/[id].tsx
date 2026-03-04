import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Info, MessageCircle, MessageSquare, Plus, Send, Star, Tag, ThumbsUp, UserPlus, Users, X } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
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
import storage from '../../lib/storage';
import { getCurrentUser } from '../../services/auth';
import { addReview, getCourseById, getReviews, hasUserReviewed, likeReview } from '../../services/courses';
import { supabase } from '../../services/supabase';
import { fetchTeamingComments, fetchTeamingRequests, postTeamingComment, postTeamingRequest, toggleTeamingLike } from '../../services/teaming';
import { ContactMethod, Course, CourseTeaming, Review, TeamingComment } from '../../types';
import { isHKBUEmail } from '../../utils/userUtils';
// Helper function to check if string is a URL
const isImageUrl = (str: string): boolean => {
    if (!str) return false;
    return str.startsWith('http://') || str.startsWith('https://');
};

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
    const router = useRouter();
    const { id } = useLocalSearchParams();
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

    const roomId = `course_${id}`;

    useEffect(() => {
        loadData();
        setupRealtime();
        return () => {
            supabase.channel(roomId).unsubscribe();
        };
    }, [id]);

    const loadData = async () => {
        const currentUser = await getCurrentUser();
        setUser(currentUser);

        // Load liked reviews from local storage (for all course types)
        try {
            const likedStr = await storage.getItem('hkcampus_liked_reviews');
        } catch (e) {
            console.error('Error loading liked reviews:', e);
        }

        const courseData = await getCourseById(id as string);
        if (courseData) {
            setCourse(courseData);
        } else {
            console.warn('Course not found for ID:', id);
        }

        // Load existing messages
        const { data } = await supabase
            .from('messages')
            .select('*, users(display_name, avatar_url, email)')
            .eq('course_id', id as string)
            .order('created_at', { ascending: true });

        if (data) setMessages(data);

        // Load reviews only if ID is a valid UUID or local_
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        const isMockId = id === '1';
        const isLocalId = (id as string).startsWith('local_');
        const isDbId = uuidRegex.test(id as string);

        if (isDbId || isLocalId) {
            const reviewsData = await getReviews(id as string);
            setReviews(reviewsData);

            if (currentUser) {
                const reviewed = await hasUserReviewed(id as string, currentUser.uid);
                setHasReviewed(reviewed);
            }
        } else if (isMockId) {
            setReviews(MOCK_REVIEWS);
        }

        loadTeaming();
    };

    const loadTeaming = async () => {
        setTeamingLoading(true);
        const data = await fetchTeamingRequests(id as string);
        setTeamingRequests(data);
        setTeamingLoading(false);
    };

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
                    users: userData
                };

                setMessages(prev => {
                    // Prevent duplicates if optimistic update already added it
                    if (prev.find(m => m.id === payload.new.id)) return prev;
                    return [...prev, messageWithUser];
                });
            })
            .subscribe();
    };

    const handleSendMessage = async () => {
        if (!newMessage.trim() || !user) return;

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
        }
    };

    const handleAddReview = async () => {
        if (!user) {
            Alert.alert('Error', 'You must be logged in to post a review');
            return;
        }

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
            authorName: user.displayName || 'Anonymous',
            authorAvatar: user.avatarUrl || '👤',
            rating: rating > 0 ? rating : undefined,
            difficulty: difficulty > 0 ? difficulty : 3,
            content: reviewContent.trim(),
            semester: '2025 Spring'
        };

        const { error } = await addReview(reviewData);

        if (error) {
            Alert.alert('Error', `Failed to post review: ${error.message || 'Unknown error'}`);
            console.error('Add review UI error:', error);
        } else {
            // Optimistic update for reviews
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

            setModalVisible(false);
            setRating(0);
            setDifficulty(0);
            setReviewContent('');
            loadData(); // Still reload to get official data/stats
            Alert.alert('Success', 'Evaluation posted successfully!');
        }
    };

    const handleLike = async (reviewId: string) => {
        if (!user) {
            Alert.alert('Error', 'You must be logged in to like a review');
            return;
        }

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

    const handlePostTeaming = async () => {
        if (!user) {
            Alert.alert('Error', 'Please login first');
            return;
        }
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
        if (!user) {
            Alert.alert('Error', 'Please login first');
            return;
        }

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
        if (!user || !selectedTeamingForComments || !newTeamingComment.trim()) return;

        const { success, error } = await postTeamingComment(selectedTeamingForComments.id, user, newTeamingComment.trim());
        if (success) {
            setNewTeamingComment('');
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

    const renderReviewItem = ({ item }: { item: Review }) => (
        <View style={styles.reviewCard}>
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
                <View style={styles.reviewRating}>
                    {item.rating ? (
                        <>
                            <Star size={14} color="#F59E0B" fill="#F59E0B" />
                            <Text style={styles.ratingValue}>{item.rating}.0</Text>
                        </>
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

            <Text style={styles.reviewContent}>{item.content}</Text>

            <View style={styles.reviewFooter}>
                <Text style={styles.date}>{item.createdAt.toLocaleDateString()}</Text>
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
            </View>
        </View>
    );

    const renderTeamingItem = ({ item }: { item: CourseTeaming }) => (
        <View style={styles.teamingCard}>
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
                    <Text style={styles.detailBody}>{item.selfIntro}</Text>
                </View>
            )}

            {item.targetTeammate && (
                <View style={[styles.teamingDetailBox, { backgroundColor: '#F0FDF4' }]}>
                    <Text style={[styles.detailTitle, { color: '#166534' }]}>Looking for:</Text>
                    <Text style={[styles.detailBody, { color: '#166534' }]}>{item.targetTeammate}</Text>
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
                <TouchableOpacity
                    style={styles.contactIconBtn}
                    onPress={() => setSelectedTeamingContact(item)}
                >
                    <Send size={14} color="#fff" />
                    <Text style={styles.contactIconBtnText}>Contact</Text>
                </TouchableOpacity>
            </View>
        </View>
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
                    {/* Course Info Card */}
                    <View style={styles.courseInfoCard}>
                        <View style={styles.codeBadge}>
                            <Text style={styles.codeText}>{course.code}</Text>
                        </View>
                        <Text style={styles.courseName}>{course.name}</Text>
                        {/* <Text style={styles.instructor}>Instructor: {course.instructor}</Text> */}
                        <View style={styles.statsRow}>
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
                            <MessageSquare size={18} color={activeTab === 'reviews' ? '#4B0082' : '#6B7280'} />
                            <Text style={[styles.tabText, activeTab === 'reviews' && styles.activeTabText]}>Reviews</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.tab, activeTab === 'chat' && styles.activeTab]}
                            onPress={() => setActiveTab('chat')}
                        >
                            <MessageCircle size={18} color={activeTab === 'chat' ? '#4B0082' : '#6B7280'} />
                            <Text style={[styles.tabText, activeTab === 'chat' && styles.activeTabText]}>Chatroom</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.tab, activeTab === 'teaming' && styles.activeTab]}
                            onPress={() => setActiveTab('teaming')}
                        >
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
                                            <Text style={styles.chatAvatar}>{msg.users?.avatar_url || '👤'}</Text>
                                        )}
                                        <View style={[
                                            styles.messageBubble,
                                            msg.sender_id === user?.uid ? styles.myBubble : styles.otherBubble
                                        ]}>
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
                                        </View>
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
                                    data={teamingComments}
                                    keyExtractor={(item) => item.id}
                                    renderItem={({ item }) => (
                                        <View style={{
                                            flexDirection: 'row',
                                            padding: 16,
                                            borderBottomWidth: 1,
                                            borderBottomColor: '#F3F4F6'
                                        }}>
                                            {isImageUrl(item.authorAvatar) ? (
                                                <Image
                                                    source={{ uri: item.authorAvatar }}
                                                    style={{ width: 36, height: 36, borderRadius: 18, marginRight: 12 }}
                                                />
                                            ) : (
                                                <Text style={{ fontSize: 24, marginRight: 12 }}>{item.authorAvatar || '👤'}</Text>
                                            )}
                                            <View style={{ flex: 1 }}>
                                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                                    <View style={styles.commentAuthorRow}>
                                                        <Text style={styles.commentAuthorName}>{item.authorName}</Text>
                                                        <EduBadge shouldShow={isHKBUEmail(item.authorEmail)} size="small" />
                                                    </View>
                                                    <Text style={{ fontSize: 11, color: '#9CA3AF' }}>
                                                        {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </Text>
                                                </View>
                                                <Text style={{ color: '#374151', fontSize: 14, lineHeight: 20 }}>{item.content}</Text>
                                            </View>
                                        </View>
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
                                    style={{
                                        flex: 1,
                                        backgroundColor: '#F3F4F6',
                                        borderRadius: 20,
                                        paddingHorizontal: 16,
                                        paddingVertical: 8,
                                        marginRight: 12,
                                        maxHeight: 100
                                    }}
                                    placeholder="Add a comment..."
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
        padding: 24,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5,
    },
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
        backgroundColor: '#fff',
        marginHorizontal: 20,
        marginBottom: 16,
        borderRadius: 16,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
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
    likeButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    likeCount: { fontSize: 12, color: '#6B7280' },

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
    chatAvatar: { fontSize: 20, marginRight: 8, marginBottom: 4 },
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
});
