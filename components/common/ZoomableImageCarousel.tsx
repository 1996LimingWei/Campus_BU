import { X } from 'lucide-react-native';
import { Image as ExpoImage } from 'expo-image';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Dimensions,
    FlatList,
    Image,
    Modal,
    NativeScrollEvent,
    NativeSyntheticEvent,
    StyleSheet,
    TouchableOpacity,
    View,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { 
    runOnJS, 
    useAnimatedStyle, 
    useSharedValue, 
    withSpring, 
    withTiming,
    interpolate,
    Extrapolate,
    SharedValue
} from 'react-native-reanimated';

interface ZoomableImageCarouselProps {
    images: string[];
    width: number;
    height: number;
    contentFit?: 'cover' | 'contain';
    onZoomStateChange?: (zoomed: boolean) => void;
}

interface PreviewImageItemProps {
    uri: string;
    width: number;
    height: number;
    contentFit: 'cover' | 'contain';
    onPress: () => void;
}

interface FullscreenImageItemProps {
    uri: string;
    width: number;
    height: number;
    active: boolean;
    backdropOpacity: SharedValue<number>;
    onZoomStateChange: (zoomed: boolean) => void;
    onClose: () => void;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const MIN_SCALE = 1;
const DOUBLE_TAP_SCALE = 2;
const MAX_SCALE = 4;
const DISMISS_THRESHOLD = 80;

function clamp(value: number, min: number, max: number) {
    'worklet';
    return Math.max(min, Math.min(max, value));
}

const PreviewImageItem: React.FC<PreviewImageItemProps> = ({
    uri,
    width,
    height,
    contentFit,
    onPress,
}) => {
    return (
        <View style={[styles.page, { width, height }]}>
            <TouchableOpacity activeOpacity={0.9} onPress={onPress}>
                <View style={[styles.imageSurface, { width, height }]}>
                    <ExpoImage
                        source={{ uri }}
                        style={{ width, height }}
                        contentFit={contentFit}
                        cachePolicy="memory-disk"
                    />
                </View>
            </TouchableOpacity>
        </View>
    );
};

const FullscreenImageItem: React.FC<FullscreenImageItemProps> = ({
    uri,
    width,
    height,
    active,
    backdropOpacity,
    onZoomStateChange,
    onClose,
}) => {
    const scale = useSharedValue(1);
    const savedScale = useSharedValue(1);
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const savedTranslateX = useSharedValue(0);
    const savedTranslateY = useSharedValue(0);
    const focalX = useSharedValue(0);
    const focalY = useSharedValue(0);

    useEffect(() => {
        if (!active) {
            scale.value = 1;
            translateX.value = 0;
            translateY.value = 0;
        }
    }, [active]);

    const pinchGesture = Gesture.Pinch()
        .enabled(active)
        .onStart((event) => {
            focalX.value = event.focalX;
            focalY.value = event.focalY;
            savedScale.value = scale.value;
            savedTranslateX.value = translateX.value;
            savedTranslateY.value = translateY.value;
        })
        .onUpdate((event) => {
            const nextScale = clamp(savedScale.value * event.scale, MIN_SCALE, MAX_SCALE);
            scale.value = nextScale;

            if (nextScale > 1) {
                const deltaScale = nextScale / savedScale.value;
                const fx = focalX.value - width / 2;
                const fy = focalY.value - height / 2;
                translateX.value = savedTranslateX.value + (1 - deltaScale) * (fx - savedTranslateX.value);
                translateY.value = savedTranslateY.value + (1 - deltaScale) * (fy - savedTranslateY.value);
            }
        })
        .onEnd(() => {
            savedScale.value = scale.value;
            savedTranslateX.value = translateX.value;
            savedTranslateY.value = translateY.value;
            runOnJS(onZoomStateChange)(scale.value > 1.05);
        });

    const panGesture = Gesture.Pan()
        .enabled(active)
        .onUpdate((event) => {
            if (scale.value <= 1.05) {
                // Dominant vertical movement or already swiping down
                if (translateY.value > 0 || Math.abs(event.translationY) > Math.abs(event.translationX)) {
                    if (event.translationY > 0) {
                        translateY.value = event.translationY;
                        translateX.value = event.translationX * 0.4;
                        // Shrink image slightly while pulling down
                        scale.value = interpolate(translateY.value, [0, 600], [1, 0.7], Extrapolate.CLAMP);
                        // Fade backdrop to 0
                        backdropOpacity.value = interpolate(translateY.value, [0, 400], [1, 0], Extrapolate.CLAMP);
                    }
                }
                return;
            }

            const maxTX = (width * scale.value - width) / 2;
            const maxTY = (height * scale.value - height) / 2;
            translateX.value = clamp(savedTranslateX.value + event.translationX, -maxTX, maxTX);
            translateY.value = clamp(savedTranslateY.value + event.translationY, -maxTY, maxTY);
        })
        .onEnd((event) => {
            if (scale.value <= 1.05) {
                if (event.translationY > DISMISS_THRESHOLD || event.velocityY > 500) {
                    runOnJS(onClose)();
                } else {
                    translateY.value = withSpring(0, { damping: 20 });
                    translateX.value = withSpring(0, { damping: 20 });
                    scale.value = withSpring(1, { damping: 20 });
                    backdropOpacity.value = withTiming(1, { duration: 200 });
                }
                return;
            }
            savedTranslateX.value = translateX.value;
            savedTranslateY.value = translateY.value;
        })
        // Allow FlatList to take over horizontal swipes
        .activeOffsetX([-20, 20]);

    const doubleTap = Gesture.Tap()
        .numberOfTaps(2)
        .onEnd((_event, success) => {
            if (!success) return;
            const nextScale = scale.value > 1.05 ? 1 : DOUBLE_TAP_SCALE;
            scale.value = withTiming(nextScale, { duration: 200 });
            translateX.value = withTiming(0, { duration: 200 });
            translateY.value = withTiming(0, { duration: 200 });
            savedScale.value = nextScale;
            savedTranslateX.value = 0;
            savedTranslateY.value = 0;
            runOnJS(onZoomStateChange)(nextScale > 1.05);
        });

    const gesture = Gesture.Simultaneous(pinchGesture, panGesture, doubleTap);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: translateX.value },
            { translateY: translateY.value },
            { scale: scale.value },
        ],
    }));

    return (
        <View style={[styles.page, { width, height }]}>
            <GestureDetector gesture={gesture}>
                <Animated.View style={[styles.imageSurface, { width, height }, animatedStyle]}>
                    <ExpoImage
                        source={{ uri }}
                        style={{ width, height }}
                        contentFit="contain"
                        cachePolicy="memory-disk"
                        transition={200}
                    />
                </Animated.View>
            </GestureDetector>
        </View>
    );
};

