import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import {
    ArrowLeft,
    ArrowLeftRight,
    AtSign,
    Grid,
    Heart,
    List,
    MessageSquare,
    Plus,
    PlusCircle,
    Search,
    Send,
    Trash2,
    X
} from 'lucide-react-native';
import React, {
    useEffect,
    useRef,
    useState
} from 'react';
import { useTranslation } from 'react-i18next';
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
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TranslatableText } from '../../components/common/TranslatableText';
import { useLoginPrompt } from '../../hooks/useLoginPrompt';
import { getCurrentUser } from '../../services/auth';
import { deleteExchange, fetchExchangeComments, fetchExchanges, postExchange, postExchangeComment, toggleExchangeLike } from '../../services/exchange';
import { ContactMethod, CourseExchange, ExchangeComment, ExchangeCourseDetail } from '../../types';

const CONTACT_PLATFORMS = [
    { label: 'WeChat', value: 'WeChat', icon: '💬' },
    { label: 'WhatsApp', value: 'WhatsApp', icon: '📱' },
    { label: 'Email', value: 'Email', icon: '📧' },
    { label: 'Instagram', value: 'Instagram', icon: '📸' },
    { label: 'Telegram', value: 'Telegram', icon: '✈️' },
    { label: 'Other', value: 'Other', icon: '🔗' },
] as const;

