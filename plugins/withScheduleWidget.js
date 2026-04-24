const fs = require('fs');
const path = require('path');
const {
    IOSConfig,
    WarningAggregator,
    withDangerousMod,
    withEntitlementsPlist,
    withXcodeProject,
} = require('expo/config-plugins');

const APP_GROUP = 'group.com.budev.HKCampus';
const WIDGET_NAME = 'ScheduleWidget';
const WIDGET_BUNDLE_SUFFIX = 'ScheduleWidget';
const WIDGET_FILES = [
    'ScheduleWidgetProvider.swift',
    'ScheduleWidgetViews.swift',
    'ScheduleWidget.swift',
    'Info.plist',
    'ScheduleWidget.entitlements',
];

/**
 * Safely add a non-source file (e.g. .plist, .entitlements) to a PBXGroup by name.
 * project.addFile() crashes when PBXVariantGroup section is absent.
 */
const addFileRefToGroup = (project, filepath, groupName) => {
    const COMMENT_KEY = /_comment$/;
    const groups = project.hash.project.objects.PBXGroup || {};
    let groupKey = null;
    for (const key of Object.keys(groups)) {
        if (COMMENT_KEY.test(key)) continue;
        if (groups[key].name === groupName || groups[key].path === groupName) {
            groupKey = key;
            break;
        }
    }
    if (!groupKey) return;

    // Avoid duplicates
    const existingFileRefs = (groups[groupKey].children || []).map((c) => c.value);

    const fileRef = project.generateUuid();
    const basename = path.basename(filepath);

    // Add PBXFileReference
    const fileRefSection = project.pbxFileReferenceSection();
    fileRefSection[fileRef] = {
        isa: 'PBXFileReference',
        lastKnownFileType: filepath.endsWith('.plist') ? 'text.plist.xml' : filepath.endsWith('.entitlements') ? 'text.plist.entitlements' : 'unknown',
        name: basename,
        path: filepath,
        sourceTree: '"<group>"',
    };
    fileRefSection[fileRef + '_comment'] = basename;

    // Add to group only if not already present
    if (!existingFileRefs.includes(fileRef)) {
        groups[groupKey].children.push({ value: fileRef, comment: basename });
    }
};

const ensureStringArray = (value) => {
    if (!Array.isArray(value)) return [];
    return value.filter((item) => typeof item === 'string');
};

const ensureAppGroupInEntitlements = (config) =>
    withEntitlementsPlist(config, (nextConfig) => {
        const groups = new Set(
            ensureStringArray(nextConfig.modResults['com.apple.security.application-groups'])
        );
        groups.add(APP_GROUP);
        nextConfig.modResults['com.apple.security.application-groups'] = Array.from(groups);
        return nextConfig;
    });

const copyWidgetTemplateFiles = (config) =>
    withDangerousMod(config, [
        'ios',
        async (nextConfig) => {
            const projectRoot = nextConfig.modRequest.projectRoot;
            const sourceDir = path.join(projectRoot, 'targets', WIDGET_NAME);
            const outputDir = path.join(projectRoot, 'ios', WIDGET_NAME);

            if (!fs.existsSync(sourceDir)) {
                WarningAggregator.addWarningIOS(
                    'withScheduleWidget',
                    `Missing ${sourceDir}. Widget files were not copied.`
                );
                return nextConfig;
            }

            fs.mkdirSync(outputDir, { recursive: true });
            for (const fileName of WIDGET_FILES) {
                const from = path.join(sourceDir, fileName);
                const to = path.join(outputDir, fileName);
                if (!fs.existsSync(from)) {
                    WarningAggregator.addWarningIOS(
                        'withScheduleWidget',
                        `Missing template file ${from}.`
                    );
                    continue;
                }
                fs.copyFileSync(from, to);
            }

            return nextConfig;
        },
    ]);

/**
 * Add "Embed App Extensions" build phase to the main app target so the
 * widget extension is embedded in the app bundle.
 */
