import 'react-native-gesture-handler';
import 'fast-text-encoding';
import { TextDecoder, TextEncoder } from 'fast-text-encoding';
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

// Silence i18next promotional info logs in development output.
const originalConsoleInfo = console.info;
console.info = (...args) => {
    const first = args?.[0];
    if (typeof first === 'string' && first.includes('i18next is maintained with support from Locize')) {
        return;
    }
    originalConsoleInfo(...args);
};

// Ensure global Web APIs are available
if (typeof global.TextEncoder === 'undefined') {
    global.TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === 'undefined') {
    global.TextDecoder = TextDecoder;
}

// Robust AbortSignal polyfill
if (typeof AbortSignal !== 'undefined' && !AbortSignal.prototype.throwIfAborted) {
    AbortSignal.prototype.throwIfAborted = function () {
        if (this.aborted) {
            const error = new Error('The operation was aborted');
            error.name = 'AbortError';
            throw error;
        }
    };
}

// polyfill process and location for LangChain/LangGraph
if (typeof process === 'undefined') {
    global.process = { env: {}, argv: [], version: '', platform: 'android', arch: 'arm64' };
} else {
    if (!process.env) process.env = {};
    if (!process.argv) process.argv = [];
    if (!process.version) process.version = '';
    if (!process.platform) process.platform = 'android';
    if (!process.arch) process.arch = 'arm64';
}

if (typeof navigator !== 'undefined' && !navigator.userAgent) {
    navigator.userAgent = 'ReactNative';
}

if (typeof window !== 'undefined' && !window.location) {
    window.location = {
        protocol: 'https:',
        href: '',
        hostname: '',
        pathname: '',
        search: '',
        hash: '',
    };
} else if (typeof global !== 'undefined' && !global.location) {
    global.location = { protocol: 'https:', href: '' };
}

// Load expo-router
import 'expo-router/entry';

