const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const path = require('path');

config.resolver.unstable_enablePackageExports = true;
config.resolver.sourceExts = [...config.resolver.sourceExts, 'mjs', 'cjs'];

config.resolver.extraNodeModules = {
    ...config.resolver.extraNodeModules,
    'node:async_hooks': path.resolve(__dirname, 'services/agent/mocks/async_hooks.js'),
    'async_hooks': path.resolve(__dirname, 'services/agent/mocks/async_hooks.js'),
};

const UUID_SHIM = path.resolve(__dirname, 'scripts/stubs/uuid.js');

const LANGSMITH_VERSION_STUB = path.resolve(
    __dirname,
    'scripts/stubs/langsmith-version.js'
);
const LANGSMITH_DIST_SEG = path.join('langsmith', 'dist') + path.sep;
const LANGSMITH_INDEX_PATH = path.join('langsmith', 'dist', 'index.js');

const defaultResolver = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName === 'uuid' || moduleName === 'uuid/wrapper.mjs') {
        return { filePath: UUID_SHIM, type: 'sourceFile' };
    }

    if (
        (moduleName === './index.js' || moduleName === '../index.js') &&
        context.originModulePath &&
        context.originModulePath.includes(LANGSMITH_DIST_SEG) &&
        !context.originModulePath.endsWith(LANGSMITH_INDEX_PATH)
    ) {
        return { filePath: LANGSMITH_VERSION_STUB, type: 'sourceFile' };
    }

    if (defaultResolver) {
        return defaultResolver(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
