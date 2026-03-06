import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image as ImageIcon, MapPin, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ActivityIndicator,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { Toast, ToastType } from '../../components/campus/Toast';
import { getCurrentUser } from '../../services/auth';
import { createPost, uploadPostImage } from '../../services/campus';
import { PostCategory } from '../../types';
import { getNearestBuilding } from '../../utils/location';

export default function ComposeScreen() {
    const { t } = useTranslation();
    const CATEGORIES: { id: PostCategory; label: string }[] = [
        { id: 'Events', label: t('campus.categories.events') },
        { id: 'Reviews', label: t('campus.categories.reviews') },
        { id: 'Guides', label: t('campus.categories.guides') },
        { id: 'Lost & Found', label: t('campus.categories.lost_found') },
    ];
    const router = useRouter();
    const params = useLocalSearchParams();
    const { lat, lng, fromMap } = params;

    const buildingName = (fromMap === 'true' && lat && lng)
        ? getNearestBuilding(parseFloat(lat as string), parseFloat(lng as string))
        : null;

    const [content, setContent] = useState('');
    const [category, setCategory] = useState<PostCategory>('Events');
    const [images, setImages] = useState<string[]>([]);
    const [isAnonymous, setIsAnonymous] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [toast, setToast] = useState<{ visible: boolean; message: string; type: ToastType }>({
        visible: false,
        message: '',
        type: 'success'
    });

    const showToast = (message: string, type: ToastType = 'success') => {
        setToast({ visible: true, message, type });
    };

    const pickImage = async () => {
        if (images.length >= 3) {
            showToast('You can only upload up to 3 images', 'error');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.5,
            selectionLimit: 3 - images.length,
        });

        if (!result.canceled) {
            const newImages = result.assets.map(asset => asset.uri);
            setImages(prev => [...prev, ...newImages].slice(0, 3));
        }
    };

    const removeImage = (index: number) => {
        setImages(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async () => {
        if (!content.trim()) {
            showToast('Please enter some content', 'error');
            return;
        }

        try {
            setSubmitting(true);
            const user = await getCurrentUser();
            if (!user) {
                showToast('You must be logged in to post', 'error');
                return;
            }

            const uploadedUrls = await Promise.all(
                images.map(imgUri => uploadPostImage(imgUri))
            );

            await createPost({
                authorId: user.uid,
                authorName: user.displayName || 'Anonymous',
                authorEmail: (user as any).email,
                authorMajor: (user as any).major || 'Student',
                authorAvatar: user.avatarUrl || undefined,
                content: content.trim(),
                category,
                images: uploadedUrls,
                isAnonymous,
                location: fromMap === 'true' && lat && lng ? {
                    lat: parseFloat(lat as string),
                    lng: parseFloat(lng as string),
                    name: buildingName || 'Pin Location'
                } : undefined
            });

            showToast(t('campus.modals.post_success')); // Corrected key
            setTimeout(() => {
                router.back();
            }, 1500);
        } catch (error: any) {
            console.error('Submit error:', error);
            showToast(error.message || t('campus.modals.post_error'), 'error');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
                    <X size={24} color="#374151" />
                </TouchableOpacity>
                <Text style={styles.title}>{t('map.alerts.create_post_title')}</Text>
                <TouchableOpacity
                    style={[styles.publishButton, (!content.trim() || submitting) && styles.publishButtonDisabled]}
                    onPress={handleSubmit}
                    disabled={!content.trim() || submitting}
                >
                    {submitting ? (
                        <ActivityIndicator color="#fff" size="small" />
                    ) : (
                        <Text style={styles.publishText}>{t('map.modal.post')}</Text>
                    )}
                </TouchableOpacity>
            </View>

            {fromMap === 'true' && lat && lng && (
                <View style={styles.locationBadge}>
                    <MapPin size={14} color="#1E3A8A" />
                    <Text style={styles.locationBadgeText}>
                        {buildingName ? `At ${buildingName}` : 'Location Attached'}
                    </Text>
                </View>
            )}

            <ScrollView contentContainerStyle={styles.form}>
                {/* Category Selection */}
                <View style={styles.categoryContainer}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {CATEGORIES.map((cat) => (
                            <TouchableOpacity
                                key={cat.id}
                                style={[
                                    styles.categoryButton,
                                    category === cat.id && styles.categoryButtonActive
                                ]}
                                onPress={() => setCategory(cat.id)}
                            >
                                <Text style={[
                                    styles.categoryText,
                                    category === cat.id && styles.categoryTextActive
                                ]}>{cat.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                {/* Input Area */}
                <TextInput
                    style={styles.input}
                    placeholder={t('map.modal.comment_placeholder')}
                    multiline
                    value={content}
                    onChangeText={setContent}
                    placeholderTextColor="#9CA3AF"
                    autoFocus
                />

                {/* Image Previews */}
                {images.length > 0 && (
                    <View style={styles.imagesGrid}>
                        {images.map((uri, index) => (
                            <View key={index} style={styles.imagePreviewContainer}>
                                <Image source={{ uri }} style={styles.imagePreview} />
                                <TouchableOpacity
                                    style={styles.removeImageButton}
                                    onPress={() => removeImage(index)}
                                >
                                    <X size={16} color="#fff" />
                                </TouchableOpacity>
                            </View>
                        ))}
                        {images.length < 3 && (
                            <TouchableOpacity style={styles.addImageMini} onPress={pickImage}>
                                <ImageIcon size={24} color="#9CA3AF" />
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {/* Footer Options */}
                <View style={styles.footerOptions}>
                    <TouchableOpacity
                        style={[styles.optionButton, images.length >= 3 && styles.optionButtonDisabled]}
                        onPress={pickImage}
                        disabled={images.length >= 3}
                    >
                        <ImageIcon size={24} color={images.length >= 3 ? "#E5E7EB" : "#1E3A8A"} />
                        <Text style={[styles.optionText, images.length >= 3 && styles.optionTextDisabled]}>
                            {t('map.modal.add_image')} ({images.length}/3)
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.optionButton}
                        onPress={() => setIsAnonymous(!isAnonymous)}
                    >
                        <View style={[styles.checkbox, isAnonymous && styles.checkboxActive]}>
                            {isAnonymous && <View style={styles.checkboxInner} />}
                        </View>
                        <Text style={styles.optionText}>{t('teachers.anonymous_student')}</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>

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
        backgroundColor: '#fff',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    closeButton: {
        padding: 4,
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#111827',
    },
    publishButton: {
        backgroundColor: '#1E3A8A',
        paddingHorizontal: 20,
        paddingVertical: 8,
        borderRadius: 20,
        minWidth: 80,
        alignItems: 'center',
    },
    publishButtonDisabled: {
        backgroundColor: '#E5E7EB',
    },
    publishText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14,
    },
    form: {
        padding: 20,
    },
    categoryContainer: {
        marginBottom: 20,
    },
    categoryButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#F3F4FB',
        marginRight: 10,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    categoryButtonActive: {
        backgroundColor: '#1E3A8A',
        borderColor: '#1E3A8A',
    },
    categoryText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#6B7280',
    },
    categoryTextActive: {
        color: '#fff',
    },
    input: {
        fontSize: 18,
        color: '#111827',
        minHeight: 150,
        textAlignVertical: 'top',
        lineHeight: 26,
    },
    imagesGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: 10,
    },
    imagePreviewContainer: {
        width: '31%',
        aspectRatio: 1,
        borderRadius: 8,
        overflow: 'hidden',
        marginRight: '2%',
        marginBottom: 10,
        position: 'relative',
        backgroundColor: '#F3F4F6',
    },
    imagePreview: {
        width: '100%',
        height: '100%',
    },
    addImageMini: {
        width: '31%',
        aspectRatio: 1,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderStyle: 'dashed',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 10,
    },
    removeImageButton: {
        position: 'absolute',
        top: 4,
        right: 4,
        backgroundColor: 'rgba(0,0,0,0.5)',
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },
    footerOptions: {
        flexDirection: 'row',
        marginTop: 30,
        paddingTop: 20,
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    optionButton: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    optionButtonDisabled: {
        opacity: 0.5,
    },
    optionText: {
        marginLeft: 8,
        fontSize: 14,
        color: '#4B5563',
        fontWeight: '500',
    },
    optionTextDisabled: {
        color: '#9CA3AF',
    },
    checkbox: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: '#1E3A8A',
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxActive: {
        backgroundColor: '#fff',
    },
    checkboxInner: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#1E3A8A',
    },
    locationBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EFF6FF',
        paddingHorizontal: 12,
        paddingVertical: 6,
        marginHorizontal: 20,
        marginTop: 10,
        borderRadius: 12,
        gap: 6,
        alignSelf: 'flex-start',
    },
    locationBadgeText: {
        fontSize: 12,
        color: '#1E3A8A',
        fontWeight: '500',
    },
});
