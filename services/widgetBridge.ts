import { Platform } from 'react-native';
import SharedGroupPreferences from 'react-native-shared-group-preferences';
import { getUserScheduleEntries, type UserScheduleEntry } from './schedule';

const WIDGET_APP_GROUP = 'group.com.budev.HKCampus';
const WIDGET_SCHEDULE_KEY = 'hkcampus_schedule_entries';

type WidgetScheduleEntry = {
    id: string;
    title: string;
    courseCode: string | null;
    room: string | null;
    dayOfWeek: number;
    startTime: string | null;
    endTime: string | null;
    startPeriod: number | null;
    endPeriod: number | null;
};

const toWidgetEntry = (entry: UserScheduleEntry): WidgetScheduleEntry => ({
    id: entry.id,
    title: entry.title,
    courseCode: entry.courseCode ?? null,
    room: entry.room ?? null,
    dayOfWeek: entry.dayOfWeek,
    startTime: entry.startTime ?? null,
    endTime: entry.endTime ?? null,
    startPeriod: entry.startPeriod ?? null,
    endPeriod: entry.endPeriod ?? null,
});

export const writeScheduleToWidget = async (entries: UserScheduleEntry[]): Promise<void> => {
    if (Platform.OS !== 'ios') return;

    const payload = entries.map(toWidgetEntry);
    try {
        await SharedGroupPreferences.setItem(WIDGET_SCHEDULE_KEY, payload, WIDGET_APP_GROUP);
    } catch (error) {
        console.warn('Failed to sync schedule entries to iOS widget:', error);
    }
};

export const syncScheduleToWidgetForUser = async (userId: string): Promise<void> => {
    if (Platform.OS !== 'ios' || !userId) return;

    try {
        const entries = await getUserScheduleEntries(userId, {
            allowStaleOnError: true,
        });
        await writeScheduleToWidget(entries);
    } catch (error) {
        console.warn('Failed to load and sync schedule entries to iOS widget:', error);
    }
};

