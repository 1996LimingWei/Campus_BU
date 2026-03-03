import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Camera, ChevronLeft, MapPin, MessageCircle, Plus, Send, Star, ThumbsUp, Trash2, X } from 'lucide-react-native';
import React, { useRef } from 'react';
import {
    Dimensions,
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
    View,
    useWindowDimensions
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring
} from 'react-native-reanimated';
import { EduBadge } from '../../components/common/EduBadge';
import { getCurrentUser } from '../../services/auth';
import { addFoodReview, fetchFoodReviews, toggleFoodReviewLike, uploadFoodImage } from '../../services/food';
import { isHKBUEmail } from '../../utils/userUtils';

const { width } = Dimensions.get('window');
const COLUMN_WIDTH = (width - 48) / 2;

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

// Mock Food Data (Deprecated, use Supabase)
const FOOD_POSTS: Review[] = [];

// Official Dining Outlets Data
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

export default function FoodScreen() {
    const router = useRouter();
    const { width: windowWidth, height: windowHeight } = useWindowDimensions();
    const [activeTab, setActiveTab] = React.useState<'reviews' | 'outlets'>('outlets');
    const [isMapVisible, setIsMapVisible] = React.useState(false);
    const reviewsListRef = useRef<FlatList>(null);

    const [reviews, setReviews] = React.useState<Review[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [isAddModalVisible, setIsAddModalVisible] = React.useState(false);
    const [currentUser, setCurrentUser] = React.useState<any>(null);

    // New Review State
    const [newLocation, setNewLocation] = React.useState('Main Canteen');
    const [newContent, setNewContent] = React.useState('');
    const [newRating, setNewRating] = React.useState(5);
    const [newImage, setNewImage] = React.useState<string | null>(null);

    // Reply State
    const [replyingToId, setReplyingToId] = React.useState<string | null>(null);
    const [replyText, setReplyText] = React.useState('');

    const loadReviews = async () => {
        try {
            setLoading(true);
            const user = await getCurrentUser();
            setCurrentUser(user);
            const data = await fetchFoodReviews(undefined, user?.uid);
            setReviews(data);
        } catch (error) {
            console.error('Error fetching global food reviews:', error);
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => {
        if (activeTab === 'reviews') {
            loadReviews();
        }
    }, [activeTab]);

    // Zoom State
    const scale = useSharedValue(1);
    const savedScale = useSharedValue(1);
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const savedTranslateX = useSharedValue(0);
    const savedTranslateY = useSharedValue(0);

    const pinchGesture = Gesture.Pinch()
        .onUpdate((e) => {
            scale.value = savedScale.value * e.scale;
        })
        .onEnd(() => {
            if (scale.value < 1) {
                scale.value = withSpring(1);
                translateX.value = withSpring(0);
                translateY.value = withSpring(0);
                savedScale.value = 1;
                savedTranslateX.value = 0;
                savedTranslateY.value = 0;
            } else {
                savedScale.value = scale.value;
            }
        });

    const panGesture = Gesture.Pan()
        .onUpdate((e) => {
            translateX.value = savedTranslateX.value + e.translationX;
            translateY.value = savedTranslateY.value + e.translationY;
        })
        .onEnd(() => {
            savedTranslateX.value = translateX.value;
            savedTranslateY.value = translateY.value;
        });

    const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: translateX.value },
            { translateY: translateY.value },
            { scale: scale.value },
        ],
    }));

    const resetZoom = () => {
        scale.value = withSpring(1);
        savedScale.value = 1;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
    };

    const handleAddFood = () => {
        setIsAddModalVisible(true);
    };

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

    const handleLike = async (id: string) => {
        try {
            if (!currentUser) {
                router.push('/(tabs)/profile');
                return;
            }

            await toggleFoodReviewLike(id, currentUser.uid);

            setReviews(prev => prev.map(post => {
                if (post.id === id) {
                    return {
                        ...post,
                        likes: post.isLiked ? post.likes - 1 : post.likes + 1,
                        isLiked: !post.isLiked
                    };
                }
                return post;
            }));
        } catch (error) {
            console.error('Error togging like in feed:', error);
        }
    };

    const handleDelete = (id: string) => {
        setReviews(prev => prev.filter(post => post.id !== id));
    };

    const handleToggleReply = (id: string) => {
        if (replyingToId === id) {
            setReplyingToId(null);
            setReplyText('');
        } else {
            setReplyingToId(id);
            setReplyText('');
            const index = reviews.findIndex(r => r.id === id);
            if (index !== -1 && reviewsListRef.current) {
                // Scroll slightly past the item to show the reply input
                setTimeout(() => {
                    reviewsListRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
                }, 100);
            }
        }
    };

    const handleSendReply = (postId: string) => {
        if (!replyText.trim()) return;

        setReviews(prev => prev.map(post => {
            if (post.id === postId) {
                return {
                    ...post,
                    replies: [
                        ...(post.replies || []),
                        {
                            id: `r${Date.now()}`,
                            author: 'Me',
                            content: String(replyText),
                            time: 'Just now'
                        }
                    ]
                };
            }
            return post;
        }));
        setReplyText('');
        setReplyingToId(null);
    };


    const submitNewReview = async () => {
        if (!newContent.trim() || !currentUser) return;

        try {
            setLoading(true);
            let uploadedImages: string[] = [];
            if (newImage) {
                const imageUrl = await uploadFoodImage(newImage);
                uploadedImages.push(imageUrl);
            }

            const outlet = DINING_OUTLETS.find(o => o.title === newLocation);
            await addFoodReview({
                outletId: outlet?.id || 'o1',
                authorId: currentUser.uid,
                authorName: currentUser.displayName || 'Anonymous',
                authorEmail: (currentUser as any).email,
                authorAvatar: currentUser.photoURL || undefined,
                rating: newRating,
                content: newContent,
                images: uploadedImages
            });

            await loadReviews();
            setIsAddModalVisible(false);
            setNewContent('');
            setNewRating(5);
            setNewImage(null);
        } catch (error: any) {
            console.error('Error submitting global review:', error);
            alert(`Failed to post review: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenLink = async (url: string) => {
        await WebBrowser.openBrowserAsync(url);
    };

    const renderItem = ({ item }: { item: any }) => (
        <View style={styles.card}>
            <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => {
                    const outlet = DINING_OUTLETS.find(o => o.title === item.location);
                    router.push(`/food/${outlet?.id || 'o1'}` as any);
                }}
            >
                <View style={styles.cardHeader}>
                    <View style={styles.authorAvatar}>
                        <Text style={styles.avatarText}>{String(item.authorName).charAt(0)}</Text>
                    </View>
                    <View style={styles.authorMeta}>
                        <View style={styles.authorNameRow}>
                            <Text style={styles.authorName}>{String(item.authorName)}</Text>
                            <EduBadge shouldShow={isHKBUEmail(item.authorEmail)} size="small" />
                        </View>
                        <Text style={styles.postTime}>{new Date(item.createdAt).toLocaleDateString()}</Text>
                    </View>
                    <View style={styles.statsRow}>
                        <Star size={12} color="#F59E0B" fill="#F59E0B" />
                        <Text style={styles.ratingText}>{String(item.rating)}</Text>
                    </View>
                </View>

                <View style={styles.cardTextContent}>
                    <Text style={styles.cardContentText}>{String(item.content)}</Text>
                </View>

                {item.image && <Image source={{ uri: item.image }} style={styles.cardImage} />}

                <View style={styles.cardFooter}>
                    <View style={styles.footerInfo}>
                        <View style={styles.locationTag}>
                            <MapPin size={12} color="#F59E0B" />
                            <Text style={styles.locationTagText}>
                                {DINING_OUTLETS.find(o => o.id === item.outletId)?.title || 'Restaurant'}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.interactionRow}>
                        <TouchableOpacity
                            style={styles.interactionBtn}
                            onPress={() => handleLike(item.id)}
                        >
                            <ThumbsUp size={16} color={item.isLiked ? "#F59E0B" : "#BFC4CD"} fill={item.isLiked ? "#F59E0B" : "none"} />
                            <Text style={[styles.interactionLabel, item.isLiked && { color: '#F59E0B' }]}>{item.likes}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.interactionBtn}
                            onPress={() => handleToggleReply(item.id)}
                        >
                            <MessageCircle size={16} color={replyingToId === item.id ? "#F59E0B" : "#BFC4CD"} />
                            <Text style={[styles.interactionLabel, replyingToId === item.id && { color: '#F59E0B' }]}>Reply</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.deleteBtn}
                            onPress={() => handleDelete(item.id)}
                        >
                            <Trash2 size={16} color="#EF4444" />
                        </TouchableOpacity>
                    </View>
                </View>
            </TouchableOpacity>

            {/* Inline Replies */}
            {item.replies && item.replies.length > 0 && (
                <View style={styles.repliesContainer}>
                    {item.replies.map((reply: any) => (
                        <View key={reply.id} style={styles.replyItem}>
                            <Text style={styles.replyAuthor}>{reply.author}: </Text>
                            <Text style={styles.replyContent}>{reply.content}</Text>
                        </View>
                    ))}
                </View>
            )}

            {/* Inline Reply Input */}
            {replyingToId === item.id && (
                <View style={styles.replyInputContainer}>
                    <TextInput
                        style={styles.replyInput}
                        placeholder="Say something..."
                        value={replyText}
                        onChangeText={setReplyText}
                        autoFocus
                    />
                    <TouchableOpacity
                        style={styles.replySendBtn}
                        onPress={() => handleSendReply(item.id)}
                    >
                        <Send size={18} color="#F59E0B" />
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );

    const renderOutlet = ({ item }: { item: typeof DINING_OUTLETS[0] }) => (
        <View style={styles.outletCard}>
            <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => router.push(`/food/${item.id}` as any)}
            >
                <Image source={item.image} style={styles.outletImage} />
                <View style={styles.outletContent}>
                    <View style={styles.outletHeader}>
                        <Text style={styles.outletTitle}>{item.title}</Text>
                        <View style={[styles.statusBadge, { backgroundColor: item.status === 'Open' ? '#DEF7EC' : '#FDE8E8' }]}>
                            <Text style={[styles.statusText, { color: item.status === 'Open' ? '#03543F' : '#9B1C1C' }]}>{item.status}</Text>
                        </View>
                    </View>

                    <View style={styles.infoRow}>
                        <MapPin size={14} color="#6B7280" />
                        <Text style={styles.infoText}>{item.location}</Text>
                    </View>

                    <View style={styles.detailsRow}>
                        <View style={styles.categoryBadge}>
                            <Text style={styles.categoryText}>{item.category}</Text>
                        </View>
                        <View style={styles.hoursContainer}>
                            {item.hours.split(', ').map((line, index) => (
                                <Text key={index} style={styles.hoursText}>{line}</Text>
                            ))}
                        </View>
                    </View>
                </View>
            </TouchableOpacity>

            <View style={[styles.outletContent, { paddingTop: 0 }]}>
                <View style={styles.outletActions}>
                    {item.orderUrl && (
                        <TouchableOpacity
                            style={styles.orderButton}
                            onPress={() => handleOpenLink(item.orderUrl!)}
                        >
                            <Text style={styles.orderButtonText}>Order Online</Text>
                        </TouchableOpacity>
                    )}
                    {item.menuUrl && (
                        <TouchableOpacity
                            style={[styles.menuButton, !item.orderUrl && { flex: 1 }]}
                            onPress={() => handleOpenLink(item.menuUrl!)}
                        >
                            <Text style={styles.menuButtonText}>View Menu</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </View>
    );

    const renderMapHeader = () => (
        <TouchableOpacity
            style={styles.mapBanner}
            onPress={() => setIsMapVisible(true)}
            activeOpacity={0.9}
        >
            <Image
                source={require('../../assets/images/food/Map.png')}
                style={styles.mapBannerImage}
                resizeMode="cover"
            />
            <View style={styles.mapBannerOverlay}>
                <View style={styles.mapBannerContent}>
                    <MapPin size={20} color="#fff" />
                    <View style={styles.mapBannerTextContainer}>
                        <Text style={styles.mapBannerTitle}>Campus Dining Map</Text>
                        <Text style={styles.mapBannerSubtitle}>Click to view full map</Text>
                    </View>
                </View>
            </View>
        </TouchableOpacity>
    );

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
            <View style={styles.header}>
                <View style={styles.headerRow}>
                    <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                        <ChevronLeft size={24} color="#fff" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Campus Food</Text>
                    <View style={{ width: 40 }} />
                </View>
                <Text style={styles.headerSubtitle}>Discover hidden gems in HKBU 🍜</Text>
            </View>

            <View style={styles.tabContainer}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'outlets' && styles.activeTab]}
                    onPress={() => setActiveTab('outlets')}
                >
                    <Text style={[styles.tabText, activeTab === 'outlets' && styles.activeTabText]}>Dining Outlets</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'reviews' && styles.activeTab]}
                    onPress={() => setActiveTab('reviews')}
                >
                    <Text style={[styles.tabText, activeTab === 'reviews' && styles.activeTabText]}>Community Reviews</Text>
                </TouchableOpacity>
            </View>

            {activeTab === 'reviews' ? (
                <FlatList
                    ref={reviewsListRef}
                    key="reviews-list"
                    data={reviews}
                    renderItem={renderItem}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                />
            ) : (
                <FlatList
                    key="outlets-list"
                    data={DINING_OUTLETS}
                    renderItem={renderOutlet}
                    keyExtractor={item => item.id}
                    ListHeaderComponent={renderMapHeader}
                    contentContainerStyle={styles.outletListContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                />
            )}

            {/* Floating Action Button for Community Reviews */}
            {activeTab === 'reviews' && (
                <TouchableOpacity
                    style={styles.fab}
                    onPress={handleAddFood}
                >
                    <Plus size={30} color="#fff" />
                </TouchableOpacity>
            )}

            {/* Add Review Modal */}
            <Modal
                visible={isAddModalVisible}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setIsAddModalVisible(false)}
            >
                <View style={styles.modalBg}>
                    <Pressable style={styles.modalCloseArea} onPress={() => setIsAddModalVisible(false)} />
                    <View style={[styles.modalContent, { height: 'auto', maxHeight: '80%' }]}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Share Your Meal</Text>
                            <TouchableOpacity onPress={() => setIsAddModalVisible(false)}>
                                <X size={24} color="#111827" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                            <Text style={styles.inputLabel}>Restaurant</Text>
                            <View style={styles.locationPicker}>
                                {DINING_OUTLETS.map(outlet => (
                                    <TouchableOpacity
                                        key={outlet.id}
                                        style={[styles.locationChip, newLocation === outlet.title && styles.activeLocationChip]}
                                        onPress={() => setNewLocation(outlet.title)}
                                    >
                                        <Text style={[styles.locationChipText, newLocation === outlet.title && styles.activeLocationChipText]}>
                                            {outlet.title}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <Text style={styles.inputLabel}>Rating</Text>
                            <View style={styles.ratingPicker}>
                                {[1, 2, 3, 4, 5].map(num => (
                                    <TouchableOpacity key={num} onPress={() => setNewRating(num)}>
                                        <Star size={32} color={num <= newRating ? "#F59E0B" : "#E5E7EB"} fill={num <= newRating ? "#F59E0B" : "none"} />
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <Text style={styles.inputLabel}>Photo</Text>
                            <TouchableOpacity style={styles.imagePickerBtn} onPress={pickImage}>
                                {newImage ? (
                                    <Image source={{ uri: newImage }} style={styles.previewImage} />
                                ) : (
                                    <View style={styles.imagePickerPlaceholder}>
                                        <Camera size={32} color="#9CA3AF" />
                                        <Text style={styles.imagePickerText}>Add a photo</Text>
                                    </View>
                                )}
                            </TouchableOpacity>

                            <Text style={styles.inputLabel}>Review Content</Text>
                            <TextInput
                                style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                                placeholder="Tell others about your experience..."
                                multiline
                                value={newContent}
                                onChangeText={setNewContent}
                            />

                            <TouchableOpacity
                                style={[styles.submitButton, !newContent.trim() && styles.submitButtonDisabled]}
                                onPress={submitNewReview}
                                disabled={!newContent.trim()}
                            >
                                <Text style={styles.submitButtonText}>Post Review</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Map Modal */}
            <Modal
                visible={isMapVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setIsMapVisible(false)}
            >
                <GestureHandlerRootView style={{ flex: 1 }}>
                    <View style={styles.modalBg}>
                        <Pressable style={styles.modalCloseArea} onPress={() => setIsMapVisible(false)} />
                        <View style={styles.modalContent}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>Campus Dining Map</Text>
                                <TouchableOpacity onPress={() => setIsMapVisible(false)}>
                                    <X size={24} color="#111827" />
                                </TouchableOpacity>
                            </View>
                            <View style={styles.mapContainer}>
                                <GestureDetector gesture={composedGesture}>
                                    <Animated.Image
                                        source={require('../../assets/images/food/Map.png')}
                                        style={[styles.fullMapImage, animatedStyle]}
                                        resizeMode="contain"
                                    />
                                </GestureDetector>
                            </View>
                            <TouchableOpacity style={styles.resetButton} onPress={resetZoom}>
                                <Text style={styles.resetButtonText}>Reset Zoom</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </GestureHandlerRootView>
            </Modal>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    header: {
        paddingTop: 64,
        paddingBottom: 40,
        paddingHorizontal: 24,
        backgroundColor: '#F59E0B',
        borderBottomLeftRadius: 36,
        borderBottomRightRadius: 36,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    addButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: '900',
        color: '#fff',
        letterSpacing: -0.5,
    },
    headerSubtitle: {
        fontSize: 15,
        color: 'rgba(255,255,255,0.9)',
        textAlign: 'center',
        fontWeight: '500',
    },
    listContent: {
        padding: 20,
        paddingTop: 32,
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 24,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 4,
        overflow: 'hidden',
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
    },
    authorAvatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#F59E0B',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14,
    },
    authorMeta: {
        flex: 1,
        marginLeft: 12,
    },
    authorNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    authorName: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#111827',
    },
    postTime: {
        fontSize: 11,
        color: '#9CA3AF',
        marginTop: 2,
    },
    cardTextContent: {
        paddingHorizontal: 16,
        paddingBottom: 16,
    },
    cardContentText: {
        fontSize: 15,
        color: '#4B5563',
        lineHeight: 22,
    },
    cardImage: {
        width: '100%',
        height: 200,
        backgroundColor: '#F3F4F6',
    },
    cardFooter: {
        flexDirection: 'row',
        padding: 16,
        gap: 8,
    },
    locationTag: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFBEB',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 10,
        gap: 4,
    },
    locationTagText: {
        fontSize: 12,
        color: '#D97706',
        fontWeight: '700',
    },
    dishTag: {
        backgroundColor: '#F3F4F6',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 10,
    },
    dishTagText: {
        fontSize: 12,
        color: '#4B5563',
        fontWeight: '600',
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFBEB',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        gap: 4,
    },
    ratingText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#D97706',
    },
    footerInfo: {
        flex: 1,
        gap: 8,
    },
    interactionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginTop: 4,
    },
    interactionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    interactionLabel: {
        fontSize: 12,
        color: '#9CA3AF',
        fontWeight: '600',
    },
    deleteBtn: {
        padding: 4,
    },
    fab: {
        position: 'absolute',
        bottom: 30,
        right: 24,
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#F59E0B',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#F59E0B',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 6,
        zIndex: 100,
    },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        borderRadius: 16,
        marginHorizontal: 24,
        marginTop: -24,
        padding: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5,
        zIndex: 50,
    },
    tab: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        borderRadius: 12,
    },
    activeTab: {
        backgroundColor: '#FFFBEB',
    },
    tabText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#9CA3AF',
    },
    activeTabText: {
        color: '#D97706',
    },
    outletListContent: {
        padding: 16,
        paddingTop: 24,
    },
    outletCard: {
        backgroundColor: '#fff',
        borderRadius: 20,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 4,
        overflow: 'hidden',
    },
    outletImage: {
        width: '100%',
        height: 180,
        backgroundColor: '#E5E7EB',
    },
    outletContent: {
        padding: 16,
    },
    outletHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    outletTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#111827',
        flex: 1,
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    statusText: {
        fontSize: 11,
        fontWeight: 'bold',
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    infoText: {
        fontSize: 12,
        color: '#4B5563',
        marginLeft: 4,
        flex: 1,
    },
    detailsRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    categoryBadge: {
        backgroundColor: '#FFFBEB',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        marginRight: 8,
        marginTop: 2,
    },
    categoryText: {
        fontSize: 11,
        color: '#D97706',
        fontWeight: '500',
    },
    hoursContainer: {
        flex: 1,
    },
    hoursText: {
        fontSize: 11,
        color: '#6B7280',
        lineHeight: 16,
    },
    outletActions: {
        flexDirection: 'row',
        marginTop: 16,
        gap: 12,
    },
    orderButton: {
        flex: 1,
        backgroundColor: '#F59E0B',
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: 'center',
    },
    orderButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
    },
    menuButton: {
        flex: 1,
        backgroundColor: '#fff',
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    menuButtonText: {
        color: '#4B5563',
        fontSize: 14,
        fontWeight: 'bold',
    },
    mapBanner: {
        height: 120,
        borderRadius: 20,
        marginBottom: 24,
        overflow: 'hidden',
        backgroundColor: '#E5E7EB',
    },
    mapBannerImage: {
        width: '100%',
        height: '100%',
    },
    mapBannerOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'center',
        paddingHorizontal: 20,
    },
    mapBannerContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    mapBannerTextContainer: {
        marginLeft: 12,
    },
    mapBannerTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    mapBannerSubtitle: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 12,
        marginTop: 2,
    },
    modalBg: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalCloseArea: {
        ...StyleSheet.absoluteFillObject,
    },
    modalContent: {
        width: '90%',
        height: '70%',
        backgroundColor: '#fff',
        borderRadius: 24,
        overflow: 'hidden',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#111827',
    },
    fullMapImage: {
        flex: 1,
        width: '100%',
    },
    mapContainer: {
        flex: 1,
        overflow: 'hidden',
        backgroundColor: '#f8f8f8',
    },
    modalBody: {
        padding: 20,
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: '700',
        color: '#374151',
        marginBottom: 8,
        marginTop: 16,
    },
    input: {
        backgroundColor: '#F3F4F6',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 15,
        color: '#111827',
    },
    imagePickerBtn: {
        width: '100%',
        height: 150,
        backgroundColor: '#F3F4F6',
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderStyle: 'dashed',
    },
    imagePickerPlaceholder: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    imagePickerText: {
        color: '#9CA3AF',
        marginTop: 8,
        fontSize: 14,
    },
    previewImage: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    repliesContainer: {
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        padding: 12,
        marginTop: 8,
        marginHorizontal: 12,
        marginBottom: 8,
    },
    replyItem: {
        flexDirection: 'row',
        marginBottom: 4,
    },
    replyAuthor: {
        fontWeight: '700',
        color: '#374151',
        fontSize: 13,
    },
    replyContent: {
        color: '#4B5563',
        fontSize: 13,
        flex: 1,
    },
    replyInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 20,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
        backgroundColor: '#fff',
    },
    replyInput: {
        flex: 1,
        backgroundColor: '#F3F4F6',
        borderRadius: 24,
        paddingHorizontal: 16,
        paddingVertical: 10,
        fontSize: 14,
        marginRight: 8,
        color: '#111827',
    },
    replySendBtn: {
        padding: 8,
    },
    locationPicker: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    locationChip: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#F3F4F6',
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    activeLocationChip: {
        backgroundColor: '#FEF3C7',
        borderColor: '#F59E0B',
    },
    locationChipText: {
        fontSize: 12,
        color: '#6B7280',
        fontWeight: '600',
    },
    activeLocationChipText: {
        color: '#D97706',
    },
    ratingPicker: {
        flexDirection: 'row',
        gap: 12,
        marginVertical: 4,
    },
    submitButton: {
        backgroundColor: '#F59E0B',
        borderRadius: 16,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 24,
        shadowColor: '#F59E0B',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    submitButtonDisabled: {
        backgroundColor: '#E5E7EB',
        shadowOpacity: 0,
        elevation: 0,
    },
    submitButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    resetButton: {
        position: 'absolute',
        bottom: 20,
        right: 20,
        backgroundColor: 'rgba(245, 158, 11, 0.9)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
    },
    resetButtonText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
    },
});
