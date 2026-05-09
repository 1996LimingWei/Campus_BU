import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

type WidgetRefreshNativeModule = {
    reloadTimelines(kind: string): Promise<void>;
    reloadAllTimelines(): Promise<void>;
};

const SCHEDULE_WIDGET_KIND = 'ScheduleWidget';

const nativeWidgetRefreshModule: WidgetRefreshNativeModule | null = Platform.OS === 'ios'
    ? requireOptionalNativeModule<WidgetRefreshNativeModule>('WidgetRefreshModule')
    : null;

export const reloadScheduleWidgetTimelines = async (): Promise<void> => {
    if (Platform.OS !== 'ios' || !nativeWidgetRefreshModule) {
        return;
    }

    try {
        await nativeWidgetRefreshModule.reloadTimelines(SCHEDULE_WIDGET_KIND);
    } catch (error) {
        console.warn('Failed to trigger iOS widget timeline reload:', error);
    }
};
