import type { ExpoConfig } from "expo/config";

import appJson from "./app.json";

type AppJsonShape = {
    expo: ExpoConfig & {
        extra?: Record<string, unknown>;
    };
};

const config = appJson as AppJsonShape;

const SCHEDULE_WIDGET_PLUGIN = "./plugins/withScheduleWidget";

const isTruthy = (value: string | undefined): boolean =>
    ["1", "true", "yes", "on"].includes((value || "").trim().toLowerCase());

const shouldEnableScheduleWidget = (): boolean => {
    if (process.env.EXPO_ENABLE_SCHEDULE_WIDGET !== undefined) {
        return isTruthy(process.env.EXPO_ENABLE_SCHEDULE_WIDGET);
    }

    return (process.env.EAS_BUILD_PROFILE || "").trim().toLowerCase() !== "production";
};

export default (): ExpoConfig => {
    const ocrApiUrl = (process.env.EXPO_PUBLIC_OCR_API_URL || "").trim();
    const deepseekBaseUrl = (process.env.EXPO_PUBLIC_DEEPSEEK_BASE_URL || "").trim();
    const plugins = (config.expo.plugins || []).filter((plugin) => {
        const pluginName = Array.isArray(plugin) ? plugin[0] : plugin;

        if (pluginName !== SCHEDULE_WIDGET_PLUGIN) {
            return true;
        }

        return shouldEnableScheduleWidget();
    });

    return {
        ...config.expo,
        plugins,
        extra: {
            ...(config.expo.extra || {}),
            ocrApiUrl,
            deepseekBaseUrl,
        },
    };
};
