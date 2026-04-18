import { useRouter } from 'expo-router';
import { Camera, ChevronLeft, Star, X } from 'lucide-react-native';
import React, { useState } from 'react';
import {
    Alert,
    Dimensions,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafetyNotice } from '../../components/common/SafetyNotice';
import { getCurrentUser } from '../../services/auth';

const { width } = Dimensions.get('window');

// Mock locations
const LOCATIONS = [
    'Main Canteen',
    'Pacific Coffee',
    'BU Fiesta',
    'Renfrew Canteen',
    'Grab & Go',
    'Starbucks',
    'Ebeneezer\'s'
];

export default function AddFoodScreen() {
    const router = useRouter();
    const [title, setTitle] = useState('');
    const [location, setLocation] = useState('');
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState('');
    const [imageUri, setImageUri] = useState<string | null>(null);

    // Mock Image Picker
    const handlePickImage = () => {
        Alert.alert(
            'Select Photo',
            'Choose a photo source',
            [
                {
                    text: 'Camera',
                    onPress: () => setImageUri('https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80')
                },
                {
                    text: 'Gallery',
                    onPress: () => setImageUri('https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=800&q=80')
                },
                { text: 'Cancel', style: 'cancel' }
            ]
        );
    };

    const handleSubmit = async () => {
        const user = await getCurrentUser();
        if (!user) {
            Alert.alert('Session Error', 'You must be logged in');
            return;
        }

        if (!title || !location || !imageUri) {
            Alert.alert('Missing Information', 'Please provide a photo, title, and location.');
            return;
        }

        // Mock Submission
        Alert.alert('Success', 'Food post shared successfully!', [
            { text: 'OK', onPress: () => router.back() }
        ]);
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerRow}>
                    <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                        <ChevronLeft size={24} color="#1F2937" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Share Food</Text>
                    <View style={{ width: 28 }} />
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.content}>

                {/* Image Upload */}
                <TouchableOpacity style={styles.imageUpload} onPress={handlePickImage}>
                    {imageUri ? (
                        <>
                            <Image source={{ uri: imageUri }} style={styles.uploadedImage} />
                            <TouchableOpacity
                                style={styles.removeImageButton}
                                onPress={(e) => {
                                    e.stopPropagation();
                                    setImageUri(null);
                                }}
                            >
                                <X size={16} color="#fff" />
                            </TouchableOpacity>
                        </>
                    ) : (
                        <View style={styles.uploadPlaceholder}>
                            <Camera size={40} color="#9CA3AF" />
                            <Text style={styles.uploadText}>Add Photo</Text>
                        </View>
                    )}
                </TouchableOpacity>

                {/* Form Fields */}
                <View style={styles.formGroup}>
                    <Text style={styles.label}>Title</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="What's this dish?"
                        value={title}
                        onChangeText={setTitle}
                        maxLength={50}
                    />
                </View>

                <View style={styles.formGroup}>
                    <Text style={styles.label}>Location</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
                        {LOCATIONS.map((loc) => (
                            <TouchableOpacity
                                key={loc}
                                style={[
                                    styles.locationChip,
                                    location === loc && styles.locationChipActive
                                ]}
                                onPress={() => setLocation(loc)}
                            >
                                <Text style={[
                                    styles.locationChipText,
                                    location === loc && styles.locationChipTextActive
                                ]}>{loc}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    {/* Fallback input when the preset chips do not fit */}
                </View>

                <View style={styles.formGroup}>
                    <Text style={styles.label}>Rating</Text>
                    <View style={styles.ratingContainer}>
                        {[1, 2, 3, 4, 5].map((star) => (
                            <TouchableOpacity
                                key={star}
                                onPress={() => setRating(star)}
                                style={styles.starButton}
                            >
                                <Star
                                    size={32}
                                    color={star <= rating ? "#F59E0B" : "#E5E7EB"}
                                    fill={star <= rating ? "#F59E0B" : "none"}
                                />
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                <View style={styles.formGroup}>
                    <Text style={styles.label}>Review</Text>
                    <TextInput
                        style={[styles.input, styles.textArea]}
                        placeholder="How was it? Spicy? Sweet?"
                        value={comment}
                        onChangeText={setComment}
                        multiline
                        textAlignVertical="top"
                    />
                </View>

                <SafetyNotice variant="full" />

            </ScrollView>

            {/* Footer */}
            <View style={styles.footer}>
                <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
                    <Text style={styles.submitText}>Post Review</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    header: {
        paddingTop: 56,
        paddingBottom: 16,
        paddingHorizontal: 20,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    headerRow: {
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
        color: '#111827',
    },
    content: {
        padding: 20,
    },
    imageUpload: {
        width: '100%',
        height: 200,
        backgroundColor: '#F9FAFB',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderStyle: 'dashed',
        marginBottom: 24,
        overflow: 'hidden',
    },
    uploadPlaceholder: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    uploadText: {
        marginTop: 8,
        color: '#9CA3AF',
        fontSize: 14,
    },
    uploadedImage: {
        width: '100%',
        height: '100%',
    },
    removeImageButton: {
        position: 'absolute',
        top: 8,
        right: 8,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRadius: 12,
        padding: 4,
    },
    formGroup: {
        marginBottom: 24,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: '#374151',
        marginBottom: 8,
    },
    input: {
        backgroundColor: '#F9FAFB',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 12,
        padding: 12,
        fontSize: 16,
        color: '#111827',
    },
    textArea: {
        height: 100,
    },
    chipsScroll: {
        flexDirection: 'row',
    },
    locationChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: '#F3F4F6',
        borderRadius: 20,
        marginRight: 8,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    locationChipActive: {
        backgroundColor: '#FFFBEB',
        borderColor: '#F59E0B',
    },
    locationChipText: {
        fontSize: 14,
        color: '#6B7280',
    },
    locationChipTextActive: {
        color: '#D97706',
        fontWeight: '600',
    },
    ratingContainer: {
        flexDirection: 'row',
        gap: 8,
    },
    starButton: {
        padding: 4,
    },
    footer: {
        padding: 20,
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
        backgroundColor: '#fff',
    },
    submitButton: {
        backgroundColor: '#F59E0B',
        paddingVertical: 14,
        borderRadius: 16,
        alignItems: 'center',
    },
    submitText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16,
    },
});