export default function ExchangeScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { t } = useTranslation();
    const { checkLogin } = useLoginPrompt();
    const [exchanges, setExchanges] = useState<CourseExchange[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [isPostModalVisible, setIsPostModalVisible] = useState(false);
    const [isCommentModalVisible, setIsCommentModalVisible] = useState(false);
    const [isContactModalVisible, setIsContactModalVisible] = useState(false);
    const [viewMode, setViewMode] = useState<'card' | 'compact'>('card');
    const [selectedExchange, setSelectedExchange] = useState<CourseExchange | null>(null);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [comments, setComments] = useState<ExchangeComment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [loadingComments, setLoadingComments] = useState(false);
    const [replyTarget, setReplyTarget] = useState<ExchangeComment | null>(null);
    const commentInputRef = useRef<TextInput>(null);

    // Post Form State
    const [haveCourse, setHaveCourse] = useState('');
    const [haveSection, setHaveSection] = useState('');
    const [haveTeacher, setHaveTeacher] = useState('');
    const [haveTime, setHaveTime] = useState('');

    const [wantCourses, setWantCourses] = useState<ExchangeCourseDetail[]>([{ code: '', section: '', teacher: '', time: '' }]);

    const [reason, setReason] = useState('');
    const [selectedMethods, setSelectedMethods] = useState<ContactMethod['platform'][]>([]);
    const [contactValues, setContactValues] = useState<Record<string, string>>({});
    const [otherPlatformName, setOtherPlatformName] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Section Picker State
    const [isSectionPickerVisible, setIsSectionPickerVisible] = useState(false);
    const [pickerTarget, setPickerTarget] = useState<{ type: 'have' | 'want', index?: number } | null>(null);

    const openSectionPicker = (type: 'have' | 'want', index?: number) => {
        setPickerTarget({ type, index });
        setIsSectionPickerVisible(true);
    };

    const handleSelectSection = (section: string) => {
        if (!pickerTarget) return;

        const currentVal = pickerTarget.type === 'have'
            ? haveSection
            : wantCourses[pickerTarget.index!].section || '';

        let sections = currentVal ? currentVal.split(', ').filter(s => s.trim() !== '') : [];
        if (sections.includes(section)) {
            sections = sections.filter(s => s !== section);
        } else {
            sections = [...sections, section].sort((a, b) => parseInt(a) - parseInt(b));
        }

        const newVal = sections.join(', ');

        if (pickerTarget.type === 'have') {
            setHaveSection(newVal);
        } else if (pickerTarget.type === 'want' && pickerTarget.index !== undefined) {
            updateWantCourse(pickerTarget.index, 'section', newVal);
        }
    };

    useEffect(() => {
        getCurrentUser().then(user => {
            if (user) setCurrentUserId(user.uid);
        });
        loadExchanges();
    }, []);

    const organizedComments = React.useMemo(() => {
        const rootComments = comments.filter(c => !c.parentCommentId);
        const replyMap: Record<string, ExchangeComment[]> = {};

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

    const loadExchanges = async () => {
        setLoading(true);
        const data = await fetchExchanges();
        setExchanges(data);
        setLoading(false);
    };

    const toggleMethod = (platform: ContactMethod['platform']) => {
        if (selectedMethods.includes(platform)) {
            setSelectedMethods(selectedMethods.filter(m => m !== platform));
        } else {
            setSelectedMethods([...selectedMethods, platform]);
        }
    };

    const handlePostExchange = async () => {
        if (!checkLogin(currentUserId)) return;
        const validWants = wantCourses.filter(w => w.code.trim() !== '');

        if (!haveCourse || validWants.length === 0 || selectedMethods.length === 0) {
            Alert.alert('Missing Info', 'Please fill in HAVE course, at least one WANT course, and at least one contact method.');
            return;
        }

        for (const method of selectedMethods) {
            if (!contactValues[method]?.trim()) {
                Alert.alert('Missing Contact', `Please provide your ${method} ID.`);
                return;
            }
        }

        if (selectedMethods.includes('Other') && !otherPlatformName.trim()) {
            Alert.alert('Missing Platform', 'Please specify the platform name for "Other".');
            return;
        }

        const user = await getCurrentUser();
        if (!user) {
            Alert.alert('Error', 'You must be logged in to post.');
            return;
        }

        setSubmitting(true);
        try {
            // Fetch the detailed profile to get the real major
            const { getUserProfile } = await import('../../services/auth');
            const profile = await getUserProfile(user.uid);

            const contacts: ContactMethod[] = selectedMethods.map(m => ({
                platform: m,
                value: contactValues[m],
                otherPlatformName: m === 'Other' ? otherPlatformName : undefined
            }));

            await postExchange({
                userId: user.uid,
                userName: profile?.displayName || user.displayName || 'Anonymous User',
                userAvatar: profile?.avatarUrl || user.photoURL || '👤',
                userMajor: profile?.major || 'General Student',
                haveCourse,
                haveSection,
                haveTeacher,
                haveTime,
                wantCourses: validWants,
                reason,
                contacts,
            });

            setIsPostModalVisible(false);
            loadExchanges();
            Alert.alert('Success', 'Your exchange request is posted!');
            resetForm();
        } catch (error: any) {
            Alert.alert('Error', error.message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleToggleLike = async (exchangeId: string) => {
        if (!checkLogin(currentUserId)) return;
        const user = await getCurrentUser();
        if (!user) return;

        // Optimistic UI
        setExchanges(prev => prev.map(e => {
            if (e.id === exchangeId) {
                const isLiked = !e.isLiked;
                return {
                    ...e,
                    isLiked,
                    likes: isLiked ? e.likes + 1 : e.likes - 1
                };
            }
            return e;
        }));

        try {
            await toggleExchangeLike(exchangeId, user.uid);
        } catch (error) {
            console.error('Like error:', error);
            // Revert on error could be added here
        }
    };

    const handleDeleteExchange = async (exchange: CourseExchange) => {
        if (!currentUserId || currentUserId !== exchange.userId) return;

        Alert.alert(
            "Delete Request",
            "Are you sure you want to delete this exchange request?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                        // Optimistic UI update
                        setExchanges(prev => prev.filter(e => e.id !== exchange.id));

                        const result = await deleteExchange(exchange.id, currentUserId);
                        if (!result.success) {
                            Alert.alert("Error", result.error || "Failed to delete");
                            // Revert on failure
                            loadExchanges();
                        }
                    }
                }
            ]
        );
    };

    const resetForm = () => {
        setHaveCourse('');
        setHaveSection('');
        setHaveTeacher('');
        setHaveTime('');
        setWantCourses([{ code: '', section: '', teacher: '', time: '' }]);
        setReason('');
        setSelectedMethods([]);
        setContactValues({});
        setOtherPlatformName('');
    };

    const addWantCourse = () => {
        setWantCourses([...wantCourses, { code: '', section: '', teacher: '', time: '' }]);
    };

    const removeWantCourse = (index: number) => {
        if (wantCourses.length > 1) {
            setWantCourses(wantCourses.filter((_, i) => i !== index));
        }
    };

    const updateWantCourse = (index: number, field: keyof ExchangeCourseDetail, value: string) => {
        const newWants = [...wantCourses];
        newWants[index] = { ...newWants[index], [field]: value };
        setWantCourses(newWants);
    };

    const openComments = async (exchange: CourseExchange) => {
        setSelectedExchange(exchange);
        setIsCommentModalVisible(true);
        setLoadingComments(true);
        const data = await fetchExchangeComments(exchange.id);
        setComments(data);
        setLoadingComments(false);
    };

    const handleSendComment = async () => {
        if (!checkLogin(currentUserId)) return;
        if (!newComment.trim() || !selectedExchange) return;

        const user = await getCurrentUser();
        if (!user) return;

        try {
            await postExchangeComment(selectedExchange.id, {
                id: user.uid,
                name: user.displayName || 'Anonymous',
                avatar: user.photoURL || '👤'
            }, newComment.trim(),
                replyTarget?.parentCommentId || replyTarget?.id,
                replyTarget?.authorName
            );

            setNewComment('');
            setReplyTarget(null);
            const data = await fetchExchangeComments(selectedExchange.id);
            setComments(data);
            setExchanges(prev => prev.map(e =>
                e.id === selectedExchange.id ? { ...e, commentCount: e.commentCount + 1 } : e
            ));
        } catch (error: any) {
            Alert.alert('Error', error.message);
        }
    };

    const renderAvatar = (avatar: string, style: any) => {
        if (!avatar) return <Text style={style}>👤</Text>;
        const isUrl = typeof avatar === 'string' && (avatar.startsWith('http') || avatar.startsWith('https'));
        if (isUrl) {
            return <Image source={{ uri: avatar }} style={style} />;
        }
        return <Text style={style}>{avatar}</Text>;
    };

    const handleCopy = async (text: string, platform: string) => {
        await Clipboard.setStringAsync(text);
        Alert.alert('Copied', `${platform} ID copied to clipboard!`);
    };

    const filteredExchanges = exchanges.filter(e =>
        e.haveCourse.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.wantCourses.some(w => w.code.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const renderExchangeItem = ({ item }: { item: CourseExchange }) => (
        <View style={styles.exchangeCard}>
            <View style={styles.cardHeader}>
                <View style={styles.userInfo}>
                    {renderAvatar(item.userAvatar, styles.userAvatar)}
                    <View style={styles.userNameRow}>
                        <Text style={styles.userName} numberOfLines={1}>{item.userName}</Text>
                        <View style={styles.dotSeparator} />
                        <Text style={styles.cardTime}>{new Date(item.createdAt).toLocaleDateString()}</Text>
                    </View>
                </View>
                {currentUserId === item.userId && (
                    <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteExchange(item)}>
                        <Trash2 size={16} color="#9CA3AF" />
                    </TouchableOpacity>
                )}
            </View>

            <View style={styles.mainExchangeRow}>
                {/* HAVE SECTION */}
                <View style={[styles.courseBlock, styles.haveBlock]}>
                    <Text style={styles.blockLabelHave}>{t('exchange.have_label')}</Text>
                    <Text style={styles.courseCodeMain}>{item.haveCourse}</Text>
                    {item.haveSection && <Text style={styles.detailTextTiny}>{t('exchange.sec_label')} {item.haveSection}</Text>}
                </View>

                {/* TRANSFER ICON */}
                <View style={styles.transferIconWrapper}>
                    <ArrowLeftRight size={20} color="#E5E7EB" />
                </View>

                {/* WANT SECTION */}
                <View style={[styles.courseBlock, styles.wantBlock]}>
                    <Text style={styles.blockLabelWant}>{t('exchange.want_label')}</Text>
                    {item.wantCourses.map((want, idx) => (
                        <View key={idx} style={styles.wantItemMini}>
                            <Text style={styles.courseCodeMainWant}>{want.code}</Text>
                            {want.section && <Text style={styles.detailTextTinyWant}>{t('exchange.sec_label')} {want.section}</Text>}
                        </View>
                    ))}
                </View>
            </View>

            {item.reason && (
                <View style={styles.reasonBox}>
                    <Text style={styles.reasonBody} numberOfLines={2}>{item.reason}</Text>
                </View>
            )}

            <View style={styles.cardFooter}>
                <View style={styles.leftActions}>
                    <TouchableOpacity style={[styles.minorAction, item.isLiked && styles.likedAction]} onPress={() => handleToggleLike(item.id)}>
                        <Heart size={16} color={item.isLiked ? '#EF4444' : '#9CA3AF'} fill={item.isLiked ? '#EF4444' : 'transparent'} />
                        <Text style={[styles.minorActionText, item.isLiked && styles.likedText]}>{item.likes || 0}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.minorAction} onPress={() => openComments(item)}>
                        <MessageSquare size={16} color="#9CA3AF" />
                        <Text style={styles.minorActionText}>{item.commentCount || 0}</Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity
                    style={styles.contactBtn}
                    onPress={() => {
                        if (checkLogin(currentUserId)) {
                            setSelectedExchange(item);
                            setIsContactModalVisible(true);
                        }
                    }}
                >
                    <AtSign size={14} color="#fff" />
                    <Text style={styles.contactBtnText}>{t('exchange.contact_btn')}</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    const renderCompactItem = ({ item }: { item: CourseExchange }) => (
        <TouchableOpacity
            style={styles.compactCard}
            onPress={() => {
                if (checkLogin(currentUserId)) {
                    setSelectedExchange(item);
                    setIsContactModalVisible(true);
                }
            }}
        >
            <View style={styles.compactCourseRow}>
                <View style={[styles.compactBlock, { backgroundColor: '#F5F3FF' }]}>
                    <Text style={styles.compactCode}>{item.haveCourse}</Text>
                    <Text style={styles.compactSec}>{item.haveSection || 'Any'}</Text>
                </View>
                <ArrowLeftRight size={14} color="#8B5CF6" />
                <View style={[styles.compactBlock, { backgroundColor: '#ECFDF5' }]}>
                    <Text style={[styles.compactCode, { color: '#065F46' }]}>{item.wantCourses[0].code}</Text>
                    <Text style={[styles.compactSec, { color: '#059669' }]}>
                        {item.wantCourses[0].section || 'Any'}{item.wantCourses.length > 1 ? ` (+${item.wantCourses.length - 1})` : ''}
                    </Text>
                </View>
            </View>
            <View style={styles.compactMeta}>
                <Text style={styles.compactUser} numberOfLines={1}>{item.userName}</Text>
                <View style={styles.compactStats}>
                    <TouchableOpacity onPress={() => handleToggleLike(item.id)} style={styles.compactStatItem}>
                        <Heart size={12} color={item.isLiked ? '#EF4444' : '#9CA3AF'} fill={item.isLiked ? '#EF4444' : 'transparent'} />
                        <Text style={[styles.compactStatText, item.isLiked && { color: '#EF4444' }]}>{item.likes}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => openComments(item)} style={styles.compactStatItem}>
                        <MessageSquare size={12} color="#9CA3AF" />
                        <Text style={styles.compactStatText}>{item.commentCount}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            {/* Status Bar Background */}
            <View style={[styles.statusBarBg, { height: insets.top }]} />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => {
                    if (router.canGoBack()) {
                        router.back();
                    } else {
                        router.replace('/(tabs)/course');
                    }
                }} style={styles.backButton}>
                    <ArrowLeft size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{t('exchange.title')}</Text>
                <TouchableOpacity
                    style={styles.viewToggle}
                    onPress={() => setViewMode(viewMode === 'card' ? 'compact' : 'card')}
                >
                    {viewMode === 'card' ? <List size={20} color="#fff" /> : <Grid size={20} color="#fff" />}
                </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={styles.searchContainer}>
                <View style={styles.searchBar}>
                    <Search size={20} color="#9CA3AF" />
                    <TextInput
                        style={styles.searchInput}
                        placeholder={t('exchange.search_placeholder')}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                </View>
            </View>

            {loading ? (
                <ActivityIndicator style={{ marginTop: 40 }} color="#8B5CF6" />
            ) : (
                <FlatList
                    data={filteredExchanges}
                    keyExtractor={(item) => item.id}
                    renderItem={viewMode === 'card' ? renderExchangeItem : renderCompactItem}
                    numColumns={viewMode === 'card' ? 1 : 2}
                    key={viewMode}
                    contentContainerStyle={styles.listContent}
                    columnWrapperStyle={viewMode === 'compact' ? { gap: 12 } : undefined}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <ArrowLeftRight size={48} color="#D1D5DB" />
                            <Text style={styles.emptyText}>{t('exchange.empty_list')}</Text>
                        </View>
                    }
                />
            )}

            {/* Post FAB */}
            <TouchableOpacity
                style={styles.fab}
                onPress={() => {
                    if (checkLogin(currentUserId)) {
                        setIsPostModalVisible(true);
                    }
                }}
            >
                <Plus size={30} color="#fff" />
            </TouchableOpacity>

            <Modal visible={isPostModalVisible} animationType="slide" transparent={true}>
                <View style={{ flex: 1 }}>
                    <Pressable
                        style={[styles.modalOverlay, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }]}
                        onPress={() => setIsPostModalVisible(false)}
                    />
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
                        style={{ flex: 1, justifyContent: 'flex-end' }}
                        pointerEvents="box-none"
                    >
                        <View style={[styles.modalContent, { maxHeight: '90%' }]} onStartShouldSetResponder={() => true}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>{t('exchange.post_swap_request')}</Text>
                                <TouchableOpacity onPress={() => setIsPostModalVisible(false)}>
                                    <X size={24} color="#6B7280" />
                                </TouchableOpacity>
                            </View>

                            <ScrollView
                                style={styles.formContent}
                                contentContainerStyle={{ paddingBottom: 100 }}
                                showsVerticalScrollIndicator={false}
                                keyboardDismissMode="interactive"
                                keyboardShouldPersistTaps="handled"
                            >
                                <View style={styles.inputGroup}>
                                    <Text style={styles.inputLabel}>{t('exchange.i_have')}</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder={t('exchange.course_code')}
                                        placeholderTextColor="#9CA3AF"
                                        value={haveCourse}
                                        onChangeText={(text) => setHaveCourse(text.toUpperCase().replace(/[^A-Z0-9.]/g, ''))}
                                        autoCapitalize="characters"
                                    />
                                    <View style={styles.rowInputs}>
                                        <TouchableOpacity
                                            style={[styles.input, { flex: 1, marginRight: 10, marginTop: 10, justifyContent: 'center' }]}
                                            onPress={() => openSectionPicker('have')}
                                        >
                                            <Text style={{ color: haveSection ? '#111' : '#9CA3AF' }}>
                                                {haveSection ? `${t('exchange.section')} ${haveSection}` : t('exchange.section')}
                                            </Text>
                                        </TouchableOpacity>
                                        <TextInput
                                            style={[styles.input, { flex: 2, marginTop: 10 }]}
                                            placeholder={t('exchange.teacher')}
                                            placeholderTextColor="#9CA3AF"
                                            value={haveTeacher}
                                            onChangeText={setHaveTeacher}
                                        />
                                    </View>
                                    <TextInput
                                        style={[styles.input, { marginTop: 10 }]}
                                        placeholder={t('exchange.class_time')}
                                        placeholderTextColor="#9CA3AF"
                                        value={haveTime}
                                        onChangeText={setHaveTime}
                                    />
                                </View>

                                <View style={styles.inputGroup}>
                                    <View style={styles.sectionHeader}>
                                        <Text style={styles.inputLabel}>{t('exchange.i_want')}</Text>
                                        <TouchableOpacity onPress={addWantCourse} style={styles.addBtn}>
                                            <PlusCircle size={20} color="#8B5CF6" />
                                            <Text style={styles.addBtnText}>{t('exchange.add_course')}</Text>
                                        </TouchableOpacity>
                                    </View>

                                    {wantCourses.map((want, index) => (
                                        <View key={index} style={[styles.wantFormItem, index > 0 && { marginTop: 20, borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 20 }]}>
                                            <View style={styles.wantFormHeader}>
                                                <Text style={styles.wantFormTitle}>{t('exchange.target_course', { index: index + 1 })}</Text>
                                                {wantCourses.length > 1 && (
                                                    <TouchableOpacity onPress={() => removeWantCourse(index)}>
                                                        <Trash2 size={18} color="#EF4444" />
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                            <TextInput
                                                style={styles.input}
                                                placeholder={t('exchange.course_code')}
                                                placeholderTextColor="#9CA3AF"
                                                value={want.code}
                                                onChangeText={(text) => updateWantCourse(index, 'code', text.toUpperCase().replace(/[^A-Z0-9.]/g, ''))}
                                                autoCapitalize="characters"
                                            />
                                            <View style={styles.rowInputs}>
                                                <TouchableOpacity
                                                    style={[styles.input, { flex: 1, marginRight: 10, marginTop: 10, justifyContent: 'center' }]}
                                                    onPress={() => openSectionPicker('want', index)}
                                                >
                                                    <Text style={{ color: want.section ? '#111' : '#9CA3AF' }}>
                                                        {want.section ? `${t('exchange.section')} ${want.section}` : t('exchange.section')}
                                                    </Text>
                                                </TouchableOpacity>
                                                <TextInput
                                                    style={[styles.input, { flex: 2, marginTop: 10 }]}
                                                    placeholder={t('exchange.teacher')}
                                                    placeholderTextColor="#9CA3AF"
                                                    value={want.teacher}
                                                    onChangeText={(text) => updateWantCourse(index, 'teacher', text)}
                                                />
                                            </View>
                                            <TextInput
                                                style={[styles.input, { marginTop: 10 }]}
                                                placeholder={t('exchange.class_time')}
                                                placeholderTextColor="#9CA3AF"
                                                value={want.time}
                                                onChangeText={(text) => updateWantCourse(index, 'time', text)}
                                            />
                                        </View>
                                    ))}
                                </View>

                                <View style={styles.inputGroup}>
                                    <Text style={styles.inputLabel}>{t('exchange.contact_methods')}</Text>
                                    <View style={styles.chipContainer}>
                                        {CONTACT_PLATFORMS.map(platform => (
                                            <TouchableOpacity
                                                key={platform.value}
                                                style={[
                                                    styles.chip,
                                                    selectedMethods.includes(platform.value) && styles.chipActive
                                                ]}
                                                onPress={() => toggleMethod(platform.value)}
                                            >
                                                <Text style={styles.chipIcon}>{platform.icon}</Text>
                                                <Text style={[
                                                    styles.chipText,
                                                    selectedMethods.includes(platform.value) && styles.chipTextActive
                                                ]}>
                                                    {platform.label}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>

                                {selectedMethods.map(method => (
                                    <View key={method} style={styles.dynamicInputContainer}>
                                        <View style={styles.dynamicHeader}>
                                            <Text style={styles.dynamicLabel}>
                                                {method === 'Other' ? t('exchange.custom_platform') : `${method} ID`}
                                            </Text>
                                            <TouchableOpacity onPress={() => toggleMethod(method)}>
                                                <X size={14} color="#EF4444" />
                                            </TouchableOpacity>
                                        </View>

                                        {method === 'Other' && (
                                            <TextInput
                                                style={[styles.input, { marginBottom: 10 }]}
                                                placeholder={t('exchange.platform_name')}
                                                value={otherPlatformName}
                                                onChangeText={setOtherPlatformName}
                                            />
                                        )}

                                        <TextInput
                                            style={styles.input}
                                            placeholder={method === 'Email' ? 'example@email.com' : t('exchange.enter_id', { method: method === 'Other' ? t('exchange.enter_info') : method })}
                                            value={contactValues[method] || ''}
                                            onChangeText={(text) => setContactValues(prev => ({ ...prev, [method]: text }))}
                                            keyboardType={method === 'Email' ? 'email-address' : 'default'}
                                        />
                                    </View>
                                ))}

                                <View style={styles.inputGroup}>
                                    <Text style={styles.inputLabel}>{t('exchange.reason')}</Text>
                                    <TextInput
                                        style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                                        placeholder={t('exchange.reason_placeholder')}
                                        placeholderTextColor="#9CA3AF"
                                        multiline
                                        value={reason}
                                        onChangeText={setReason}
                                    />
                                </View>

                                <TouchableOpacity
                                    style={[styles.submitButton, submitting && { opacity: 0.7 }]}
                                    onPress={handlePostExchange}
                                    disabled={submitting}
                                >
                                    {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{t('exchange.publish_request')}</Text>}
                                </TouchableOpacity>
                                <View style={{ height: 40 }} />
                            </ScrollView>

                            {/* Inline Section Picker Overlay */}
                            {isSectionPickerVisible && (
                                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000 }]}>
                                    <Pressable style={{ flex: 1 }} onPress={() => setIsSectionPickerVisible(false)} />
                                    <View style={styles.pickerContent}>
                                        <View style={styles.pickerHeader}>
                                            <Text style={styles.pickerTitle}>{t('exchange.select_section')}</Text>
                                            <TouchableOpacity onPress={() => setIsSectionPickerVisible(false)}>
                                                <X size={24} color="#6B7280" />
                                            </TouchableOpacity>
                                        </View>
                                        <View style={styles.pickerGrid}>
                                            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => {
                                                const currentSelection = (pickerTarget?.type === 'have' ? haveSection : wantCourses[pickerTarget?.index || 0]?.section || '');
                                                const isSelected = currentSelection.split(', ').includes(num.toString());

                                                return (
                                                    <TouchableOpacity
                                                        key={num}
                                                        style={[styles.pickerItem, isSelected && styles.pickerItemActive]}
                                                        onPress={() => handleSelectSection(num.toString())}
                                                    >
                                                        <Text style={[styles.pickerItemText, isSelected && styles.pickerItemTextActive]}>{num}</Text>
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                        <TouchableOpacity
                                            style={styles.pickerConfirmBtn}
                                            onPress={() => setIsSectionPickerVisible(false)}
                                        >
                                            <Text style={styles.pickerConfirmText}>{t('exchange.confirm')}</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* Comment Modal */}
            <Modal visible={isCommentModalVisible} animationType="fade" transparent={true}>
                <View style={{ flex: 1 }}>
                    <Pressable
                        style={[styles.modalOverlay, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }]}
                        onPress={() => setIsCommentModalVisible(false)}
                    />
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                        style={{ flex: 1, justifyContent: 'flex-end' }}
                        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
                        pointerEvents="box-none"
                    >
                        <View style={styles.commentContent} onStartShouldSetResponder={() => true}>
                            <View style={styles.commentHeader}>
                                <Text style={styles.commentTitle}>Comments</Text>
                                <TouchableOpacity onPress={() => setIsCommentModalVisible(false)}>
                                    <X size={24} color="#6B7280" />
                                </TouchableOpacity>
                            </View>

                            {loadingComments ? (
                                <ActivityIndicator style={{ padding: 40 }} />
                            ) : (
                                <FlatList
                                    data={organizedComments}
                                    keyExtractor={(item) => item.id}
                                    renderItem={({ item }) => (
                                        <View style={styles.commentContainer}>
                                            <View style={styles.commentRow}>
                                                {renderAvatar(item.authorAvatar, styles.commentAvatar)}
                                                <View style={styles.commentInfo}>
                                                    <View style={styles.commentHeaderInternal}>
                                                        <Text style={styles.commentAuthor}>{item.authorName}</Text>
                                                        <TouchableOpacity onPress={() => {
                                                            setReplyTarget(item);
                                                            setTimeout(() => commentInputRef.current?.focus(), 100);
                                                        }}>
                                                            <Text style={styles.replyActionText}>{t('forum.row.replies')}</Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                    <TranslatableText style={styles.commentText} text={item.content} />
                                                    <Text style={styles.commentTime}>{new Date(item.createdAt).toLocaleString()}</Text>
                                                </View>
                                            </View>

                                            {/* Replies */}
                                            {item.replies && item.replies.length > 0 && (
                                                <View style={styles.nestedReplies}>
                                                    {item.replies.map((reply: ExchangeComment) => (
                                                        <View key={reply.id} style={styles.commentRowSmall}>
                                                            {renderAvatar(reply.authorAvatar, styles.commentAvatarSmall)}
                                                            <View style={styles.commentInfoSmall}>
                                                                <View style={styles.commentHeaderInternal}>
                                                                    <Text style={styles.commentAuthorSmall}>{reply.authorName}</Text>
                                                                    {reply.replyToName && (
                                                                        <Text style={styles.replyIndicator}> ▶ {reply.replyToName}</Text>
                                                                    )}
                                                                    <TouchableOpacity
                                                                        onPress={() => {
                                                                            setReplyTarget(reply);
                                                                            setTimeout(() => commentInputRef.current?.focus(), 100);
                                                                        }}
                                                                        style={{ marginLeft: 'auto' }}
                                                                    >
                                                                        <Text style={styles.replyActionTextSmall}>{t('forum.row.replies')}</Text>
                                                                    </TouchableOpacity>
                                                                </View>
                                                                <TranslatableText style={styles.commentTextSmall} text={reply.content} />
                                                                <Text style={styles.commentTimeSmall}>{new Date(reply.createdAt).toLocaleString()}</Text>
                                                            </View>
                                                        </View>
                                                    ))}
                                                </View>
                                            )}
                                        </View>
                                    )}
                                    contentContainerStyle={{ padding: 20 }}
                                    ListEmptyComponent={<Text style={{ textAlign: 'center', color: '#9CA3AF', margin: 40 }}>No comments yet.</Text>}
                                />
                            )}

                            {replyTarget && (
                                <View style={styles.replyBar}>
                                    <Text style={styles.replyBarText} numberOfLines={1}>
                                        {t('forum.detail.replying_to', { name: replyTarget.authorName })}: {replyTarget.content}
                                    </Text>
                                    <TouchableOpacity onPress={() => setReplyTarget(null)}>
                                        <X size={16} color="#8B5CF6" />
                                    </TouchableOpacity>
                                </View>
                            )}
                            <View style={styles.commentInputRow}>
                                <TextInput
                                    ref={commentInputRef}
                                    style={styles.commentInput}
                                    placeholder={replyTarget ? t('forum.detail.replying_to', { name: replyTarget.authorName }) : "Add a comment..."}
                                    value={newComment}
                                    onChangeText={setNewComment}
                                    multiline
                                />
                                <TouchableOpacity style={styles.sendButton} onPress={handleSendComment}>
                                    <Send size={20} color="#fff" />
                                </TouchableOpacity>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            <Modal visible={isContactModalVisible} animationType="fade" transparent={true}>
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Pressable
                        style={[styles.modalOverlay, { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }]}
                        onPress={() => setIsContactModalVisible(false)}
                    />
                    <View style={[styles.commentContent, { height: 'auto', maxHeight: '60%', width: '85%', borderRadius: 24 }]}>
                        <View style={styles.commentHeader}>
                            <Text style={styles.commentTitle}>Contact Methods</Text>
                            <TouchableOpacity onPress={() => setIsContactModalVisible(false)}>
                                <X size={24} color="#6B7280" />
                            </TouchableOpacity>
                        </View>

                        <View style={{ padding: 20 }}>
                            <Text style={styles.contactTip}>Click to copy the ID/Username</Text>
                            {selectedExchange?.contacts.map((contact, idx) => (
                                <TouchableOpacity
                                    key={idx}
                                    style={styles.contactItem}
                                    onPress={() => handleCopy(contact.value, contact.otherPlatformName || contact.platform)}
                                >
                                    <View style={styles.contactIconContainer}>
                                        <Text style={styles.contactIconText}>
                                            {CONTACT_PLATFORMS.find(p => p.value === contact.platform)?.icon || '🔗'}
                                        </Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.contactPlatformName}>
                                            {contact.otherPlatformName || contact.platform}
                                        </Text>
                                        <Text style={styles.contactValueText}>{contact.value}</Text>
                                    </View>
                                    <View style={styles.copyBadge}>
                                        <Text style={styles.copyBadgeText}>Copy</Text>
                                    </View>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    statusBarBg: {
        backgroundColor: '#1E3A8A',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 10,
        paddingHorizontal: 20,
        backgroundColor: '#1E3A8A',
        paddingBottom: 15,
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#fff',
    },
    searchContainer: {
        backgroundColor: '#1E3A8A',
        paddingHorizontal: 20,
        paddingBottom: 16,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        paddingHorizontal: 15,
        borderRadius: 12,
        height: 44,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    searchInput: {
        flex: 1,
        marginLeft: 10,
        fontSize: 15,
    },
    listContent: {
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 100,
    },
    exchangeCard: {
        backgroundColor: '#fff',
        borderRadius: 24,
        padding: 20,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 3,
        borderWidth: 1,
        borderColor: '#F3F4F6',
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
        gap: 8,
    },
    userInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    userAvatar: {
        fontSize: 28,
        width: 44,
        height: 44,
        marginRight: 12,
        borderRadius: 22,
        textAlign: 'center',
        textAlignVertical: 'center',
        lineHeight: 44,
    },
    userName: {
        fontSize: 15,
        fontWeight: '700',
        color: '#111827',
    },
    userMajor: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 1,
    },
    userNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    dotSeparator: {
        width: 3,
        height: 3,
        borderRadius: 1.5,
        backgroundColor: '#D1D5DB',
        marginHorizontal: 6,
    },
    timeTag: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F9FAFB',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    cardTime: {
        fontSize: 10,
        color: '#9CA3AF',
        marginLeft: 4,
        fontWeight: '500',
    },
    deleteBtn: {
        padding: 4,
    },
    mainExchangeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#F9FAFB',
        borderRadius: 16,
        padding: 12,
        marginBottom: 10,
    },
    courseBlock: {
        flex: 1,
    },
    haveBlock: {
        alignItems: 'flex-start',
    },
    wantBlock: {
        alignItems: 'flex-end',
    },
    blockHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    indicatorHave: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#8B5CF6',
        marginRight: 6,
    },
    indicatorWant: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#059669',
        marginRight: 6,
    },
    blockLabelHave: {
        fontSize: 10,
        fontWeight: '900',
        color: '#7C3AED',
        letterSpacing: 0.5,
        marginBottom: 4,
    },
    blockLabelWant: {
        fontSize: 10,
        fontWeight: '900',
        color: '#059669',
        letterSpacing: 0.5,
        marginBottom: 4,
    },
    courseCodeMain: {
        fontSize: 15,
        fontWeight: '800',
        color: '#111827',
        letterSpacing: -0.5,
    },
    courseCodeMainWant: {
        fontSize: 15,
        fontWeight: '800',
        color: '#065F46',
        letterSpacing: -0.5,
    },
    detailTextTiny: {
        fontSize: 11,
        color: '#6B7280',
        marginTop: 2,
        fontWeight: '500',
    },
    detailTextTinyWant: {
        fontSize: 11,
        color: '#059669',
        marginTop: 2,
        fontWeight: '500',
    },
    wantItemMini: {
        alignItems: 'flex-end',
        marginBottom: 2,
    },
    detailList: {
        gap: 6,
    },
    detailItem: {
        flexDirection: 'row',
        alignItems: 'center',
        opacity: 0.8,
    },
    detailText: {
        fontSize: 12,
        color: '#6D28D9',
        marginLeft: 6,
        fontWeight: '500',
    },
    wantItemDetail: {
        paddingVertical: 8,
    },
    wantItemDivider: {
        borderTopWidth: 1,
        borderTopColor: 'rgba(5, 150, 105, 0.1)',
        marginTop: 4,
    },
    transferIconWrapper: {
        paddingHorizontal: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    transferCircle: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#8B5CF6',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2,
    },
    transferDashedLine: {
        position: 'absolute',
        width: 1,
        height: '100%',
        backgroundColor: '#E5E7EB',
        zIndex: 1,
    },
    reasonBox: {
        marginBottom: 10,
        paddingHorizontal: 4,
    },
    reasonTitle: {
        fontSize: 11,
        fontWeight: '700',
        color: '#9CA3AF',
        marginBottom: 4,
        textTransform: 'uppercase',
    },
    reasonBody: {
        fontSize: 13,
        color: '#4B5563',
        lineHeight: 18,
    },
    cardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
        paddingTop: 10,
    },
    leftActions: {
        flexDirection: 'row',
        gap: 16,
    },
    minorAction: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    minorActionText: {
        fontSize: 12,
        color: '#9CA3AF',
        marginLeft: 6,
        fontWeight: '600',
    },
    likedAction: {
        backgroundColor: '#FEF2F2',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    likedText: {
        color: '#EF4444',
    },
    contactBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#8B5CF6',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 12,
    },
    contactBtnText: {
        fontSize: 13,
        color: '#fff',
        marginLeft: 6,
        fontWeight: '700',
    },
    viewToggle: {
        padding: 8,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 10,
    },
    compactCard: {
        flex: 1,
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#F3F4F6',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
        elevation: 2,
    },
    compactCourseRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    compactBlock: {
        flex: 1,
        padding: 8,
        borderRadius: 12,
        alignItems: 'center',
        marginHorizontal: 2,
    },
    compactCode: {
        fontSize: 13,
        fontWeight: '800',
        color: '#4B3BC3',
    },
    compactSec: {
        fontSize: 10,
        fontWeight: '600',
        color: '#7C3AED',
        marginTop: 2,
    },
    compactMeta: {
        borderTopWidth: 1,
        borderTopColor: '#F9FAFB',
        paddingTop: 10,
        flexDirection: 'column',
        gap: 6,
    },
    compactUser: {
        fontSize: 12,
        fontWeight: '600',
        color: '#374151',
    },
    compactStats: {
        flexDirection: 'row',
        gap: 12,
    },
    compactStatItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    compactStatText: {
        fontSize: 11,
        color: '#9CA3AF',
        marginLeft: 4,
        fontWeight: '600',
    },
    fab: {
        position: 'absolute',
        bottom: 30,
        right: 20,
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#8B5CF6',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#8B5CF6',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 8,
    },
    emptyContainer: {
        alignItems: 'center',
        paddingTop: 100,
    },
    emptyText: {
        marginTop: 16,
        fontSize: 15,
        color: '#9CA3AF',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        padding: 24,
        maxHeight: '90%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    modalTitle: {
        fontSize: 24,
        fontWeight: '800',
        color: '#111827',
    },
    formContent: {
    },
    inputGroup: {
        marginBottom: 24,
        backgroundColor: '#F9FAFB',
        padding: 16,
        borderRadius: 20,
    },
    inputLabel: {
        fontSize: 12,
        fontWeight: '800',
        color: '#8B5CF6',
        marginBottom: 12,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    input: {
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 14,
        padding: 14,
        fontSize: 15,
        color: '#111827',
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    addBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F5F3FF',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 10,
    },
    addBtnText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#8B5CF6',
        marginLeft: 6,
    },
    wantFormItem: {
        backgroundColor: '#fff',
        paddingVertical: 4,
    },
    wantFormHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    wantFormTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#374151',
    },
    rowInputs: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
    },
    chipContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    chipActive: {
        backgroundColor: '#8B5CF6',
        borderColor: '#8B5CF6',
    },
    chipIcon: {
        fontSize: 14,
        marginRight: 6,
    },
    chipText: {
        fontSize: 13,
        color: '#4B5563',
        fontWeight: '600',
    },
    chipTextActive: {
        color: '#fff',
    },
    dynamicInputContainer: {
        backgroundColor: '#F5F3FF',
        padding: 16,
        borderRadius: 16,
        marginBottom: 16,
    },
    dynamicHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    dynamicLabel: {
        fontSize: 11,
        fontWeight: '800',
        color: '#7C3AED',
    },
    submitButton: {
        backgroundColor: '#8B5CF6',
        paddingVertical: 20,
        borderRadius: 20,
        alignItems: 'center',
        marginTop: 16,
        shadowColor: '#8B5CF6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    submitText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    commentOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    commentOverlayTouchable: {
        ...StyleSheet.absoluteFillObject,
    },
    commentContent: {
        backgroundColor: '#fff',
        width: '100%',
        height: '75%',
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        overflow: 'hidden',
    },
    commentHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingVertical: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    commentTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#111827',
    },
    commentContainer: {
        marginBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
        paddingBottom: 16,
    },
    commentRow: {
        flexDirection: 'row',
        marginBottom: 8,
    },
    commentRowSmall: {
        flexDirection: 'row',
        marginBottom: 12,
    },
    commentHeaderInternal: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    replyActionText: {
        fontSize: 12,
        color: '#8B5CF6',
        fontWeight: '700',
    },
    replyActionTextSmall: {
        fontSize: 11,
        color: '#8B5CF6',
        fontWeight: '700',
    },
    nestedReplies: {
        marginLeft: 48,
        marginTop: 12,
        paddingLeft: 12,
        borderLeftWidth: 2,
        borderLeftColor: '#F3F4F6',
    },
    replyIndicator: {
        fontSize: 12,
        color: '#9CA3AF',
        marginHorizontal: 4,
    },
    commentAvatarSmall: {
        fontSize: 18,
        width: 28,
        height: 28,
        marginRight: 10,
        borderRadius: 14,
        textAlign: 'center',
        lineHeight: 28,
        backgroundColor: '#F3F4F6',
    },
    commentInfoSmall: {
        flex: 1,
        backgroundColor: '#F9FAFB',
        padding: 12,
        borderRadius: 16,
    },
    commentAuthorSmall: {
        fontSize: 12,
        fontWeight: '700',
        color: '#111827',
    },
    commentTextSmall: {
        fontSize: 13,
        color: '#374151',
        lineHeight: 18,
    },
    commentTimeSmall: {
        fontSize: 9,
        color: '#9CA3AF',
        marginTop: 4,
    },
    replyBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#F5F3FF',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: '#E9E4FF',
    },
    replyBarText: {
        fontSize: 12,
        color: '#7C3AED',
        flex: 1,
        marginRight: 10,
    },
    commentAvatar: {
        fontSize: 24,
        width: 36,
        height: 36,
        marginRight: 12,
        borderRadius: 18,
        textAlign: 'center',
        lineHeight: 36,
    },
    commentInfo: {
        flex: 1,
        backgroundColor: '#F9FAFB',
        padding: 16,
        borderRadius: 20,
    },
    commentAuthor: {
        fontSize: 13,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 4,
    },
    commentText: {
        fontSize: 14,
        color: '#374151',
        lineHeight: 22,
    },
    commentTime: {
        fontSize: 10,
        color: '#9CA3AF',
        marginTop: 8,
        fontWeight: '500',
    },
    commentInputRow: {
        flexDirection: 'row',
        padding: 20,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
        alignItems: 'center',
    },
    commentInput: {
        flex: 1,
        backgroundColor: '#F3F4F6',
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginRight: 12,
        fontSize: 15,
    },
    sendButton: {
        backgroundColor: '#8B5CF6',
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#8B5CF6',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
    },
    contactTip: {
        fontSize: 14,
        color: '#6B7280',
        marginBottom: 20,
        textAlign: 'center',
        fontWeight: '500',
    },
    contactItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        padding: 16,
        borderRadius: 20,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#F3F4F6',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 4,
    },
    contactIconContainer: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#F5F3FF',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    contactIconText: {
        fontSize: 20,
    },
    contactPlatformName: {
        fontSize: 11,
        fontWeight: '800',
        color: '#8B5CF6',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    contactValueText: {
        fontSize: 16,
        color: '#111827',
        fontWeight: '700',
        marginTop: 2,
    },
    copyBadge: {
        backgroundColor: '#F5F3FF',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
    },
    copyBadgeText: {
        fontSize: 12,
        color: '#8B5CF6',
        fontWeight: '800',
    },
    // Section Picker Styles
    pickerOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    pickerContent: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        paddingBottom: 40,
    },
    pickerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    pickerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111827',
    },
    pickerGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    pickerItem: {
        width: '30%',
        aspectRatio: 1,
        backgroundColor: '#F3F4F6',
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    pickerItemText: {
        fontSize: 20,
        fontWeight: '600',
        color: '#111827',
    },
    pickerItemActive: {
        backgroundColor: '#8B5CF6',
    },
    pickerItemTextActive: {
        color: '#fff',
    },
    pickerConfirmBtn: {
        backgroundColor: '#8B5CF6',
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
        marginTop: 10,
    },
    pickerConfirmText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
});