const addEmbedAppExtensionsBuildPhase = (project, widgetTargetUuid, widgetTargetObj) => {
    const mainTarget = project.getTarget('com.apple.product-type.application');
    if (!mainTarget) return;

    // Find the widget's product reference (the .appex)
    const widgetProductRef = widgetTargetObj.productReference;
    if (!widgetProductRef) {
        WarningAggregator.addWarningIOS(
            'withScheduleWidget',
            'Could not find widget target product reference for Embed App Extensions phase.'
        );
        return;
    }

    // Check if the widget is already embedded in ANY copy phase of the main target
    // (Expo or CocoaPods may have already added a "Copy Files" phase)
    for (const bp of mainTarget.target.buildPhases || []) {
        const phase = project.hash.project.objects.PBXCopyFilesBuildPhase[bp.value];
        if (!phase) continue;
        const alreadyEmbedded = (phase.files || []).some(
            (f) => project.hash.project.objects.PBXBuildFile[f.value]?.fileRef === widgetProductRef
        );
        if (alreadyEmbedded) return;
    }

    // Create the PBXCopyFilesBuildPhase
    const phaseUuid = project.generateUuid();
    const buildPhase = {
        isa: 'PBXCopyFilesBuildPhase',
        buildActionMask: '2147483647',
        dstPath: '""',
        dstSubfolderSpec: '13',
        files: [],
        name: '"Embed App Extensions"',
        runOnlyForDeploymentPostprocessing: '0',
    };
    project.hash.project.objects.PBXCopyFilesBuildPhase[phaseUuid] = buildPhase;
    project.hash.project.objects.PBXCopyFilesBuildPhase[phaseUuid + '_comment'] = '"Embed App Extensions"';

    // Add reference to the widget extension product in this phase
    const buildFileUuid = project.generateUuid();
    const productComment = project.hash.project.objects.PBXFileReference[widgetProductRef];
    const productName = productComment ? (productComment.name || productComment.path || `${WIDGET_NAME}.appex`) : `${WIDGET_NAME}.appex`;
    project.hash.project.objects.PBXBuildFile[buildFileUuid] = {
        isa: 'PBXBuildFile',
        fileRef: widgetProductRef,
        settings: {
            ATTRIBUTES: '("RemoveHeadersOnCopy", )',
        },
    };
    project.hash.project.objects.PBXBuildFile[buildFileUuid + '_comment'] = `${productName} in Embed App Extensions`;
    buildPhase.files.push({ value: buildFileUuid, comment: `${productName} in Embed App Extensions` });

    // Add this build phase to the main target
    mainTarget.target.buildPhases.push({ value: phaseUuid, comment: '"Embed App Extensions"' });
};

/**
 * Move widget source build files from the main app target's PBXSourcesBuildPhase
 * to the widget target's PBXSourcesBuildPhase.
 *
 * Expo's addBuildSourceFileToGroup always adds to the first (main app) source phase.
 * We need to move them to the correct widget target phase to avoid @main conflicts.
 */
/**
 * Ensure the widget target has a PBXSourcesBuildPhase.
 * The xcode library's addTarget() for app_extension doesn't create one.
 */
const ensureWidgetSourcesBuildPhase = (project, targetUuid) => {
    const COMMENT_KEY = /_comment$/;
    const nativeTargets = project.hash.project.objects.PBXNativeTarget || {};
    let widgetTarget = null;
    for (const [key, obj] of Object.entries(nativeTargets)) {
        if (COMMENT_KEY.test(key)) continue;
        const name = (obj.name || '').replace(/^"|"$/g, '');
        if (name === WIDGET_NAME) {
            widgetTarget = obj;
            break;
        }
    }
    if (!widgetTarget) return null;

    // Check if a Sources build phase already exists
    for (const bp of widgetTarget.buildPhases || []) {
        if (project.hash.project.objects.PBXSourcesBuildPhase[bp.value]) {
            return bp.value; // Already exists
        }
    }

    // Create a new PBXSourcesBuildPhase
    const phaseUuid = project.generateUuid();
    project.hash.project.objects.PBXSourcesBuildPhase[phaseUuid] = {
        isa: 'PBXSourcesBuildPhase',
        buildActionMask: '2147483647',
        files: [],
        runOnlyForDeploymentPostprocessing: '0',
    };
    project.hash.project.objects.PBXSourcesBuildPhase[phaseUuid + '_comment'] = 'Sources';

    // Add to widget target's buildPhases
    if (!widgetTarget.buildPhases) {
        widgetTarget.buildPhases = [];
    }
    widgetTarget.buildPhases.push({ value: phaseUuid, comment: 'Sources' });

    return phaseUuid;
};

