import * as ImagePicker from 'expo-image-picker';
import { Camera, CheckCircle2, FileSearch } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ExtractedSchedule, getPrimaryExtractedSchedule, scanScheduleFromImage } from '../services/ai-ocr';

export default function ScheduleScanner() {
    const [image, setImage] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<ExtractedSchedule | null>(null);

    const pickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission required', 'Please allow access to your photos to scan schedules.');
            return;
        }

        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            quality: 1,
        });

        if (!result.canceled) {
            setImage(result.assets[0].uri);
            setResult(null);
        }
    };

    const handleScan = async () => {
        if (!image) return;
        setLoading(true);
        try {
            const data = await scanScheduleFromImage(image);
            setResult(getPrimaryExtractedSchedule(data));
        } catch (e) {
            Alert.alert('Error', 'AI scan failed. Please check if the backend is running.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>AI 课表识别 (Pytorch + Donut)</Text>

            <TouchableOpacity style={styles.uploadBox} onPress={pickImage}>
                {image ? (
                    <Image source={{ uri: image }} style={styles.preview} />
                ) : (
                    <View style={styles.placeholder}>
                        <Camera size={40} color="#999" />
                        <Text style={styles.placeholderText}>点击选择课表或公告图片</Text>
                    </View>
                )}
            </TouchableOpacity>

            {image && !result && (
                <TouchableOpacity
                    style={[styles.btn, loading && styles.btnDisabled]}
                    onPress={handleScan}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <>
                            <FileSearch size={20} color="#fff" />
                            <Text style={styles.btnText}>开始 AI 提取</Text>
                        </>
                    )}
                </TouchableOpacity>
            )}

            {result && (
                <View style={styles.resultCard}>
                    <View style={styles.resultHeader}>
                        <CheckCircle2 size={20} color="#4CAF50" />
                        <Text style={styles.resultTitle}>提取成功 (Donut Transformer)</Text>
                    </View>
                    <View style={styles.row}>
                        <Text style={styles.label}>课程：</Text>
                        <Text style={styles.value}>{result.course}</Text>
                    </View>
                    <View style={styles.row}>
                        <Text style={styles.label}>教室：</Text>
                        <Text style={styles.value}>{result.room}</Text>
                    </View>
                    <View style={styles.row}>
                        <Text style={styles.label}>时间：</Text>
                        <Text style={styles.value}>{result.time}</Text>
                    </View>
                    <TouchableOpacity style={styles.saveBtn} onPress={() => Alert.alert('已保存', '课程已加入你的个人课表')}>
                        <Text style={styles.saveBtnText}>保存到我的课表</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { padding: 20, backgroundColor: '#f8f9fa', borderRadius: 16 },
    title: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
    uploadBox: {
        height: 200,
        backgroundColor: '#fff',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#ddd',
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden'
    },
    preview: { width: '100%', height: '100%', resizeMode: 'cover' },
    placeholder: { alignItems: 'center' },
    placeholderText: { marginTop: 10, color: '#999' },
    btn: {
        backgroundColor: '#007AFF',
        flexDirection: 'row',
        padding: 15,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 15
    },
    btnDisabled: { opacity: 0.6 },
    btnText: { color: '#fff', fontWeight: 'bold', marginLeft: 10 },
    resultCard: {
        marginTop: 20,
        backgroundColor: '#fff',
        padding: 15,
        borderRadius: 12,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1
    },
    resultHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
    resultTitle: { marginLeft: 8, fontWeight: 'bold', color: '#4CAF50' },
    row: { flexDirection: 'row', marginBottom: 8 },
    label: { width: 60, color: '#666' },
    value: { fontWeight: '600', color: '#333' },
    saveBtn: {
        marginTop: 15,
        backgroundColor: '#4CAF50',
        padding: 12,
        borderRadius: 8,
        alignItems: 'center'
    },
    saveBtnText: { color: '#fff', fontWeight: 'bold' }
});
