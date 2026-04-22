import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image as ImageIcon, X, MessageCircle, Calendar, BookOpen, ShoppingBag, Users, Heart, Search, HelpCircle } from 'lucide-react-native';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ActivityIndicator,
    Dimensions,
    Image,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Toast, ToastType } from '../../components/campus/Toast';
import { SafetyNotice } from '../../components/common/SafetyNotice';
import { ZoomableImageCarousel } from '../../components/common/ZoomableImageCarousel';
import { getCurrentUser } from '../../services/auth';
import { createForumPost, uploadForumImage } from '../../services/forum';
import { ForumCategory } from '../../types';

const SCREEN_W = Dimensions.get('window').width;
const PREVIEW_SIZE = Math.floor((SCREEN_W - 40 - 16) / 3);

export default function ForumComposeScreen() {
    const { t } = useTranslation();
    const router = useRouter();

    const SECTIONS = [
        { id: 'general', label: t('forum.sections.general'), icon: MessageCircle, color: '#6366F1' },
        { id: 'activity', label: t('forum.sections.activity'), icon: Calendar, color: '#3B82F6' },
        { id: 'guide', label: t('forum.sections.guide'), icon: BookOpen, color: '#10B981' },
        { id: 'help', label: t('forum.sections.help'), icon: HelpCircle, color: '#F59E00' },
        { id: 'lost_found', label: t('forum.sections.lost_found'), icon: Search, color: '#EF4444' },
        { id: 'marketplace', label: t('forum.sections.marketplace'), icon: ShoppingBag, color: '#EC4899' },
        { id: 'teaming', label: t('forum.sections.teaming'), icon: Users, color: '#8B5CF6' },
        { id: 'confession', label: t('forum.sections.confession'), icon: Heart, color: '#EF4444' },
    ] as const;

    const { category: paramCategory } = useLocalSearchParams<{ category?: string }>();
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [category, setCategory] = useState<ForumCategory>(
        (paramCategory && SECTIONS.some(s => s.id === paramCategory)) 
            ? (paramCategory as ForumCategory) 
            : 'general'
    );
    const [images, setImages] = useState<string[]>([]);
    const [previewVisible, setPreviewVisible] = useState(false);
    const [previewIndex, setPreviewIndex] = useState<number | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [toast, setToast] = useState<{ visible: boolean; message: string; type: ToastType }>({
        visible: false, message: '', type: 'success',
    });

    const showToast = (message: string, type: ToastType = 'error') =>
        setToast({ visible: true, message, type });

    const pickImage = async () => {
        if (images.length >= 9) {
            showToast(t('forum.compose.max_images')); return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsMultipleSelection: true,
            selectionLimit: 9 - images.length,
            quality: 0.5,
        });
        if (!result.canceled) {
            setImages(prev => [...prev, ...result.assets.map(a => a.uri)].slice(0, 9));
        }
    };

    const removeImage = (i: number) => setImages(prev => prev.filter((_, idx) => idx !== i));

    const openPreview = (index: number) => {
        setPreviewIndex(index);
        setPreviewVisible(true);
    };

    const closePreview = () => {
        setPreviewVisible(false);
        setPreviewIndex(null);
    };

    const handleSubmit = async () => {
        if (!title.trim()) { showToast(t('forum.compose.error_title')); return; }
        if (title.length > 30) { showToast(t('forum.compose.error_title_long')); return; }
        if (!content.trim()) { showToast(t('forum.compose.error_content')); return; }

        try {
            setSubmitting(true);
            const user = await getCurrentUser();
            if (!user) { showToast(t('forum.compose.error_login')); return; }

            const uploadedUrls = await Promise.all(
                images.map(uri => uploadForumImage(uri))
            );

            await createForumPost({
                authorId: user.uid,
                authorName: user.displayName || t('common.anonymous'),
                authorEmail: (user as any).email,
                authorAvatar: user.avatarUrl || undefined,
                title: title.trim(),
                content: content.trim(),
                category,
                images: uploadedUrls,
            });

            showToast(t('forum.compose.success'), 'success');
            setTimeout(() => router.back(), 1200);
        } catch (e: any) {
            showToast(e.message || t('common.error'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.root}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerSide}>
                    <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
                        <X size={24} color="#374151" />
                    </TouchableOpacity>
                </View>

                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>{t('forum.compose.title')}</Text>
                </View>

                <View style={[styles.headerSide, { alignItems: 'flex-end' }]}>
                    <TouchableOpacity
                        style={[styles.publishBtn, (!title.trim() || !content.trim() || submitting) && styles.publishBtnDisabled]}
                        onPress={handleSubmit}
                        disabled={!title.trim() || !content.trim() || submitting}
                    >
                        {submitting
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <Text style={styles.publishText}>{t('forum.compose.publish')}</Text>
                        }
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
                {/* Category chips */}
                {/* Category Grid */}
                <View style={styles.categoryGrid}>
                    {SECTIONS.map(item => {
                        const Icon = item.icon;
                        const isSelected = category === item.id;
                        return (
                            <TouchableOpacity
                                key={item.id}
                                style={[styles.gridItem, isSelected && { backgroundColor: '#F0F4FF', borderColor: item.color, borderWidth: 1.5 }]}
                                onPress={() => setCategory(item.id)}
                            >
                                <View style={[styles.iconBox, { backgroundColor: isSelected ? item.color : '#F3F4F6' }]}>
                                    <Icon size={20} color={isSelected ? '#fff' : '#6B7280'} />
                                </View>
                                <Text style={[styles.gridLabel, isSelected && { color: '#1E3A8A', fontWeight: 'bold' }]}>
                                    {t(`forum.compose.category_label.${item.id}`)}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>


                {/* Title input */}
                <View style={styles.titleContainer}>
                    <TextInput
                        style={styles.titleInput}
                        placeholder={t('forum.compose.placeholder_title')}
                        placeholderTextColor="#C4C9D4"
                        value={title}
                        onChangeText={setTitle}
                        multiline
                        maxLength={30}
                    />
                    <Text style={[styles.charCount, title.length >= 30 && styles.charCountMax]}>
                        {title.length}/30
                    </Text>
                </View>

                <View style={styles.divider} />

                {/* Supplement content */}
                <TextInput
                    style={styles.contentInput}
                    placeholder={t('forum.compose.placeholder_content')}
                    placeholderTextColor="#C4C9D4"
                    value={content}
                    onChangeText={setContent}
                    multiline
                />

                {/* Image grid */}
                <View style={styles.imageGrid}>
                    {images.map((uri, i) => (
                        <Pressable
                            key={i}
                            style={styles.imageThumb}
                            onPress={() => openPreview(i)}
                        >
                            <Image source={{ uri }} style={styles.thumbImg} />
                            <Pressable
                                style={styles.removeBtn}
                                hitSlop={6}
                                onPress={(event) => {
                                    event.stopPropagation();
                                    removeImage(i);
                                }}
                            >
                                <X size={12} color="#fff" />
                            </Pressable>
                        </Pressable>
                    ))}
                    {images.length < 9 && (
                        <TouchableOpacity style={styles.addImageBox} onPress={pickImage}>
                            <ImageIcon size={32} color="#9CA3AF" />
                            <Text style={styles.addImageText}>{t('forum.compose.add_media')}</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Community Safety Notice moved to bottom to emphasize content */}
                <View style={{ marginTop: 24, marginBottom: 40, paddingHorizontal: 20 }}>
                    <SafetyNotice variant="full" />
                </View>
            </ScrollView>

            {previewVisible && previewIndex !== null && images[previewIndex] && (
                <View style={styles.previewOverlay}>
                    <ZoomableImageCarousel
                        images={images}
                        width={SCREEN_W}
                        height={SCREEN_W}
                        contentFit="contain"
                        previewMode="standalone"
                        externalViewerIndex={previewIndex}
                        onViewerRequestClose={closePreview}
                    />
                </View>
            )}

            <Toast
                visible={toast.visible}
                message={toast.message}
                type={toast.type}
                onHide={() => setToast(p => ({ ...p, visible: false }))}
            />
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#fff' },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'ios' ? 44 : 0, // Adjusted for standard status bar height in flex flow
        height: Platform.OS === 'ios' ? 94 : 64, // (44+50) or constant height
        borderBottomWidth: 1,
        borderBottomColor: '#F0F2F8',
    },
    headerSide: {
        flex: 1,
        justifyContent: 'center',
    },
    headerCenter: {
        flex: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    closeBtn: { padding: 4 },
    headerTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: '#111827',
        textAlign: 'center',
    },
    publishBtn: {
        backgroundColor: '#1E3A8A',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 18,
        minWidth: 70,
        alignItems: 'center',
    },
    publishBtnDisabled: { backgroundColor: '#D1D5DB' },
    publishText: { color: '#fff', fontWeight: '700', fontSize: 14 },

    form: { padding: 20, paddingBottom: 60 },

    categoryGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: 10,
        paddingVertical: 12,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
        justifyContent: 'space-between',
    },
    gridItem: {
        width: (SCREEN_W - 20 - 45) / 4,
        alignItems: 'center',
        paddingVertical: 10,
        borderRadius: 12,
        marginBottom: 4,
    },
    iconBox: {
        width: 38,
        height: 38,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 6,
    },
    gridLabel: {
        fontSize: 11,
        color: '#4B5563',
        fontWeight: '500',
    },

    titleContainer: {
        minHeight: 80,
        position: 'relative',
    },
    titleInput: {
        fontSize: 20,
        fontWeight: '600',
        color: '#111827',
        textAlignVertical: 'top',
        lineHeight: 28,
        paddingBottom: 25,
    },
    charCount: {
        position: 'absolute',
        right: 0,
        bottom: 0,
        fontSize: 12,
        color: '#9CA3AF',
    },
    charCountMax: {
        color: '#EF4444',
    },
    divider: { height: 1, backgroundColor: '#F0F2F8', marginVertical: 16 },
    contentInput: {
        fontSize: 15,
        color: '#374151',
        minHeight: 80,
        textAlignVertical: 'top',
        lineHeight: 22,
        marginBottom: 20,
    },

    imageGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    imageThumb: {
        width: 100,
        height: 100,
        borderRadius: 10,
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: '#F3F4F6',
    },
    thumbImg: { width: '100%', height: '100%' },
    removeBtn: {
        position: 'absolute',
        top: 4, right: 4,
        width: 20, height: 20,
        borderRadius: 10,
        zIndex: 2,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    addImageBox: {
        width: 100,
        height: 100,
        borderRadius: 10,
        backgroundColor: '#F4F6FB',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    addImageText: { fontSize: 11, color: '#9CA3AF', textAlign: 'center' },
    previewOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#000',
        zIndex: 1000,
    },
});