const moveWidgetSourceFiles = (project) => {
    const COMMENT_KEY = /_comment$/;
    const widgetFileNames = [
        'ScheduleWidgetProvider.swift',
        'ScheduleWidgetViews.swift',
        'ScheduleWidget.swift',
    ];

    // Find all native targets and their source phases
    const nativeTargets = project.hash.project.objects.PBXNativeTarget || {};
    let mainSourcePhase = null;
    let widgetSourcePhase = null;

    for (const [targetKey, targetObj] of Object.entries(nativeTargets)) {
        if (COMMENT_KEY.test(targetKey)) continue;
        const rawName = targetObj.name || '';
        const targetName = rawName.replace(/^"|"$/g, '');
        if (!targetObj.buildPhases) continue;

        for (const bp of targetObj.buildPhases) {
            const phase = project.hash.project.objects.PBXSourcesBuildPhase[bp.value];
            if (!phase) continue;

            if (targetName === WIDGET_NAME) {
                widgetSourcePhase = phase;
            } else if (!mainSourcePhase) {
                mainSourcePhase = phase;
            }
        }
    }

    if (!mainSourcePhase || !widgetSourcePhase) return;

    // Find and move widget files from main to widget phase
    const toMove = [];
    for (const fileEntry of (mainSourcePhase.files || [])) {
        const buildFile = project.hash.project.objects.PBXBuildFile[fileEntry.value];
        if (!buildFile || !buildFile.fileRef) continue;
        const fileRefObj = project.hash.project.objects.PBXFileReference[buildFile.fileRef];
        if (!fileRefObj) continue;
        const name = (fileRefObj.name || fileRefObj.path || '').replace(/^"|"$/g, '');
        if (widgetFileNames.some((wf) => name.includes(wf) || name.endsWith(wf))) {
            toMove.push(fileEntry);
        }
    }

    for (const entry of toMove) {
        mainSourcePhase.files = mainSourcePhase.files.filter((f) => f.value !== entry.value);
        widgetSourcePhase.files.push(entry);
    }
};

/**
 * Update a build property for all build configurations belonging to a specific target.
 * The xcode library's updateBuildProperty doesn't properly filter by target name.
 */
const updateBuildPropertyForTarget = (project, prop, value, targetName) => {
    const COMMENT_KEY = /_comment$/;
    const nativeTargets = project.hash.project.objects.PBXNativeTarget || {};

    // Find the target's buildConfigurationList
    let targetConfigListUuid = null;
    for (const [key, targetObj] of Object.entries(nativeTargets)) {
        if (COMMENT_KEY.test(key)) continue;
        const rawName = targetObj.name || '';
        const normalizedName = rawName.replace(/^"|"$/g, '');
        if (normalizedName === targetName) {
            targetConfigListUuid = targetObj.buildConfigurationList;
            break;
        }
    }

    if (!targetConfigListUuid) return;

    const configLists = project.hash.project.objects.XCConfigurationList || {};
    const configList = configLists[targetConfigListUuid];
    if (!configList || !configList.buildConfigurations) return;

    const configUuids = configList.buildConfigurations.map((c) => c.value);

    const configs = project.hash.project.objects.XCBuildConfiguration || {};
    for (const [configKey, configObj] of Object.entries(configs)) {
        if (COMMENT_KEY.test(configKey)) continue;
        if (configUuids.includes(configKey)) {
            configObj.buildSettings[prop] = value;
        }
    }
};

