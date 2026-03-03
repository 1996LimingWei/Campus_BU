import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Building, Camera, ChevronLeft, Navigation, Share2 } from 'lucide-react-native';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    BackHandler,
    Dimensions,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
// Import from data directly
import { CAMPUS_BUILDINGS } from '../../data/buildings';
import { getBuildings } from '../../services/buildings';
import { CampusLocation } from '../../types';

const { width, height } = Dimensions.get('window');

export default function BuildingDetail() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const navigation = useNavigation();
    const [photos, setPhotos] = useState<string[]>([]); // User uploaded photos
    const [isMapModalVisible, setIsMapModalVisible] = useState(false);
    const [building, setBuilding] = useState<CampusLocation | undefined>(CAMPUS_BUILDINGS.find(b => b.id === id));
    const [loading, setLoading] = useState(true);

    const goBackToClassroom = () => {
        router.replace('/(tabs)/classroom' as any);
    };

    React.useEffect(() => {
        const fetchBuilding = async () => {
            setLoading(true);
            try {
                const buildings = await getBuildings();
                const found = buildings.find(b => b.id === id);
                if (found) {
                    setBuilding(found);
                }
            } catch (e) {
                console.error('Failed to fetch building detail', e);
            } finally {
                setLoading(false);
            }
        };
        fetchBuilding();
    }, [id]);

    const handleBackToClassroom = React.useCallback(() => {
        try {
            (router as any).navigate('/classroom');
        } catch {
            router.push('/classroom' as any);
        }
    }, [router]);

    React.useEffect(() => {
        const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
            const actionType = e?.data?.action?.type;
            if (actionType !== 'GO_BACK' && actionType !== 'POP' && actionType !== 'POP_TO_TOP') {
                return;
            }

            e.preventDefault();
            handleBackToClassroom();
        });

        return unsubscribe;
    }, [navigation, handleBackToClassroom]);

    React.useEffect(() => {
        const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
            handleBackToClassroom();
            return true;
        });

        return () => subscription.remove();
    }, [handleBackToClassroom]);

    if (loading) {
        return (
            <View style={styles.errorContainer}>
                <ActivityIndicator size="large" color="#1E3A8A" />
            </View>
        );
    }

    if (!building) {
        return (
            <View style={styles.errorContainer}>
                <Text>Building not found</Text>
                <TouchableOpacity onPress={handleBackToClassroom}>
                    <Text style={styles.backLink}>Back to list</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const handleUploadPhoto = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.8,
        });

        if (!result.canceled) {
            setPhotos([result.assets[0].uri, ...photos]);
            Alert.alert('Success', 'Thank you for contributing to the campus map!');
        }
    };


    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={handleBackToClassroom}>
                    <ChevronLeft size={24} color="#111" />
                </TouchableOpacity>
                <Text style={styles.headerTitle} numberOfLines={1}>{building.name}</Text>
                <TouchableOpacity style={styles.shareButton}>
                    <Share2 size={20} color="#111" />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {/* Photo Gallery / Placeholder */}
                <View style={styles.photoSection}>
                    {photos.length > 0 ? (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
                            {photos.map((uri, index) => (
                                <Image key={index} source={{ uri }} style={styles.roomPhoto} />
                            ))}
                        </ScrollView>
                    ) : (
                        <View style={styles.photoPlaceholder}>
                            <Text style={styles.placeholderIcon}>🏫</Text>
                            <Text style={styles.placeholderText}>No real-life photos yet</Text>
                            <TouchableOpacity style={styles.uploadBtn} onPress={handleUploadPhoto}>
                                <Camera size={18} color="#fff" />
                                <Text style={styles.uploadBtnText}>Be the first to upload</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                {/* Info Card */}
                <View style={styles.infoCard}>
                    <View style={styles.infoRow}>
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>Name</Text>
                        </View>
                    </View>

                    <Text style={styles.buildingName}>
                        <Building size={16} color="#1E3A8A" /> {building.description} ({building.name})
                    </Text>

                </View>

                {/* Actions */}
                <View style={styles.actionRow}>
                    <TouchableOpacity style={styles.navButton} onPress={() => {
                        router.push({
                            pathname: '/(tabs)/map',
                            params: {
                                navLat: building.coordinates.latitude,
                                navLng: building.coordinates.longitude,
                                navName: building.name
                            }
                        } as any);
                    }}>
                        <Navigation size={20} color="#fff" />
                        <Text style={styles.navButtonText}>Start Navigation</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },
    header: { paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#eee' },
    backButton: { padding: 4 },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#111', flex: 1, textAlign: 'center' },
    shareButton: { padding: 4 },
    content: { paddingBottom: 40 },
    photoSection: { height: 220, backgroundColor: '#E5E7EB' },
    photoScroll: { padding: 10 },
    roomPhoto: { width: 280, height: 200, borderRadius: 12, marginRight: 12 },
    photoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    placeholderIcon: { fontSize: 48, marginBottom: 8 },
    placeholderText: { fontSize: 14, color: '#6B7280', marginBottom: 16 },
    uploadBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E3A8A', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
    uploadBtnText: { color: '#fff', fontSize: 14, fontWeight: '600', marginLeft: 8 },
    infoCard: { backgroundColor: '#fff', margin: 16, padding: 20, borderRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
    infoRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    badge: { backgroundColor: '#F3E8FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    badgeText: { color: '#1E3A8A', fontSize: 12, fontWeight: 'bold' },
    buildingName: { fontSize: 16, color: '#374151', marginBottom: 16, fontWeight: '500' },
    divider: { height: 1, backgroundColor: '#F3F4F6', marginBottom: 16 },
    locationSection: { marginBottom: 8 },
    sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#111' },
    mapWrap: { height: 150, borderRadius: 12, overflow: 'hidden', backgroundColor: '#eee' },
    miniMap: { flex: 1 },
    pathHint: { flexDirection: 'row', alignItems: 'center', marginTop: 12, backgroundColor: '#FFF7ED', padding: 10, borderRadius: 8 },
    pathText: { fontSize: 13, color: '#C2410C', marginLeft: 8 },
    actionRow: { paddingHorizontal: 16 },
    navButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1E3A8A', paddingVertical: 16, borderRadius: 16 },
    navButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginLeft: 8 },
    errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    backLink: { color: '#1E3A8A', marginTop: 12, fontWeight: 'bold' },
});