export const ZoomableImageCarousel: React.FC<ZoomableImageCarouselProps> = ({
    images,
    width,
    height,
    contentFit = 'cover',
    onZoomStateChange,
}) => {
    const imageList = useMemo(() => images.filter(Boolean), [images]);
    const [viewerVisible, setViewerVisible] = useState(false);
    const [viewerIndex, setViewerIndex] = useState(0);
    const [isZoomed, setIsZoomed] = useState(false);
    const [inlineIndex, setInlineIndex] = useState(0);

    const backdropOpacity = useSharedValue(0);

    const openViewer = (index: number) => {
        setViewerIndex(index);
        backdropOpacity.value = withTiming(1, { duration: 150 });
        setViewerVisible(true);
        onZoomStateChange?.(true);
    };

    const closeViewer = () => {
        setIsZoomed(false);
        onZoomStateChange?.(false);
        backdropOpacity.value = withTiming(0, { duration: 150 }, () => {
            runOnJS(setViewerVisible)(false);
        });
    };

    const handleInlineScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const index = Math.round(event.nativeEvent.contentOffset.x / width);
        setInlineIndex(index);
    };

    const backdropStyle = useAnimatedStyle(() => ({
        opacity: backdropOpacity.value,
        backgroundColor: '#000',
    }));

    return (
        <View style={[styles.container, { width, height }]}>
            <FlatList
                data={imageList}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item, index) => `${item}-${index}`}
                onMomentumScrollEnd={handleInlineScroll}
                initialNumToRender={1}
                maxToRenderPerBatch={2}
                windowSize={3}
                renderItem={({ item, index }) => (
                    <PreviewImageItem
                        uri={item}
                        width={width}
                        height={height}
                        contentFit={contentFit}
                        onPress={() => openViewer(index)}
                    />
                )}
            />
            {imageList.length > 1 && (
                <View style={styles.dotRow}>
                    {imageList.map((_, i) => (
                        <View key={i} style={[styles.dot, i === inlineIndex && styles.dotActive]} />
                    ))}
                </View>
            )}

            <Modal visible={viewerVisible} transparent animationType="none" onRequestClose={closeViewer}>
                <GestureHandlerRootView style={{ flex: 1, backgroundColor: 'transparent' }}>
                    <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]} />
                    <FlatList
                        data={imageList}
                        horizontal
                        pagingEnabled
                        scrollEnabled={!isZoomed}
                        initialScrollIndex={viewerIndex}
                        getItemLayout={(_, index) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index })}
                        keyExtractor={(item, index) => `v-${item}-${index}`}
                        removeClippedSubviews={true}
                        initialNumToRender={1}
                        maxToRenderPerBatch={2}
                        windowSize={3}
                        renderItem={({ item, index }) => (
                            <FullscreenImageItem
                                uri={item}
                                width={SCREEN_WIDTH}
                                height={SCREEN_HEIGHT}
                                active={viewerVisible && viewerIndex === index}
                                backdropOpacity={backdropOpacity}
                                onZoomStateChange={setIsZoomed}
                                onClose={closeViewer}
                            />
                        )}
                        onMomentumScrollEnd={(e) => {
                            const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                            setViewerIndex(idx);
                        }}
                    />
                    
                    {!isZoomed && imageList.length > 1 && (
                        <View style={[styles.dotRow, { bottom: 40 }]}>
                            {imageList.map((_, i) => (
                                <View key={i} style={[styles.dot, i === viewerIndex && styles.dotActive]} />
                            ))}
                        </View>
                    )}

                    {!isZoomed && (
                        <TouchableOpacity style={styles.closeBtn} onPress={closeViewer}>
                            <X size={24} color="#fff" />
                        </TouchableOpacity>
                    )}
                </GestureHandlerRootView>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#f3f4f6',
        borderRadius: 12,
        overflow: 'hidden',
    },
    page: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    imageSurface: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    blackBackdrop: {
        backgroundColor: '#000',
    },
    dotRow: {
        position: 'absolute',
        bottom: 12,
        alignSelf: 'center',
        flexDirection: 'row',
        gap: 6,
        backgroundColor: 'rgba(0,0,0,0.2)',
        padding: 6,
        borderRadius: 12,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: 'rgba(255,255,255,0.4)',
    },
    dotActive: {
        backgroundColor: '#fff',
    },
    closeBtn: {
        position: 'absolute',
        top: 50,
        right: 20,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'center',
        alignItems: 'center',
    },
});