const addWidgetTargetToXcodeProject = (config) =>
    withXcodeProject(config, (nextConfig) => {
        const project = nextConfig.modResults;
        const appBundleId = nextConfig.ios?.bundleIdentifier ?? 'com.budev.HKCampus';
        const widgetBundleId = `${appBundleId}.${WIDGET_BUNDLE_SUFFIX}`;
        const marketingVersion = nextConfig.version ?? '1.0.0';
        const buildNumber = nextConfig.ios?.buildNumber ?? '1';
        const existing = project.pbxTargetByName(WIDGET_NAME);
        // addTarget returns { uuid, pbxNativeTarget }; pbxTargetByName returns raw object
        let targetUuid, targetObj;
        if (existing) {
            targetObj = existing;
            // Find the UUID by searching PBXNativeTarget
            const COMMENT_KEY = /_comment$/;
            const nativeTargets = project.hash.project.objects.PBXNativeTarget || {};
            for (const [key, obj] of Object.entries(nativeTargets)) {
                if (COMMENT_KEY.test(key)) continue;
                const normalizedName = (obj.name || '').replace(/^"|"$/g, '');
                if (normalizedName === WIDGET_NAME) {
                    targetUuid = key;
                    break;
                }
            }
        } else {
            const created = project.addTarget(WIDGET_NAME, 'app_extension', WIDGET_NAME, widgetBundleId);
            targetUuid = created?.uuid;
            targetObj = created?.pbxNativeTarget;
        }

        if (!targetUuid || !targetObj) {
            WarningAggregator.addWarningIOS(
                'withScheduleWidget',
                `Could not create or resolve "${WIDGET_NAME}" target.`
            );
            return nextConfig;
        }

        IOSConfig.XcodeUtils.ensureGroupRecursively(project, WIDGET_NAME);

        // Add widget Swift source files.
        // Note: addBuildSourceFileToGroup incorrectly adds them to the main app's Sources phase.
        // We fix this with moveWidgetSourceFiles() afterwards.
        IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
            filepath: `${WIDGET_NAME}/ScheduleWidgetProvider.swift`,
            groupName: WIDGET_NAME,
            project,
            targetUuid,
        });
        IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
            filepath: `${WIDGET_NAME}/ScheduleWidgetViews.swift`,
            groupName: WIDGET_NAME,
            project,
            targetUuid,
        });
        IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
            filepath: `${WIDGET_NAME}/ScheduleWidget.swift`,
            groupName: WIDGET_NAME,
            project,
            targetUuid,
        });
        addFileRefToGroup(project, `${WIDGET_NAME}/Info.plist`, WIDGET_NAME);
        addFileRefToGroup(project, `${WIDGET_NAME}/ScheduleWidget.entitlements`, WIDGET_NAME);

        // Critical fix: move widget source files from main app's build phase to widget's
        ensureWidgetSourcesBuildPhase(project, targetUuid);
        moveWidgetSourceFiles(project);

        // Add "Embed App Extensions" build phase to main app target
        addEmbedAppExtensionsBuildPhase(project, targetUuid, targetObj);

        const targetName = WIDGET_NAME;
        updateBuildPropertyForTarget(project, 'PRODUCT_BUNDLE_IDENTIFIER', widgetBundleId, targetName);
        updateBuildPropertyForTarget(project, 'INFOPLIST_FILE', `${WIDGET_NAME}/Info.plist`, targetName);
        updateBuildPropertyForTarget(
            project,
            'CODE_SIGN_ENTITLEMENTS',
            `${WIDGET_NAME}/ScheduleWidget.entitlements`,
            targetName
        );
        updateBuildPropertyForTarget(project, 'SWIFT_VERSION', '5.0', targetName);
        updateBuildPropertyForTarget(project, 'IPHONEOS_DEPLOYMENT_TARGET', '17.0', targetName);
        updateBuildPropertyForTarget(project, 'APPLICATION_EXTENSION_API_ONLY', 'YES', targetName);
        updateBuildPropertyForTarget(project, 'TARGETED_DEVICE_FAMILY', '"1,2"', targetName);
        updateBuildPropertyForTarget(project, 'MARKETING_VERSION', marketingVersion, targetName);
        updateBuildPropertyForTarget(project, 'CURRENT_PROJECT_VERSION', buildNumber, targetName);
        updateBuildPropertyForTarget(project, 'VERSIONING_SYSTEM', '"apple-generic"', targetName);

        // Add widget as dependency of main app target
        const mainTarget = project.getTarget('com.apple.product-type.application');
        if (mainTarget && !mainTarget.target.dependencies.some((d) => d.value === targetUuid)) {
            project.addTargetDependency(mainTarget.uuid, [targetUuid]);
        }

        if (nextConfig.ios?.appleTeamId) {
            updateBuildPropertyForTarget(
                project,
                'DEVELOPMENT_TEAM',
                nextConfig.ios.appleTeamId,
                targetName
            );
        }

        return nextConfig;
    });

/**
 * Post-process the Xcode project file after all Expo config plugins have run.
 * This fixes build settings and build phases that other plugins or the xcode
 * library's addTarget() set incorrectly.
 */
const postProcessXcodeProject = (config) =>
    withDangerousMod(config, [
        'ios',
        async (nextConfig) => {
            // Note: withDangerousMod runs before withXcodeProject, so the widget
            // target does not yet exist here. All fixes are handled in
            // addWidgetTargetToXcodeProject instead. This hook is kept for
            // compatibility in case execution order changes in the future.
            return nextConfig;
        },
    ]);

const withScheduleWidget = (config) => {
    config = ensureAppGroupInEntitlements(config);
    config = copyWidgetTemplateFiles(config);
    config = addWidgetTargetToXcodeProject(config);
    config = postProcessXcodeProject(config);
    return config;
};

module.exports = withScheduleWidget;
