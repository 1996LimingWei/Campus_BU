import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { AlertTriangle, BookOpen, CalendarDays, CheckCircle2, ImageUp, MapPin, Pencil, Search, Trash2, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { searchCourses } from '../../services/courses';
import {
    ScheduleImportItemRecord,
    UserScheduleEntry,
    createManualScheduleEntry,
    deleteUserScheduleEntry,
    getUserScheduleEntries,
    ignoreImportItem,
    importScheduleScreenshot,
    saveImportItemToSchedule,
    updateUserScheduleEntry,
} from '../../services/schedule';
import { Course } from '../../types';

const PLACEHOLDER_COLOR = '#9CA3AF';
const SAMPLE_SCHEDULE_IMAGE = require('../../backend/samples/schedule_real_01.png');

const DAY_OPTIONS = [
    { key: 1, label: '周一' },
    { key: 2, label: '周二' },
    { key: 3, label: '周三' },
    { key: 4, label: '周四' },
    { key: 5, label: '周五' },
    { key: 6, label: '周六' },
    { key: 7, label: '周日' },
];

const getDefaultDay = () => {
    const day = new Date().getDay();
    return day === 0 ? 7 : day;
};

const formatEntryTime = (entry: UserScheduleEntry | ScheduleImportItemRecord) => {
    if ('startTime' in entry && entry.startTime && entry.endTime) {
        return `${entry.startTime} - ${entry.endTime}`;
    }
    if ('extractedStartTime' in entry && entry.extractedStartTime && entry.extractedEndTime) {
        return `${entry.extractedStartTime} - ${entry.extractedEndTime}`;
    }
    const startPeriod = 'extractedStartPeriod' in entry
        ? entry.extractedStartPeriod
        : (entry as UserScheduleEntry).startPeriod;
    const endPeriod = 'extractedEndPeriod' in entry
        ? entry.extractedEndPeriod
        : (entry as UserScheduleEntry).endPeriod;
    if (startPeriod && endPeriod) {
        return `第${startPeriod}-${endPeriod}节`;
    }
    const weekText = 'extractedWeekText' in entry
        ? entry.extractedWeekText
        : (entry as UserScheduleEntry).weekText;
    return weekText || '时间待确认';
};

const canSaveItem = (item: ScheduleImportItemRecord) => {
    const hasTitle = Boolean(item.extractedCourseName || item.extractedCourseCode);
    const hasDay = Boolean(item.extractedDayOfWeek);
    const hasTime = Boolean(
        (item.extractedStartTime && item.extractedEndTime) ||
        (item.extractedStartPeriod && item.extractedEndPeriod) ||
        item.extractedWeekText
    );
    return hasTitle && hasDay && hasTime;
};

const getImportItemTitle = (item: ScheduleImportItemRecord) => {
    if (item.extractedCourseName || item.extractedCourseCode) {
        return item.extractedCourseName || item.extractedCourseCode || '待确认课程';
    }

    if (item.sourceBlock) {
        return item.sourceBlock.length > 24 ? `${item.sourceBlock.slice(0, 24)}...` : item.sourceBlock;
    }

    return '待人工确认课程';
};

export default function MyScheduleCard({ userId }: { userId: string | null }) {
    const router = useRouter();
    const [entries, setEntries] = useState<UserScheduleEntry[]>([]);
    const [loadingEntries, setLoadingEntries] = useState(false);
    const [selectedDay, setSelectedDay] = useState(getDefaultDay());
    const [showImportModal, setShowImportModal] = useState(false);
    const [showSearchModal, setShowSearchModal] = useState(false);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [scanning, setScanning] = useState(false);
    const [importItems, setImportItems] = useState<ScheduleImportItemRecord[]>([]);
    const [selectedImportItem, setSelectedImportItem] = useState<ScheduleImportItemRecord | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchingCourses, setSearchingCourses] = useState(false);
    const [courseResults, setCourseResults] = useState<Course[]>([]);
    const [selectedMatchedCourse, setSelectedMatchedCourse] = useState<Course | null>(null);
    const [savingItemId, setSavingItemId] = useState<string | null>(null);
    const [manualCourseName, setManualCourseName] = useState('');
    const [manualRoom, setManualRoom] = useState('');
    const [manualWeekText, setManualWeekText] = useState('');
    const [manualDayOfWeek, setManualDayOfWeek] = useState<number | null>(null);
    const [manualStartTime, setManualStartTime] = useState('');
    const [manualEndTime, setManualEndTime] = useState('');
    const [showEntryEditor, setShowEntryEditor] = useState(false);
    const [editingEntry, setEditingEntry] = useState<UserScheduleEntry | null>(null);
    const [editingTitle, setEditingTitle] = useState('');
    const [editingCourseCode, setEditingCourseCode] = useState('');
    const [editingRoom, setEditingRoom] = useState('');
    const [editingWeekText, setEditingWeekText] = useState('');
    const [editingDayOfWeek, setEditingDayOfWeek] = useState<number | null>(null);
    const [editingStartTime, setEditingStartTime] = useState('');
    const [editingEndTime, setEditingEndTime] = useState('');
    const [savingEntryId, setSavingEntryId] = useState<string | null>(null);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [showManualEntryEditor, setShowManualEntryEditor] = useState(false);
    const [showSampleExample, setShowSampleExample] = useState(false);

    const closeSearchModal = () => {
        setShowSearchModal(false);
        setShowImportModal(true);
    };

    const dayEntries = entries.filter(entry => entry.dayOfWeek === selectedDay);

    useEffect(() => {
        if (!toastMessage) return;
        const timer = setTimeout(() => setToastMessage(null), 2200);
        return () => clearTimeout(timer);
    }, [toastMessage]);

    const showToast = (message: string) => {
        setToastMessage(message);
    };

    const loadEntries = async () => {
        if (!userId) return;
        setLoadingEntries(true);
        try {
            const data = await getUserScheduleEntries(userId);
            setEntries(data);
        } catch (error) {
            console.error('Failed to load schedule entries:', error);
        } finally {
            setLoadingEntries(false);
        }
    };

    useEffect(() => {
        loadEntries();
    }, [userId]);

    useEffect(() => {
        if (!showSearchModal) return;

        const term = searchQuery.trim();
        if (!term) {
            setCourseResults([]);
            return;
        }

        const timer = setTimeout(async () => {
            try {
                setSearchingCourses(true);
                const results = await searchCourses(term, 12);
                setCourseResults(results);
            } catch (error) {
                console.error('Failed to search courses:', error);
                setCourseResults([]);
            } finally {
                setSearchingCourses(false);
            }
        }, 250);

        return () => clearTimeout(timer);
    }, [searchQuery, showSearchModal]);

    const pickImage = async () => {
        if (!userId) {
            Alert.alert('请先登录', '登录后才能导入个人课表。');
            return;
        }

        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('需要相册权限', '请允许访问相册以选择课表截图。');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: false,
            quality: 1,
        });

        if (!result.canceled) {
            setSelectedImage(result.assets[0].uri);
            setImportItems([]);
        }
    };

    const handleScan = async () => {
        if (!userId || !selectedImage) return;

        setScanning(true);
        try {
            const { items } = await importScheduleScreenshot(userId, selectedImage);
            setImportItems(items);
            if (items.length === 0) {
                Alert.alert('暂时无法生成导入任务', '这张截图里暂时没有生成可人工确认的导入任务。');
            }
        } catch (error: any) {
            console.error('Failed to import schedule screenshot:', error);
            Alert.alert('导入失败', error?.message || '截图识别失败，请检查 OCR 服务是否可用。');
        } finally {
            setScanning(false);
        }
    };

    const updateImportItemLocally = (itemId: string, patch: Partial<ScheduleImportItemRecord>) => {
        setImportItems(prev => prev.map(item => (item.id === itemId ? { ...item, ...patch } : item)));
    };

    const hasCourseCodeConflict = (courseCode?: string, excludeEntryId?: string) => {
        const normalizedCode = courseCode?.trim().toUpperCase();
        if (!normalizedCode) return false;

        return entries.some(entry =>
            entry.id !== excludeEntryId &&
            entry.courseCode?.trim().toUpperCase() === normalizedCode
        );
    };

    const handleDirectSave = async (item: ScheduleImportItemRecord) => {
        if (!userId) return;
        if (hasCourseCodeConflict(item.extractedCourseCode)) {
            Alert.alert('课程冲突', `课表中已经存在课程代码为 ${item.extractedCourseCode} 的课程，不能重复加入。`);
            return;
        }
        setSavingItemId(item.id);
        try {
            await saveImportItemToSchedule({ userId, item, source: 'ocr' });
            updateImportItemLocally(item.id, { status: 'confirmed' });
            await loadEntries();
            showToast('已加入课表');
        } catch (error: any) {
            Alert.alert('加入失败', error?.message || '这条课程暂时无法加入课表。');
        } finally {
            setSavingItemId(null);
        }
    };

    const handleIgnore = async (item: ScheduleImportItemRecord) => {
        if (!userId) return;
        setSavingItemId(item.id);
        try {
            await ignoreImportItem(userId, item);
            setImportItems(prev => prev.filter(current => current.id !== item.id));
        } catch (error) {
            Alert.alert('操作失败', '暂时无法忽略这条识别结果。');
        } finally {
            setSavingItemId(null);
        }
    };

    const openSearchForItem = (item: ScheduleImportItemRecord) => {
        setSelectedImportItem(item);
        setSearchQuery(item.extractedCourseCode || item.extractedCourseName || '');
        setManualCourseName(item.extractedCourseName || item.extractedCourseCode || '');
        setManualRoom(item.extractedRoom || '');
        setManualWeekText(item.extractedWeekText || '');
        setManualDayOfWeek(item.extractedDayOfWeek || null);
        setManualStartTime(item.extractedStartTime || '');
        setManualEndTime(item.extractedEndTime || '');
        setSelectedMatchedCourse(null);
        setCourseResults([]);
        setShowImportModal(false);
        setTimeout(() => {
            setShowSearchModal(true);
        }, 0);
    };

    const buildManualPatchedItem = (item: ScheduleImportItemRecord): ScheduleImportItemRecord => ({
        ...item,
        extractedCourseName: manualCourseName.trim() || item.extractedCourseName,
        extractedRoom: manualRoom.trim() || item.extractedRoom,
        extractedWeekText: manualWeekText.trim() || item.extractedWeekText,
        extractedDayOfWeek: manualDayOfWeek || item.extractedDayOfWeek,
        extractedStartTime: manualStartTime.trim() || item.extractedStartTime,
        extractedEndTime: manualEndTime.trim() || item.extractedEndTime,
    });

    const handleSelectCourse = (course: Course) => {
        setSelectedMatchedCourse(course);
        setManualCourseName(course.name || manualCourseName);
        setSearchQuery(course.code || course.name || '');
    };

    const handleConfirmSelectedCourse = async () => {
        if (!userId || !selectedImportItem || !selectedMatchedCourse) return;

        const patchedItem = buildManualPatchedItem(selectedImportItem);
        const nextCourseCode = selectedMatchedCourse.code || patchedItem.extractedCourseCode;
        if (hasCourseCodeConflict(nextCourseCode)) {
            Alert.alert('课程冲突', `课表中已经存在课程代码为 ${nextCourseCode} 的课程，不能重复加入。`);
            return;
        }
        if (!patchedItem.extractedDayOfWeek) {
            Alert.alert('还差一点', '请先补充上课星期。');
            return;
        }

        const hasTime = Boolean(
            (patchedItem.extractedStartTime && patchedItem.extractedEndTime) ||
            (patchedItem.extractedStartPeriod && patchedItem.extractedEndPeriod) ||
            patchedItem.extractedWeekText
        );
        if (!hasTime) {
            Alert.alert('还差一点', '请先补充上课时间或周次说明。');
            return;
        }

        setSavingItemId(selectedImportItem.id);
        try {
            await saveImportItemToSchedule({
                userId,
                item: patchedItem,
                matchedCourse: selectedMatchedCourse,
                source: 'manual_search',
            });
            updateImportItemLocally(selectedImportItem.id, {
                status: 'confirmed',
                matchedCourseId: selectedMatchedCourse.id,
                extractedCourseName: patchedItem.extractedCourseName,
                extractedRoom: patchedItem.extractedRoom,
                extractedWeekText: patchedItem.extractedWeekText,
                extractedDayOfWeek: patchedItem.extractedDayOfWeek,
                extractedStartTime: patchedItem.extractedStartTime,
                extractedEndTime: patchedItem.extractedEndTime,
            });
            setShowSearchModal(false);
            setSelectedImportItem(null);
            setSelectedMatchedCourse(null);
            await loadEntries();
            showToast('已加入课表');
        } catch (error: any) {
            Alert.alert('加入失败', error?.message || '匹配课程后保存失败。');
        } finally {
            setSavingItemId(null);
        }
    };

    const openEditorForEntry = (entry: UserScheduleEntry) => {
        setEditingEntry(entry);
        setEditingTitle(entry.title);
        setEditingCourseCode(entry.courseCode || '');
        setEditingRoom(entry.room || '');
        setEditingWeekText(entry.weekText || '');
        setEditingDayOfWeek(entry.dayOfWeek);
        setEditingStartTime(entry.startTime || '');
        setEditingEndTime(entry.endTime || '');
        setShowImportModal(false);
        setTimeout(() => {
            setShowEntryEditor(true);
        }, 0);
    };

    const closeEntryEditor = () => {
        setShowEntryEditor(false);
        setEditingEntry(null);
        setEditingTitle('');
        setEditingCourseCode('');
        setEditingRoom('');
        setEditingWeekText('');
        setEditingDayOfWeek(null);
        setEditingStartTime('');
        setEditingEndTime('');
        setShowImportModal(true);
    };

    const openManualEntryEditor = () => {
        setEditingEntry(null);
        setEditingTitle('');
        setEditingCourseCode('');
        setEditingRoom('');
        setEditingWeekText('');
        setEditingDayOfWeek(getDefaultDay());
        setEditingStartTime('');
        setEditingEndTime('');
        setShowImportModal(false);
        setTimeout(() => {
            setShowManualEntryEditor(true);
        }, 0);
    };

    const closeManualEntryEditor = () => {
        setShowManualEntryEditor(false);
        setEditingTitle('');
        setEditingCourseCode('');
        setEditingRoom('');
        setEditingWeekText('');
        setEditingDayOfWeek(null);
        setEditingStartTime('');
        setEditingEndTime('');
        setShowImportModal(true);
    };

    const handleUpdateEntry = async () => {
        if (!userId || !editingEntry || !editingDayOfWeek) return;

        setSavingEntryId(editingEntry.id);
        try {
            await updateUserScheduleEntry({
                userId,
                entryId: editingEntry.id,
                updates: {
                    title: editingTitle,
                    courseCode: editingCourseCode,
                    room: editingRoom,
                    dayOfWeek: editingDayOfWeek,
                    startTime: editingStartTime,
                    endTime: editingEndTime,
                    weekText: editingWeekText,
                },
            });
            await loadEntries();
            closeEntryEditor();
            showToast('课表已更新');
        } catch (error: any) {
            Alert.alert('更新失败', error?.message || '暂时无法更新这条课程。');
        } finally {
            setSavingEntryId(null);
        }
    };

    const handleDeleteEntry = async (entry: UserScheduleEntry) => {
        if (!userId) return;

        Alert.alert('删除课程', `确定删除 ${entry.title} 吗？`, [
            { text: '取消', style: 'cancel' },
            {
                text: '删除',
                style: 'destructive',
                onPress: async () => {
                    setSavingEntryId(entry.id);
                    try {
                        await deleteUserScheduleEntry({ userId, entryId: entry.id });
                        await loadEntries();
                        if (editingEntry?.id === entry.id) {
                            closeEntryEditor();
                        }
                        showToast('已删除课程');
                    } catch (error: any) {
                        Alert.alert('删除失败', error?.message || '暂时无法删除这条课程。');
                    } finally {
                        setSavingEntryId(null);
                    }
                },
            },
        ]);
    };

    const handleCreateManualEntry = async () => {
        if (!userId || !editingDayOfWeek) return;

        if (hasCourseCodeConflict(editingCourseCode)) {
            Alert.alert('课程冲突', `课表中已经存在课程代码为 ${editingCourseCode} 的课程，不能重复加入。`);
            return;
        }

        setSavingEntryId('manual-create');
        try {
            await createManualScheduleEntry({
                userId,
                entry: {
                    title: editingTitle,
                    courseCode: editingCourseCode,
                    room: editingRoom,
                    dayOfWeek: editingDayOfWeek,
                    startTime: editingStartTime,
                    endTime: editingEndTime,
                    weekText: editingWeekText,
                },
            });
            await loadEntries();
            closeManualEntryEditor();
            showToast('已新增课程');
        } catch (error: any) {
            Alert.alert('新增失败', error?.message || '暂时无法新增这条课程。');
        } finally {
            setSavingEntryId(null);
        }
    };

    const handleAddNewCourse = () => {
        setShowSearchModal(false);
        setShowImportModal(false);
        router.push({
            pathname: '/courses/add',
            params: {
                code: selectedImportItem?.extractedCourseCode || '',
                name: manualCourseName.trim() || selectedImportItem?.extractedCourseName || '',
            },
        } as any);
    };

    return (
        <View style={styles.card}>
            {toastMessage ? (
                <View style={styles.toastBanner}>
                    <CheckCircle2 size={16} color="#166534" />
                    <Text style={styles.toastText}>{toastMessage}</Text>
                </View>
            ) : null}
            <View style={styles.header}>
                <View style={styles.headerText}>
                    <Text style={styles.title}>我的课表</Text>
                    <Text style={styles.subtitle}>支持截图导入、OCR 识别和手动搜课补录。</Text>
                </View>
                <TouchableOpacity style={styles.primaryCta} onPress={() => setShowImportModal(true)}>
                    <ImageUp size={16} color="#fff" />
                    <Text style={styles.primaryCtaText}>编辑课表</Text>
                </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayTabs}>
                {DAY_OPTIONS.map(day => (
                    <TouchableOpacity
                        key={day.key}
                        style={[styles.dayTab, selectedDay === day.key && styles.dayTabActive]}
                        onPress={() => setSelectedDay(day.key)}
                    >
                        <Text style={[styles.dayTabText, selectedDay === day.key && styles.dayTabTextActive]}>{day.label}</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {loadingEntries ? (
                <View style={styles.stateBox}>
                    <ActivityIndicator color="#1E3A8A" />
                </View>
            ) : dayEntries.length === 0 ? (
                <View style={styles.stateBox}>
                    <CalendarDays size={24} color="#94A3B8" />
                    <Text style={styles.stateTitle}>这一天还没有课程</Text>
                    <Text style={styles.stateText}>导入统一规格截图后，已确认的课程会显示在这里。</Text>
                </View>
            ) : (
                <View style={styles.entryList}>
                    {dayEntries.map(entry => (
                        <View key={entry.id} style={styles.entryCard}>
                            <View style={styles.entryHeader}>
                                <Text style={styles.entryTitle}>{entry.title}</Text>
                                {entry.courseCode ? <Text style={styles.entryCode}>{entry.courseCode}</Text> : null}
                            </View>
                            <View style={styles.metaRow}>
                                <Search size={14} color="#64748B" />
                                <Text style={styles.metaText}>{formatEntryTime(entry)}</Text>
                            </View>
                            <View style={styles.metaRow}>
                                <MapPin size={14} color="#64748B" />
                                <Text style={styles.metaText}>{entry.room || '教室待补充'}</Text>
                            </View>
                        </View>
                    ))}
                </View>
            )}

            <Modal visible={showImportModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowImportModal(false)}>
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>编辑课表</Text>
                        <TouchableOpacity onPress={() => setShowImportModal(false)}>
                            <X size={22} color="#1F2937" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView contentContainerStyle={styles.modalContent}>
                        <View style={styles.tipCard}>
                            <AlertTriangle size={18} color="#B45309" />
                            <View style={styles.tipContent}>
                                <Text style={styles.tipText}>上传完整、清晰、统一规格的课表截图，系统会识别课程时间和教室，再由你确认加入。</Text>
                                <TouchableOpacity onPress={() => setShowSampleExample(prev => !prev)}>
                                    <Text style={styles.tipLink}>{showSampleExample ? '收起规范课表示例' : '规范课表示例'}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {showSampleExample ? (
                            <View style={styles.sampleInlineCard}>
                                <Image source={SAMPLE_SCHEDULE_IMAGE} style={styles.sampleInlineImage} />
                            </View>
                        ) : null}

                        <TouchableOpacity style={styles.imageBox} onPress={pickImage}>
                            {selectedImage ? (
                                <Image source={{ uri: selectedImage }} style={styles.previewImage} />
                            ) : (
                                <View style={styles.placeholderBox}>
                                    <ImageUp size={32} color="#94A3B8" />
                                    <Text style={styles.placeholderTitle}>选择课表截图</Text>
                                    <Text style={styles.placeholderText}>建议上传整张截图，不要裁掉时间轴和教室信息。</Text>
                                </View>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.scanButton, (!selectedImage || scanning) && styles.disabledButton]}
                            onPress={handleScan}
                            disabled={!selectedImage || scanning}
                        >
                            {scanning ? <ActivityIndicator color="#fff" /> : <Text style={styles.scanButtonText}>开始识别</Text>}
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.manualCreateCard} onPress={openManualEntryEditor}>
                            <Text style={styles.addCourseTitle}>手动新增课程</Text>
                            <Text style={styles.addCourseText}>不走识别，直接手动填写课程名、时间和教室。</Text>
                        </TouchableOpacity>

                        {importItems.length > 0 ? (
                            <View style={styles.reviewSection}>
                                <Text style={styles.sectionTitle}>识别结果确认</Text>
                                {importItems.map(item => (
                                    <View key={item.id} style={styles.reviewCard}>
                                        <View style={styles.entryHeader}>
                                            <Text style={styles.entryTitle}>{getImportItemTitle(item)}</Text>
                                            <Text style={styles.reviewStatus}>
                                                {item.status === 'confirmed' ? '已加入' : item.status === 'ignored' ? '已忽略' : item.status === 'needs_manual_match' ? '需补充' : '待确认'}
                                            </Text>
                                        </View>
                                        <View style={styles.metaRow}>
                                            <BookOpen size={14} color="#64748B" />
                                            <Text style={styles.metaText}>{item.extractedCourseCode || '课程代码待补充'}</Text>
                                        </View>
                                        <View style={styles.metaRow}>
                                            <Search size={14} color="#64748B" />
                                            <Text style={styles.metaText}>{formatEntryTime(item)}</Text>
                                        </View>
                                        <View style={styles.metaRow}>
                                            <MapPin size={14} color="#64748B" />
                                            <Text style={styles.metaText}>{item.extractedRoom || '教室待补充'}</Text>
                                        </View>
                                        <View style={styles.actionRow}>
                                            <TouchableOpacity
                                                style={[styles.outlineButton, (!canSaveItem(item) || item.status === 'confirmed' || item.status === 'ignored') && styles.disabledOutline]}
                                                onPress={() => handleDirectSave(item)}
                                                disabled={!canSaveItem(item) || item.status === 'confirmed' || item.status === 'ignored' || savingItemId === item.id}
                                            >
                                                <Text style={styles.outlineButtonText}>{savingItemId === item.id ? '处理中...' : '直接加入'}</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.outlineButton, item.status === 'confirmed' && styles.disabledOutline]}
                                                onPress={() => openSearchForItem(item)}
                                                disabled={item.status === 'confirmed'}
                                            >
                                                <Text style={styles.outlineButtonText}>搜课程匹配</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={styles.ghostButton}
                                                onPress={() => handleIgnore(item)}
                                                disabled={item.status === 'confirmed' || savingItemId === item.id}
                                            >
                                                <Text style={styles.ghostButtonText}>忽略</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        ) : null}

                        <View style={styles.reviewSection}>
                            <Text style={styles.sectionTitle}>现有课程</Text>
                            {entries.length === 0 ? (
                                <View style={styles.stateBox}>
                                    <Text style={styles.stateTitle}>还没有已加入课程</Text>
                                    <Text style={styles.stateText}>识别后加入的课程，和手动补充的课程，都会显示在这里供你修改或删除。</Text>
                                </View>
                            ) : (
                                entries.map(entry => (
                                    <View key={entry.id} style={styles.reviewCard}>
                                        <View style={styles.entryHeader}>
                                            <Text style={styles.entryTitle}>{entry.title}</Text>
                                            <Text style={styles.reviewStatus}>{DAY_OPTIONS.find(day => day.key === entry.dayOfWeek)?.label || `周${entry.dayOfWeek}`}</Text>
                                        </View>
                                        <View style={styles.metaRow}>
                                            <BookOpen size={14} color="#64748B" />
                                            <Text style={styles.metaText}>{entry.courseCode || '课程代码待补充'}</Text>
                                        </View>
                                        <View style={styles.metaRow}>
                                            <Search size={14} color="#64748B" />
                                            <Text style={styles.metaText}>{formatEntryTime(entry)}</Text>
                                        </View>
                                        <View style={styles.metaRow}>
                                            <MapPin size={14} color="#64748B" />
                                            <Text style={styles.metaText}>{entry.room || '教室待补充'}</Text>
                                        </View>
                                        <View style={styles.actionRow}>
                                            <TouchableOpacity style={styles.outlineButton} onPress={() => openEditorForEntry(entry)}>
                                                <Pencil size={14} color="#1E3A8A" />
                                                <Text style={styles.outlineButtonText}>修改</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={styles.deleteButton}
                                                onPress={() => handleDeleteEntry(entry)}
                                                disabled={savingEntryId === entry.id}
                                            >
                                                <Trash2 size={14} color="#B91C1C" />
                                                <Text style={styles.deleteButtonText}>{savingEntryId === entry.id ? '处理中...' : '删除'}</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                ))
                            )}
                        </View>
                    </ScrollView>
                </View>
            </Modal>

            <Modal visible={showSearchModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeSearchModal}>
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>搜课程加入</Text>
                        <TouchableOpacity onPress={closeSearchModal}>
                            <X size={22} color="#1F2937" />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.searchBar}>
                        <Search size={18} color="#64748B" />
                        <TextInput
                            style={styles.searchInput}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            placeholder="输入课程代码或课程名"
                            placeholderTextColor={PLACEHOLDER_COLOR}
                            autoCapitalize="characters"
                        />
                    </View>

                    <ScrollView contentContainerStyle={styles.modalContent}>
                        {selectedImportItem ? (
                            <View style={styles.contextCard}>
                                <Text style={styles.contextTitle}>{getImportItemTitle(selectedImportItem)}</Text>
                                <Text style={styles.contextText}>{formatEntryTime(selectedImportItem)} · {selectedImportItem.extractedRoom || '教室待补充'}</Text>
                            </View>
                        ) : null}

                        <View style={styles.manualFormCard}>
                            <Text style={styles.manualFormTitle}>手动补充时间和教室</Text>
                            {selectedMatchedCourse ? (
                                <View style={styles.selectedCourseChip}>
                                    <Text style={styles.selectedCourseChipCode}>{selectedMatchedCourse.code}</Text>
                                    <Text style={styles.selectedCourseChipName}>{selectedMatchedCourse.name}</Text>
                                </View>
                            ) : null}
                            <TextInput
                                style={styles.manualInput}
                                value={manualCourseName}
                                onChangeText={setManualCourseName}
                                placeholder="课程名，可留空后用搜课结果覆盖"
                                placeholderTextColor={PLACEHOLDER_COLOR}
                            />
                            <TextInput
                                style={styles.manualInput}
                                value={manualRoom}
                                onChangeText={setManualRoom}
                                placeholder="教室，例如 AAB201"
                                placeholderTextColor={PLACEHOLDER_COLOR}
                            />
                            <TextInput
                                style={styles.manualInput}
                                value={manualStartTime}
                                onChangeText={setManualStartTime}
                                placeholder="开始时间，例如 09:00"
                                placeholderTextColor={PLACEHOLDER_COLOR}
                            />
                            <TextInput
                                style={styles.manualInput}
                                value={manualEndTime}
                                onChangeText={setManualEndTime}
                                placeholder="结束时间，例如 10:50"
                                placeholderTextColor={PLACEHOLDER_COLOR}
                            />
                            <TextInput
                                style={styles.manualInput}
                                value={manualWeekText}
                                onChangeText={setManualWeekText}
                                placeholder="周次说明，可选"
                                placeholderTextColor={PLACEHOLDER_COLOR}
                            />
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayTabs}>
                                {DAY_OPTIONS.map(day => (
                                    <TouchableOpacity
                                        key={`manual-${day.key}`}
                                        style={[styles.dayTab, manualDayOfWeek === day.key && styles.dayTabActive]}
                                        onPress={() => setManualDayOfWeek(day.key)}
                                    >
                                        <Text style={[styles.dayTabText, manualDayOfWeek === day.key && styles.dayTabTextActive]}>{day.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                            <TouchableOpacity
                                style={[styles.confirmCourseButton, (!selectedMatchedCourse || savingItemId === selectedImportItem?.id) && styles.disabledButton]}
                                onPress={handleConfirmSelectedCourse}
                                disabled={!selectedMatchedCourse || savingItemId === selectedImportItem?.id}
                            >
                                <Text style={styles.confirmCourseButtonText}>
                                    {savingItemId === selectedImportItem?.id ? '处理中...' : selectedMatchedCourse ? '加入已选课程' : '先从下方选择课程'}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {searchingCourses ? (
                            <View style={styles.stateBox}>
                                <ActivityIndicator color="#1E3A8A" />
                            </View>
                        ) : courseResults.length === 0 ? (
                            <View style={styles.stateBox}>
                                <Text style={styles.stateTitle}>没有找到相关课程</Text>
                                <Text style={styles.stateText}>可以换关键词继续搜，或者直接去新增课程。</Text>
                            </View>
                        ) : (
                            courseResults.map(course => (
                                <TouchableOpacity key={course.id} style={styles.courseCard} onPress={() => handleSelectCourse(course)}>
                                    <View style={styles.courseInfo}>
                                        <Text style={styles.courseCode}>{course.code}</Text>
                                        <Text style={styles.courseName}>{course.name}</Text>
                                        <Text style={styles.courseMeta}>{course.instructor || 'Teacher TBD'} · {course.department || 'General'}</Text>
                                    </View>
                                    <Text style={styles.coursePick}>{selectedMatchedCourse?.id === course.id ? '已选中' : '选中'}</Text>
                                </TouchableOpacity>
                            ))
                        )}

                        <TouchableOpacity style={styles.addCourseCard} onPress={handleAddNewCourse}>
                            <Text style={styles.addCourseTitle}>没有相关课程？</Text>
                            <Text style={styles.addCourseText}>跳转到课程点评的 Add New Course 新增课程</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            </Modal>

            <Modal visible={showEntryEditor} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeEntryEditor}>
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>修改课表</Text>
                        <TouchableOpacity onPress={closeEntryEditor}>
                            <X size={22} color="#1F2937" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView contentContainerStyle={styles.modalContent}>
                        <View style={styles.manualFormCard}>
                            <Text style={styles.manualFormTitle}>修改课程信息</Text>
                            <TextInput
                                style={styles.manualInput}
                                value={editingTitle}
                                onChangeText={setEditingTitle}
                                placeholder="课程名"
                                placeholderTextColor={PLACEHOLDER_COLOR}
                            />
                            <TextInput
                                style={styles.manualInput}
                                value={editingCourseCode}
                                onChangeText={setEditingCourseCode}
                                placeholder="课程代码"
                                placeholderTextColor={PLACEHOLDER_COLOR}
                                autoCapitalize="characters"
                            />
                            <TextInput
                                style={styles.manualInput}
                                value={editingRoom}
                                onChangeText={setEditingRoom}
                                placeholder="教室，例如 AAB201"
                                placeholderTextColor={PLACEHOLDER_COLOR}
                            />
                            <TextInput
                                style={styles.manualInput}
                                value={editingStartTime}
                                onChangeText={setEditingStartTime}
                                placeholder="开始时间，例如 09:00"
                                placeholderTextColor={PLACEHOLDER_COLOR}
                            />
                            <TextInput
                                style={styles.manualInput}
                                value={editingEndTime}
                                onChangeText={setEditingEndTime}
                                placeholder="结束时间，例如 10:50"
                                placeholderTextColor={PLACEHOLDER_COLOR}
                            />
                            <TextInput
                                style={styles.manualInput}
                                value={editingWeekText}
                                onChangeText={setEditingWeekText}
                                placeholder="周次说明，可选"
                                placeholderTextColor={PLACEHOLDER_COLOR}
                            />
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayTabs}>
                                {DAY_OPTIONS.map(day => (
                                    <TouchableOpacity
                                        key={`edit-${day.key}`}
                                        style={[styles.dayTab, editingDayOfWeek === day.key && styles.dayTabActive]}
                                        onPress={() => setEditingDayOfWeek(day.key)}
                                    >
                                        <Text style={[styles.dayTabText, editingDayOfWeek === day.key && styles.dayTabTextActive]}>{day.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                            <TouchableOpacity
                                style={[styles.confirmCourseButton, (!editingTitle.trim() || !editingDayOfWeek || savingEntryId === editingEntry?.id) && styles.disabledButton]}
                                onPress={handleUpdateEntry}
                                disabled={!editingTitle.trim() || !editingDayOfWeek || savingEntryId === editingEntry?.id}
                            >
                                <Text style={styles.confirmCourseButtonText}>
                                    {savingEntryId === editingEntry?.id ? '处理中...' : '保存修改'}
                                </Text>
                            </TouchableOpacity>
                            {editingEntry ? (
                                <TouchableOpacity
                                    style={styles.deleteEntryButtonLarge}
                                    onPress={() => handleDeleteEntry(editingEntry)}
                                    disabled={savingEntryId === editingEntry.id}
                                >
                                    <Text style={styles.deleteEntryButtonLargeText}>{savingEntryId === editingEntry.id ? '处理中...' : '删除这条课程'}</Text>
                                </TouchableOpacity>
                            ) : null}
                        </View>
                    </ScrollView>
                </View>
            </Modal>

            <Modal visible={showManualEntryEditor} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeManualEntryEditor}>
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>手动新增课程</Text>
                        <TouchableOpacity onPress={closeManualEntryEditor}>
                            <X size={22} color="#1F2937" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView contentContainerStyle={styles.modalContent}>
                        <View style={styles.manualFormCard}>
                            <Text style={styles.manualFormTitle}>填写课程信息</Text>
                            <TextInput
                                style={styles.manualInput}
                                value={editingTitle}
                                onChangeText={setEditingTitle}
                                placeholder="课程名"
                                placeholderTextColor={PLACEHOLDER_COLOR}
                            />
                            <TextInput
                                style={styles.manualInput}
                                value={editingCourseCode}
                                onChangeText={setEditingCourseCode}
                                placeholder="课程代码"
                                placeholderTextColor={PLACEHOLDER_COLOR}
                                autoCapitalize="characters"
                            />
                            <TextInput
                                style={styles.manualInput}
                                value={editingRoom}
                                onChangeText={setEditingRoom}
                                placeholder="教室，例如 AAB201"
                                placeholderTextColor={PLACEHOLDER_COLOR}
                            />
                            <TextInput
                                style={styles.manualInput}
                                value={editingStartTime}
                                onChangeText={setEditingStartTime}
                                placeholder="开始时间，例如 09:00"
                                placeholderTextColor={PLACEHOLDER_COLOR}
                            />
                            <TextInput
                                style={styles.manualInput}
                                value={editingEndTime}
                                onChangeText={setEditingEndTime}
                                placeholder="结束时间，例如 10:50"
                                placeholderTextColor={PLACEHOLDER_COLOR}
                            />
                            <TextInput
                                style={styles.manualInput}
                                value={editingWeekText}
                                onChangeText={setEditingWeekText}
                                placeholder="周次说明，可选"
                                placeholderTextColor={PLACEHOLDER_COLOR}
                            />
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayTabs}>
                                {DAY_OPTIONS.map(day => (
                                    <TouchableOpacity
                                        key={`create-${day.key}`}
                                        style={[styles.dayTab, editingDayOfWeek === day.key && styles.dayTabActive]}
                                        onPress={() => setEditingDayOfWeek(day.key)}
                                    >
                                        <Text style={[styles.dayTabText, editingDayOfWeek === day.key && styles.dayTabTextActive]}>{day.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                            <TouchableOpacity
                                style={[styles.confirmCourseButton, (!editingTitle.trim() || !editingDayOfWeek || savingEntryId === 'manual-create') && styles.disabledButton]}
                                onPress={handleCreateManualEntry}
                                disabled={!editingTitle.trim() || !editingDayOfWeek || savingEntryId === 'manual-create'}
                            >
                                <Text style={styles.confirmCourseButtonText}>
                                    {savingEntryId === 'manual-create' ? '处理中...' : '新增到课表'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    card: { backgroundColor: '#fff', marginHorizontal: 16, marginTop: 16, padding: 16, borderRadius: 16, position: 'relative' },
    toastBanner: { position: 'absolute', top: -8, left: 16, right: 16, zIndex: 10, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#DCFCE7', borderWidth: 1, borderColor: '#86EFAC', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
    toastText: { fontSize: 13, fontWeight: '700', color: '#166534' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
    headerText: { flex: 1 },
    title: { fontSize: 16, fontWeight: '700', color: '#111827' },
    subtitle: { marginTop: 4, fontSize: 12, lineHeight: 18, color: '#6B7280' },
    primaryCta: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1E3A8A', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
    primaryCtaText: { color: '#fff', fontSize: 13, fontWeight: '700' },
    dayTabs: { paddingTop: 16, paddingBottom: 8, gap: 8 },
    dayTab: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: '#F3F4F6' },
    dayTabActive: { backgroundColor: '#DBEAFE' },
    dayTabText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
    dayTabTextActive: { color: '#1E3A8A' },
    stateBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 28, gap: 8 },
    stateTitle: { fontSize: 15, fontWeight: '700', color: '#475569' },
    stateText: { fontSize: 13, lineHeight: 18, color: '#94A3B8', textAlign: 'center' },
    entryList: { gap: 10, marginTop: 4 },
    entryCard: { padding: 14, borderRadius: 14, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' },
    entryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
    entryTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: '#111827' },
    entryCode: { fontSize: 11, fontWeight: '700', color: '#3730A3', backgroundColor: '#E0E7FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    metaText: { fontSize: 13, color: '#475569', flex: 1 },
    modalContainer: { flex: 1, backgroundColor: '#F8FAFC' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
    modalTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
    modalContent: { padding: 16, paddingBottom: 40, gap: 14 },
    tipCard: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 14, backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FCD34D' },
    tipContent: { flex: 1, gap: 6 },
    tipText: { fontSize: 13, lineHeight: 19, color: '#92400E' },
    tipLink: { fontSize: 13, fontWeight: '700', color: '#1D4ED8' },
    imageBox: { minHeight: 220, borderRadius: 18, borderWidth: 1, borderColor: '#CBD5E1', borderStyle: 'dashed', backgroundColor: '#fff', overflow: 'hidden', justifyContent: 'center' },
    previewImage: { width: '100%', height: 260, resizeMode: 'cover' },
    placeholderBox: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 36 },
    placeholderTitle: { marginTop: 12, fontSize: 16, fontWeight: '700', color: '#334155' },
    placeholderText: { marginTop: 8, fontSize: 13, lineHeight: 19, color: '#64748B', textAlign: 'center' },
    scanButton: { marginTop: 14, height: 48, borderRadius: 14, backgroundColor: '#1E3A8A', alignItems: 'center', justifyContent: 'center' },
    scanButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    disabledButton: { opacity: 0.5 },
    manualCreateCard: { marginTop: 14, backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#DBEAFE' },
    reviewSection: { marginTop: 20, gap: 12 },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
    reviewCard: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', padding: 14, gap: 8 },
    reviewStatus: { fontSize: 11, fontWeight: '700', color: '#334155', backgroundColor: '#F3F4F6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
    actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
    outlineButton: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, borderWidth: 1, borderColor: '#BFDBFE', backgroundColor: '#EFF6FF', paddingHorizontal: 12, paddingVertical: 10 },
    outlineButtonText: { fontSize: 13, fontWeight: '700', color: '#1E3A8A' },
    disabledOutline: { opacity: 0.5 },
    ghostButton: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
    ghostButtonText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
    deleteButton: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', paddingHorizontal: 12, paddingVertical: 10 },
    deleteButtonText: { fontSize: 13, fontWeight: '700', color: '#B91C1C' },
    searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', margin: 16, marginBottom: 0, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0' },
    searchInput: { flex: 1, height: 48, marginLeft: 10, fontSize: 15, color: '#111827' },
    contextCard: { backgroundColor: '#E0F2FE', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#BAE6FD' },
    contextTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
    contextText: { marginTop: 4, fontSize: 13, color: '#475569' },
    manualFormCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E2E8F0', gap: 10 },
    manualFormTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
    selectedCourseChip: { borderRadius: 12, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', paddingHorizontal: 12, paddingVertical: 10 },
    selectedCourseChipCode: { fontSize: 12, fontWeight: '700', color: '#1D4ED8' },
    selectedCourseChipName: { marginTop: 4, fontSize: 14, fontWeight: '600', color: '#0F172A' },
    manualInput: { height: 46, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F8FAFC', paddingHorizontal: 12, fontSize: 14, color: '#111827' },
    confirmCourseButton: { height: 46, borderRadius: 12, backgroundColor: '#1E3A8A', alignItems: 'center', justifyContent: 'center' },
    confirmCourseButtonText: { fontSize: 14, fontWeight: '700', color: '#fff' },
    deleteEntryButtonLarge: { height: 46, borderRadius: 12, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', alignItems: 'center', justifyContent: 'center' },
    deleteEntryButtonLargeText: { fontSize: 14, fontWeight: '700', color: '#B91C1C' },
    courseCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' },
    courseInfo: { flex: 1 },
    courseCode: { fontSize: 13, fontWeight: '700', color: '#1E3A8A' },
    courseName: { marginTop: 4, fontSize: 15, fontWeight: '700', color: '#111827' },
    courseMeta: { marginTop: 4, fontSize: 12, color: '#64748B' },
    coursePick: { fontSize: 14, fontWeight: '700', color: '#1E3A8A' },
    addCourseCard: { marginTop: 4, backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#DBEAFE' },
    addCourseTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
    addCourseText: { marginTop: 4, fontSize: 13, lineHeight: 18, color: '#1E3A8A' },
    sampleInlineCard: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#DBEAFE', backgroundColor: '#fff' },
    sampleInlineImage: { width: '100%', height: 260, resizeMode: 'contain', backgroundColor: '#F8FAFC' },
});
