import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Image as ImageIcon, X } from 'lucide-react-native';
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
    View,
} from 'react-native';
import { Toast, ToastType } from '../../components/campus/Toast';
import { getCurrentUser } from '../../services/auth';
import { createForumPost, uploadForumImage } from '../../services/forum';
import { ForumCategory } from '../../types';


export default function ForumComposeScreen() {
    const { t } = useTranslation();
    const router = useRouter();

    const CATEGORIES: { id: ForumCategory; label: string }[] = [
        { id: 'general', label: t('forum.compose.category_label.general') },
        { id: 'activity', label: t('forum.compose.category_label.activity') },
        { id: 'guide', label: t('forum.compose.category_label.guide') },
        { id: 'lost_found', label: t('forum.compose.category_label.lost_found') },
    ];

    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [category, setCategory] = useState<ForumCategory>('general');
    const [images, setImages] = useState<string[]>([]);
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
            quality: 0.8,
        });
        if (!result.canceled) {
            setImages(prev => [...prev, ...result.assets.map(a => a.uri)].slice(0, 9));
        }
    };

    const removeImage = (i: number) => setImages(prev => prev.filter((_, idx) => idx !== i));

    const handleSubmit = async () => {
        if (!title.trim()) { showToast(t('forum.compose.error_title')); return; }
        if (title.length > 30) { showToast(t('forum.compose.error_title_long')); return; }
        if (!content.trim()) { showToast(t('forum.compose.error_content')); return; }

        try {
            setSubmitting(true);
            const user = await getCurrentUser();
            if (!user) { showToast(t('forum.compose.error_login')); return; }

            const uploadedUrls: string[] = [];
            for (const uri of images) {
                const url = await uploadForumImage(uri);
                uploadedUrls.push(url);
            }

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
                <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
                    <X size={24} color="#374151" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{t('forum.compose.title')}</Text>
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

            <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
                {/* Category chips */}
                <View style={styles.categoryRow}>
                    {CATEGORIES.map(cat => (
                        <TouchableOpacity
                            key={cat.id}
                            style={[styles.catChip, category === cat.id && styles.catChipActive]}
                            onPress={() => setCategory(cat.id)}
                        >
                            <Text style={[styles.catChipText, category === cat.id && styles.catChipTextActive]}>
                                {cat.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
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
                        autoFocus
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
                        <View key={i} style={styles.imageThumb}>
                            <Image source={{ uri }} style={styles.thumbImg} />
                            <TouchableOpacity style={styles.removeBtn} onPress={() => removeImage(i)}>
                                <X size={12} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    ))}
                    {images.length < 9 && (
                        <TouchableOpacity style={styles.addImageBox} onPress={pickImage}>
                            <ImageIcon size={32} color="#9CA3AF" />
                            <Text style={styles.addImageText}>{t('forum.compose.add_media')}</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </ScrollView>

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
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'ios' ? 56 : 16,
        paddingBottom: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#F0F2F8',
    },
    closeBtn: { padding: 4 },
    headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
    publishBtn: {
        backgroundColor: '#1E3A8A',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        minWidth: 90,
        alignItems: 'center',
    },
    publishBtnDisabled: { backgroundColor: '#D1D5DB' },
    publishText: { color: '#fff', fontWeight: '700', fontSize: 14 },

    form: { padding: 20, paddingBottom: 60 },

    categoryRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 20,
        flexWrap: 'wrap',
    },
    catChip: {
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 16,
        backgroundColor: '#F4F6FB',
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    catChipActive: { backgroundColor: '#1E3A8A', borderColor: '#1E3A8A' },
    catChipText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
    catChipTextActive: { color: '#fff' },

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
});
