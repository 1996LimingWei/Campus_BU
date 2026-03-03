import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import {
    Camera,
    ChevronLeft,
    Clock,
    Flame,
    Info,
    MapPin,
    MessageCircle,
    Plus,
    Send,
    Star,
    ThumbsUp,
    X
} from 'lucide-react-native';
import React, { useState } from 'react';
import {
    Dimensions,
    Image,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { EduBadge } from '../../components/common/EduBadge';
import { ScreenWrapper } from '../../components/ui/ScreenWrapper';
import { getCurrentUser } from '../../services/auth';
import { addFoodReview, fetchFoodReviews, toggleFoodReviewLike, uploadFoodImage } from '../../services/food';
import { isHKBUEmail } from '../../utils/userUtils';

const { width } = Dimensions.get('window');

interface Review {
    id: string;
    outletId: string;
    authorId: string;
    authorName: string;
    authorAvatar?: string;
    rating: number;
    likes: number;
    isLiked?: boolean;
    content: string;
    createdAt: string;
    replies?: Array<{
        id: string;
        author: string;
        content: string;
        time: string;
    }>;
}

// Re-using the same data structure for now (In a real app, this would come from an API/Database)
const DINING_OUTLETS = [
    {
        id: 'o1',
        title: 'Main Canteen',
        location: 'Level 5, AAB, BUR Campus',
        image: require('../../assets/images/food/Main-Canteen.png'),
        hours: 'Mon - Fri: 07:30 - 20:00, Sat: 08:30 - 17:00',
        orderUrl: 'https://csd2.order.place/store/112867/mode/prekiosk',
        menuUrl: 'https://eo.hkbu.edu.hk/content/dam/eo-assets/our-services/landing/catering-services/maxim%27s/2024%2005%20Catering%20Menu_Main%20Canteen%20(Maxims).pdf',
        category: 'Fast Food',
        status: 'Open'
    },
    {
        id: 'o2',
        title: 'iCafe (Pacific Coffee)',
        location: 'Level 3, WLB Building, Shaw Campus',
        image: require('../../assets/images/food/iCafe.png'),
        hours: 'Mon - Fri: 08:00 - 20:00, Sat: 08:00 - 18:00, Sun: 08:00 - 17:00',
        menuUrl: 'https://www.pacificcoffee.com/FreshCuisine/index.html',
        category: 'Coffee & Snacks',
        status: 'Open'
    },
    {
        id: 'o3',
        title: 'Chapter Coffee @ UG/F',
        location: 'UG/F, Jockey Club Campus of Creativity',
        image: require('../../assets/images/food/Chapter-Coffee@JCCC-UGF-Cafe.png'),
        hours: 'Mon - Fri: 08:00 - 20:00, Sat - Sun: 09:00 - 17:00',
        orderUrl: 'https://app.eats365pos.com/hk/tc/chaptercoffee_kowloontong/menu',
        category: 'Coffee/Bakery',
        status: 'Open'
    },
    {
        id: 'o4',
        title: 'Chapter Coffee @ G/F',
        location: 'G/F, Jockey Club Campus of Creativity',
        image: require('../../assets/images/food/Chapter-Coffee@JCCC-GF-Cafe.png'),
        hours: 'Mon - Fri: 08:00 - 21:30, Sat - Sun: 08:00 - 20:00',
        category: 'Coffee/Bakery',
        status: 'Open'
    },
    {
        id: 'o5',
        title: 'Harmony Cafeteria',
        location: 'Level 4, Sir Run Run Shaw Building, HSH Campus',
        image: require('../../assets/images/food/Harmony-Cafeteria.png'),
        hours: 'Mon - Fri: 07:30 - 19:30, Sat: 08:00 - 17:00',
        orderUrl: 'https://food.order.place/home/store/5768631610769408?mode=prekiosk',
        category: 'Fast Food',
        status: 'Open'
    },
    {
        id: 'o6',
        title: 'Harmony Lounge',
        location: 'Level 4, Sir Run Run Shaw Building, HSH Campus',
        image: require('../../assets/images/food/Harmony-Lounge.png'),
        hours: 'Mon - Fri: 08:00 - 18:00',
        menuUrl: 'https://eo.hkbu.edu.hk/content/dam/eo-assets/our-services/landing/catering-services/the-street-cafe/menu/2025%2009%20menu%20the%20street%20cafe.pdf',
        category: 'Cafe/Lounge',
        status: 'Open'
    },
    {
        id: 'o7',
        title: 'Nan Yuan',
        location: 'Level 2, David C. Lam Building, Shaw Campus',
        image: require('../../assets/images/food/NanYuan.png'),
        hours: 'Mon - Fri: 11:00 - 22:00, Sat - Sun: 10:00 - 22:00',
        category: 'Chinese Cuisine',
        status: 'Open'
    },
    {
        id: 'o8',
        title: 'H.F.C.@Scholars Court',
        location: 'Level 2, David C. Lam Building, Shaw Campus',
        image: require('../../assets/images/food/H.F.C.@Scholars-Court.png'),
        hours: 'Mon - Fri: 08:00 - 18:00',
        category: 'International',
        status: 'Open'
    },
    {
        id: 'o9',
        title: 'Bistro NTT',
        location: 'G/F, NTT International House, BUR Campus',
        image: require('../../assets/images/food/Bistro-NTT.png'),
        hours: 'Mon - Fri: 08:00 - 22:00, Sat - Sun: 12:00 - 22:00',
        category: 'Western',
        status: 'Open'
    },
    {
        id: 'o10',
        title: 'Books n\' Bites',
        location: 'G/F, Jockey Club Academic Community Centre, BUR Campus',
        image: require('../../assets/images/food/Books-n\'-Bites.png'),
        hours: 'Mon - Fri: 09:00 - 19:00',
        category: 'Snacks/Deli',
        status: 'Open'
    },
    {
        id: 'o11',
        title: 'Café@CVA Commons',
        location: 'G/F, CVA Building, BUR Campus',
        image: require('../../assets/images/food/Cafe-CVA-Commons.png'),
        hours: 'Closed until further notice',
        category: 'Cafe/Tea',
        status: 'Closed'
    },
    {
        id: 'o12',
        title: 'Deli',
        location: 'Level 1, CVA Building, BUR Campus',
        image: require('../../assets/images/food/Deli.png'),
        hours: 'Closed until further notice',
        category: 'Snacks/Deli',
        status: 'Closed'
    },
    {
        id: 'o13',
        title: 'BU Fiesta',
        location: 'G/F, Undergraduate Halls, BUR Campus',
        image: require('../../assets/images/food/BU-Fiesta.png'),
        hours: 'Closed for renovation',
        category: 'Asian Cuisine',
        status: 'Closed'
    }
];

// Mock Review Data
const MOCK_REVIEWS = [
    {
        id: 'r1',
        outletId: 'o1',
        author: 'Alice Wong',
        rating: 4,
        content: 'The breakfast set is quite affordable and tastes good!',
        images: ['https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=400'],
        likes: 12,
        time: '2 hours ago',
        timestamp: Date.now() - 7200000,
        replies: [
            { id: 'rep1', author: 'Staff', content: 'Glad you like our breakfast!', time: '1 hour ago' }
        ]
    },
    {
        id: 'r2',
        outletId: 'o1',
        author: 'Bob Chan',
        rating: 5,
        content: 'Best place for a quick lunch between classes.',
        images: [],
        likes: 8,
        time: '5 hours ago',
        timestamp: Date.now() - 18000000,
        replies: []
    },
];

export default function OutletDetailScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const [sortBy, setSortBy] = useState<'newest' | 'popular'>('newest');
    const [reviews, setReviews] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isPostModalVisible, setIsPostModalVisible] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);

    const loadReviews = async () => {
        try {
            setLoading(true);
            const user = await getCurrentUser();
            setCurrentUser(user);
            const data = await fetchFoodReviews(id as string, user?.uid);
            setReviews(data);
        } catch (error) {
            console.error('Error fetching food reviews:', error);
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => {
        loadReviews();
    }, [id]);

    // New Review Form State
    const [newRating, setNewRating] = useState(5);
    const [newContent, setNewContent] = useState('');
    const [newImage, setNewImage] = useState<string | null>(null);

    const pickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            alert('Sorry, we need camera roll permissions to make this work!');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.8,
        });

        if (!result.canceled) {
            setNewImage(result.assets[0].uri);
        }
    };

    // Reply State
    const [replyingToId, setReplyingToId] = useState<string | null>(null);
    const [replyText, setReplyText] = useState('');

    const handleOpenLink = async (url: string) => {
        await WebBrowser.openBrowserAsync(url);
    };

    const toggleLike = async (reviewId: string) => {
        try {
            if (!currentUser) {
                router.push('/(tabs)/profile');
                return;
            }

            await toggleFoodReviewLike(reviewId, currentUser.uid);

            // Local update
            setReviews(prev => prev.map(r => {
                if (r.id === reviewId) {
                    return {
                        ...r,
                        likes: r.isLiked ? r.likes - 1 : r.likes + 1,
                        isLiked: !r.isLiked
                    };
                }
                return r;
            }));
        } catch (error) {
            console.error('Error toggling like:', error);
        }
    };

    const handlePostReview = async () => {
        if (!newContent.trim() || !currentUser) return;

        try {
            setLoading(true);
            let uploadedImages: string[] = [];
            if (newImage) {
                const imageUrl = await uploadFoodImage(newImage);
                uploadedImages.push(imageUrl);
            }

            const newReview = await addFoodReview({
                outletId: id as string,
                authorId: currentUser.uid,
                authorName: currentUser.displayName || 'Anonymous',
                authorEmail: (currentUser as any).email,
                authorAvatar: currentUser.photoURL || undefined,
                rating: newRating,
                content: newContent,
                images: uploadedImages
            });

            // Refresh list
            loadReviews();
            setNewContent('');
            setNewRating(5);
            setNewImage(null);
            setIsPostModalVisible(false);
        } catch (error: any) {
            console.error('Error posting review:', error);
            alert(`Failed to post review: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleSendReply = (reviewId: string) => {
        if (!replyText.trim()) return;

        setReviews(prev => prev.map(r => {
            if (r.id === reviewId) {
                return {
                    ...r,
                    replies: [
                        ...(r.replies || []),
                        {
                            id: `rep${Date.now()}`,
                            author: 'Me',
                            content: replyText,
                            time: 'Just now'
                        }
                    ]
                };
            }
            return r;
        }));

        setReplyText('');
        setReplyingToId(null);
    };

    const handleToggleReply = (reviewId: string) => {
        if (replyingToId === reviewId) {
            setReplyingToId(null);
        } else {
            setReplyingToId(reviewId);
            setReplyText('');
        }
    };

    // In a real app, you'd find the outlet by ID
    // For now, let's just use the first one if not found
    const outlet = DINING_OUTLETS.find(o => o.id === id) || DINING_OUTLETS[0];

    const handleBackPress = () => {
        router.replace({
            pathname: '/(tabs)/map',
            params: { openFoodMap: 'true' }
        } as any);
    };

    const sortedReviews = [...reviews].sort((a, b) => {
        if (sortBy === 'newest') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        return b.likes - a.likes;
    });

    const renderReview = ({ item }: { item: any }) => (
        <View style={styles.reviewCard}>
            <View style={styles.reviewHeader}>
                <View>
                    <View style={styles.reviewAuthorRow}>
                        <Text style={styles.reviewAuthor}>{item.authorName}</Text>
                        <EduBadge shouldShow={isHKBUEmail(item.authorEmail)} size="small" />
                    </View>
                    <Text style={styles.reviewTime}>{new Date(item.createdAt).toLocaleDateString()}</Text>
                </View>
                <View style={styles.ratingRow}>
                    {[...Array(5)].map((_, i) => (
                        <Star
                            key={i}
                            size={12}
                            color={i < item.rating ? "#F59E0B" : "#E5E7EB"}
                            fill={i < item.rating ? "#F59E0B" : "none"}
                        />
                    ))}
                </View>
            </View>
            <Text style={styles.reviewContent}>{item.content}</Text>
            {item.images.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.reviewImages}>
                    {(item.images || []).map((img: string, idx: number) => (
                        <Image key={idx} source={{ uri: img }} style={styles.reviewImage} />
                    ))}
                </ScrollView>
            )}
            <View style={styles.reviewFooter}>
                <TouchableOpacity
                    style={styles.interactionButton}
                    onPress={() => toggleLike(item.id)}
                >
                    <ThumbsUp
                        size={16}
                        color={(item as any).isLiked ? "#F59E0B" : "#6B7280"}
                        fill={(item as any).isLiked ? "#F59E0B" : "none"}
                    />
                    <Text style={[styles.interactionText, (item as any).isLiked && { color: '#F59E0B', fontWeight: 'bold' }]}>
                        {item.likes}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.interactionButton}
                    onPress={() => handleToggleReply(item.id)}
                >
                    <MessageCircle size={16} color={replyingToId === item.id ? "#F59E0B" : "#6B7280"} />
                    <Text style={[styles.interactionText, replyingToId === item.id && { color: '#F59E0B', fontWeight: 'bold' }]}>
                        Reply
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Sub-comments (Replies) */}
            {item.replies && item.replies.length > 0 && (
                <View style={styles.repliesList}>
                    {(item.replies || []).map((reply: any) => (
                        <View key={reply.id} style={styles.replyItem}>
                            <View style={styles.replyHeader}>
                                <Text style={styles.replyAuthor}>{reply.author}</Text>
                                <Text style={styles.replyTime}>{reply.time}</Text>
                            </View>
                            <Text style={styles.replyContent}>{reply.content}</Text>
                        </View>
                    ))}
                </View>
            )}

            {/* Inline Reply Input */}
            {replyingToId === item.id && (
                <View style={styles.inlineReplyContainer}>
                    <TextInput
                        style={styles.inlineReplyInput}
                        placeholder={`Reply to ${item.author}...`}
                        value={replyText}
                        onChangeText={setReplyText}
                        autoFocus
                    />
                    <TouchableOpacity
                        style={[styles.sendReplyButton, !replyText.trim() && styles.sendReplyButtonDisabled]}
                        onPress={() => handleSendReply(item.id)}
                        disabled={!replyText.trim()}
                    >
                        <Send size={16} color="#fff" />
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );

    return (
        <ScreenWrapper withScroll noPadding>
            <View style={styles.container}>
                {/* Header Image Section */}
                <View style={styles.headerImageContainer}>
                    <Image
                        source={typeof outlet.image === 'number' ? outlet.image : { uri: outlet.image }}
                        style={styles.headerImage}
                        resizeMode="cover"
                    />
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={handleBackPress}
                    >
                        <ChevronLeft size={24} color="#fff" />
                    </TouchableOpacity>
                </View>

                {/* Main Content Area */}
                <View style={styles.mainContent}>
                    {/* Outlet Header Info */}
                    <View style={styles.infoSection}>
                        <View style={styles.titleRow}>
                            <Text style={styles.title}>{outlet.title}</Text>
                            <View style={[styles.statusBadge, { backgroundColor: outlet.status === 'Open' ? '#DEF7EC' : '#FDE8E8' }]}>
                                <Text style={[styles.statusText, { color: outlet.status === 'Open' ? '#03543F' : '#9B1C1C' }]}>
                                    {outlet.status}
                                </Text>
                            </View>
                        </View>

                        <View style={styles.detailCard}>
                            <View style={styles.detailRow}>
                                <MapPin size={18} color="#6B7280" />
                                <Text style={styles.detailText}>{outlet.location}</Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Clock size={18} color="#6B7280" />
                                <Text style={styles.detailText}>{outlet.hours}</Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Info size={18} color="#6B7280" />
                                <Text style={styles.detailText}>{outlet.category}</Text>
                            </View>
                        </View>

                        <View style={styles.actionRow}>
                            {outlet.orderUrl && (
                                <TouchableOpacity
                                    style={styles.primaryAction}
                                    onPress={() => handleOpenLink(outlet.orderUrl!)}
                                >
                                    <Text style={styles.primaryActionText}>Order Online</Text>
                                </TouchableOpacity>
                            )}
                            {outlet.menuUrl && (
                                <TouchableOpacity
                                    style={styles.secondaryAction}
                                    onPress={() => handleOpenLink(outlet.menuUrl!)}
                                >
                                    <Text style={styles.secondaryActionText}>View Menu</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>

                    {/* Reviews & Photos Section */}
                    <View style={styles.reviewSection}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Reviews & Photos</Text>
                            <View style={styles.sortContainer}>
                                <TouchableOpacity
                                    style={[styles.sortButton, sortBy === 'newest' && styles.sortButtonActive]}
                                    onPress={() => setSortBy('newest')}
                                >
                                    <Clock size={16} color={sortBy === 'newest' ? '#D97706' : '#6B7280'} />
                                    <Text style={[styles.sortText, sortBy === 'newest' && styles.sortTextActive]}>New</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.sortButton, sortBy === 'popular' && styles.sortButtonActive]}
                                    onPress={() => setSortBy('popular')}
                                >
                                    <Flame size={16} color={sortBy === 'popular' ? '#D97706' : '#6B7280'} />
                                    <Text style={[styles.sortText, sortBy === 'popular' && styles.sortTextActive]}>Hot</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Review List */}
                        {sortedReviews.length > 0 ? (
                            sortedReviews.map((review) => (
                                <View key={review.id}>
                                    {renderReview({ item: review })}
                                </View>
                            ))
                        ) : (
                            <View style={styles.emptyState}>
                                <MessageCircle size={48} color="#E5E7EB" />
                                <Text style={styles.emptyText}>No reviews yet. Be the first to share!</Text>
                            </View>
                        )}
                    </View>
                </View>

                {/* Bottom Spacing */}
                <View style={{ height: 100 }} />
            </View>

            {/* Add Review Floating Button */}
            <TouchableOpacity
                style={styles.fab}
                onPress={() => setIsPostModalVisible(true)}
            >
                <Plus size={24} color="#fff" />
                <Camera size={16} color="#fff" style={styles.fabIcon} />
            </TouchableOpacity>

            {/* Post Review Modal */}
            <Modal
                visible={isPostModalVisible}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setIsPostModalVisible(false)}
            >
                <View style={styles.postModalBg}>
                    <Pressable style={styles.modalCloseArea} onPress={() => setIsPostModalVisible(false)} />
                    <View style={styles.postModalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Share Your Experience</Text>
                            <TouchableOpacity onPress={() => setIsPostModalVisible(false)}>
                                <X size={24} color="#111827" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={styles.postForm} showsVerticalScrollIndicator={false}>
                            <Text style={styles.label}>Rating</Text>
                            <View style={[styles.ratingRow, { marginBottom: 24 }]}>
                                {[1, 2, 3, 4, 5].map((star) => (
                                    <TouchableOpacity key={star} onPress={() => setNewRating(star)} style={{ marginRight: 8 }}>
                                        <Star
                                            size={36}
                                            color={star <= newRating ? "#F59E0B" : "#E5E7EB"}
                                            fill={star <= newRating ? "#F59E0B" : "none"}
                                        />
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <Text style={styles.label}>Your Review</Text>
                            <TextInput
                                style={styles.textInput}
                                placeholder="What did you think of the food and service?"
                                multiline
                                numberOfLines={4}
                                value={newContent}
                                onChangeText={setNewContent}
                                placeholderTextColor="#9CA3AF"
                            />

                            <Text style={styles.label}>Photos</Text>
                            <TouchableOpacity style={styles.addPhotoSlot} onPress={pickImage}>
                                {newImage ? (
                                    <View>
                                        <Image source={{ uri: newImage }} style={styles.previewImage} />
                                        <TouchableOpacity
                                            style={styles.removeImageBtn}
                                            onPress={() => setNewImage(null)}
                                        >
                                            <X size={16} color="#fff" />
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <>
                                        <Camera size={32} color="#9CA3AF" />
                                        <Text style={styles.addPhotoText}>Add Photos</Text>
                                    </>
                                )}
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.submitButton, (!newContent.trim() || loading) && styles.submitButtonDisabled]}
                                onPress={handlePostReview}
                                disabled={!newContent.trim() || loading}
                            >
                                <Text style={styles.submitButtonText}>
                                    {loading ? 'Posting...' : 'Post Review'}
                                </Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </ScreenWrapper>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    headerImageContainer: {
        height: 250,
        width: '100%',
    },
    headerImage: {
        width: '100%',
        height: '100%',
    },
    backButton: {
        position: 'absolute',
        top: 44,
        left: 20,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    infoSection: {
        padding: 24,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    mainContent: {
        flex: 1,
        backgroundColor: '#fff',
    },
    titleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    title: {
        fontSize: 26,
        fontWeight: '900',
        color: '#111827',
        flex: 1,
        letterSpacing: -0.5,
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        marginLeft: 8,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '800',
        textTransform: 'uppercase',
    },
    detailCard: {
        backgroundColor: '#F9FAFB',
        borderRadius: 16,
        padding: 16,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: '#F3F4F6',
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    detailText: {
        fontSize: 15,
        color: '#4B5563',
        marginLeft: 12,
        flex: 1,
        lineHeight: 20,
    },
    actionRow: {
        flexDirection: 'row',
        gap: 12,
    },
    primaryAction: {
        flex: 1,
        backgroundColor: '#F59E0B',
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: 'center',
        shadowColor: '#F59E0B',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
        elevation: 3,
    },
    primaryActionText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 15,
    },
    secondaryAction: {
        flex: 1,
        backgroundColor: '#FEF3C7',
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: 'center',
    },
    secondaryActionText: {
        color: '#D97706',
        fontWeight: '700',
        fontSize: 15,
    },
    reviewSection: {
        padding: 24,
        backgroundColor: '#fff',
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#111827',
    },
    sortContainer: {
        flexDirection: 'row',
        backgroundColor: '#F3F4F6',
        borderRadius: 12,
        padding: 4,
        gap: 4,
    },
    sortButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 10,
        gap: 6,
    },
    sortButtonActive: {
        backgroundColor: '#fff',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 1,
    },
    sortText: {
        fontSize: 13,
        color: '#6B7280',
        fontWeight: '600',
    },
    sortTextActive: {
        color: '#D97706',
    },
    reviewCard: {
        marginBottom: 32,
        backgroundColor: '#fff',
    },
    reviewHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    reviewAuthorRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    reviewAuthor: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111827',
    },
    reviewTime: {
        fontSize: 12,
        color: '#9CA3AF',
        marginTop: 2,
    },
    ratingRow: {
        flexDirection: 'row',
        gap: 2,
    },
    reviewContent: {
        fontSize: 15,
        color: '#374151',
        lineHeight: 24,
        marginBottom: 16,
    },
    reviewImages: {
        marginBottom: 16,
    },
    reviewImage: {
        width: 140,
        height: 140,
        borderRadius: 14,
        marginRight: 12,
    },
    reviewFooter: {
        flexDirection: 'row',
        gap: 24,
    },
    interactionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    interactionText: {
        fontSize: 14,
        color: '#6B7280',
        fontWeight: '500',
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 60,
        backgroundColor: '#F9FAFB',
        borderRadius: 24,
    },
    emptyText: {
        marginTop: 16,
        color: '#9CA3AF',
        fontSize: 15,
        textAlign: 'center',
        paddingHorizontal: 40,
    },
    repliesList: {
        marginTop: 12,
        marginLeft: 20,
        paddingLeft: 12,
        borderLeftWidth: 2,
        borderLeftColor: '#F3F4F6',
    },
    replyItem: {
        marginBottom: 12,
    },
    replyHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
        gap: 8,
    },
    replyAuthor: {
        fontSize: 13,
        fontWeight: '700',
        color: '#374151',
    },
    replyTime: {
        fontSize: 11,
        color: '#9CA3AF',
    },
    replyContent: {
        fontSize: 13,
        color: '#4B5563',
        lineHeight: 18,
    },
    inlineReplyContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
        gap: 10,
    },
    inlineReplyInput: {
        flex: 1,
        backgroundColor: '#F3F4F6',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
        fontSize: 14,
        color: '#111827',
    },
    sendReplyButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#F59E0B',
        justifyContent: 'center',
        alignItems: 'center',
    },
    sendReplyButtonDisabled: {
        backgroundColor: '#E5E7EB',
    },
    fab: {
        position: 'absolute',
        bottom: 30,
        right: 20,
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#F59E0B',
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
    },
    fabIcon: {
        position: 'absolute',
        bottom: 12,
        right: 12,
    },
    postModalBg: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    postModalContent: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        height: '80%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 24,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#111827',
    },
    modalCloseArea: {
        ...StyleSheet.absoluteFillObject,
    },
    postForm: {
        padding: 24,
    },
    label: {
        fontSize: 16,
        fontWeight: '600',
        color: '#374151',
        marginBottom: 8,
    },
    textInput: {
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        padding: 16,
        fontSize: 16,
        color: '#111827',
        textAlignVertical: 'top',
        marginBottom: 20,
        borderWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    addPhotoSlot: {
        height: 100,
        width: 100,
        borderRadius: 12,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
        borderStyle: 'dashed',
        borderWidth: 1,
        borderColor: '#9CA3AF',
        marginBottom: 40,
        gap: 8,
    },
    addPhotoText: {
        fontSize: 10,
        color: '#9CA3AF',
        textAlign: 'center',
    },
    submitButton: {
        backgroundColor: '#F59E0B',
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
    },
    submitButtonDisabled: {
        backgroundColor: '#FCD34D',
    },
    submitButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    previewImage: {
        width: 100,
        height: 100,
        borderRadius: 12,
    },
    removeImageBtn: {
        position: 'absolute',
        top: -8,
        right: -8,
        backgroundColor: '#EF4444',
        borderRadius: 12,
        width: 24,
        height: 24,
        justifyContent: 'center',
        alignItems: 'center',
    }
});
