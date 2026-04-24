import type { ExpoConfig } from "expo/config";

const SCHEDULE_WIDGET_PLUGIN = "./plugins/withScheduleWidget";
const APP_GROUP = "group.com.budev.HKCampus";
const WIDGET_TARGET_NAME = "ScheduleWidget";
const WIDGET_BUNDLE_IDENTIFIER = "com.budev.HKCampus.ScheduleWidget";

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
    const widgetEnabled = shouldEnableScheduleWidget();
    const buildNumber = "25";
    const appExtensions = widgetEnabled
        ? [
              {
                  targetName: WIDGET_TARGET_NAME,
                  bundleIdentifier: WIDGET_BUNDLE_IDENTIFIER,
                  entitlements: {
                      "com.apple.security.application-groups": [APP_GROUP],
                  },
              },
          ]
        : [];

    return {
        name: "HKCampus",
        slug: "HKCampus",
        version: "1.2.2",
        orientation: "portrait",
        icon: "./assets/images/HKCampusicon.png",
        scheme: "hkcampus",
        userInterfaceStyle: "automatic",
        newArchEnabled: true,
        splash: {
            image: "./assets/images/HKCampusicon.png",
            resizeMode: "contain",
            backgroundColor: "#ffffff",
        },
        ios: {
            supportsTablet: true,
            bundleIdentifier: "com.budev.HKCampus",
            buildNumber,
            appleTeamId: "7HQ8YJC7KQ",
            infoPlist: {
                ITSAppUsesNonExemptEncryption: false,
                NSPhotoLibraryUsageDescription:
                    "HKCampus accesses your photo library so you can choose images for your avatar, posts, messages, and schedule import.",
                NSCameraUsageDescription:
                    "HKCampus accesses the camera so you can take and send photos in messages.",
                NSLocationWhenInUseUsageDescription:
                    "HKCampus accesses your location only when you choose location-based campus features such as centering the map or attaching a location to a post.",
                NSFaceIDUsageDescription:
                    "HKCampus uses Face ID to help you sign in securely on this device.",
            },
        },
        android: {
            adaptiveIcon: {
                foregroundImage: "./assets/images/HKCampusicon.png",
                backgroundColor: "#ffffff",
            },
            edgeToEdgeEnabled: true,
            predictiveBackGestureEnabled: false,
            package: "com.budev.hkcampus",
            versionCode: 5,
            permissions: [
                "android.permission.RECORD_AUDIO",
                "android.permission.USE_BIOMETRIC",
                "android.permission.USE_FINGERPRINT",
                "android.permission.ACCESS_COARSE_LOCATION",
                "android.permission.ACCESS_FINE_LOCATION",
            ],
        },
        web: {
            bundler: "metro",
            output: "static",
            favicon: "./assets/images/favicon.png",
        },
        plugins: [
            "expo-router",
            "expo-secure-store",
            [
                "expo-image-picker",
                {
                    photosPermission:
                        "HKCampus accesses your photo library so you can choose images for your avatar, posts, messages, and schedule import.",
                    cameraPermission:
                        "HKCampus accesses the camera so you can take and send photos in messages.",
                },
            ],
            [
                "expo-local-authentication",
                {
                    faceIDPermission:
                        "HKCampus uses Face ID to help you sign in securely on this device.",
                },
            ],
            [
                "expo-location",
                {
                    locationWhenInUsePermission:
                        "HKCampus accesses your location only when you choose location-based campus features such as centering the map or attaching a location to a post.",
                },
            ],
            "expo-notifications",
            ...(widgetEnabled ? [SCHEDULE_WIDGET_PLUGIN] : []),
        ],
        owner: "timchindev",
        experiments: {
            typedRoutes: true,
        },
        extra: {
            router: {},
            ocrApiUrl,
            deepseekBaseUrl,
            eas: {
                projectId: "44c59701-d20a-45ae-bf97-d3f3d8cae72d",
                build: {
                    experimental: {
                        ios: {
                            appExtensions,
                        },
                    },
                },
            },
        },
        runtimeVersion: {
            policy: "appVersion",
        },
        updates: {
            url: "https://u.expo.dev/44c59701-d20a-45ae-bf97-d3f3d8cae72d",
        },
    };
};
