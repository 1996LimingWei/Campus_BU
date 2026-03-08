import React, { useEffect, useState } from 'react';
import { Dimensions, Image, StyleSheet, Text } from 'react-native';
import Animated, {
    Easing,
    Extrapolation,
    interpolate,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withTiming
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');
const MAX_SCALE = Math.max(width, height) / 40; // Scale sufficient to cover screen

interface StartupAnimationProps {
    isAppReady: boolean;
    onFinish: () => void;
}

export const StartupAnimation: React.FC<StartupAnimationProps> = ({ isAppReady, onFinish }) => {
    // 0 to 100 for the progress bar width
    const progressWidth = useSharedValue(0);

    // Fade in text and progress bar slightly after mount
    const elementsOpacity = useSharedValue(0);

    // Main explosion scale: 1 -> MAX_SCALE
    const scale = useSharedValue(1);

    // Fades out the logo content (image and bar) as it scales
    const contentOpacity = useSharedValue(1);

    // Final fade of the whole screen to reveal the app
    const containerOpacity = useSharedValue(1);

    // Breathing scale for logo and text
    const breathingScale = useSharedValue(1);

    const [hasExploded, setHasExploded] = useState(false);

    useEffect(() => {
        // Upon mount, softly fade in the progress bar container
        elementsOpacity.value = withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) });

        // Start the fake loading progress up to ~85% (slowed down to 2500ms)
        progressWidth.value = withTiming(85, {
            duration: 2500,
            easing: Easing.out(Easing.cubic)
        });

        // Loop breathing animation (more pronounced pulsing)
        breathingScale.value = withRepeat(
            withSequence(
                withTiming(1.08, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
                withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) })
            ),
            -1, // Infinite repeat
            true // Alternate direction
        );
    }, []);

    useEffect(() => {
        // When the app signals it's actually ready
        if (isAppReady && !hasExploded) {
            setHasExploded(true);

            // 1. Push the progress bar to 100% (slightly slower)
            progressWidth.value = withTiming(100, {
                duration: 600,
                easing: Easing.inOut(Easing.ease)
            }, (finishedProgress) => {
                if (finishedProgress) {
                    // 2. The Slow, Buttery Smooth Explosion
                    const smoothExplosionEasing = Easing.bezier(0.5, 0, 0.2, 1);

                    // Explosion takes 1100ms for extra smoothness
                    scale.value = withTiming(MAX_SCALE, {
                        duration: 1100,
                        easing: smoothExplosionEasing
                    }, (finishedScale) => {
                        if (finishedScale) {
                            runOnJS(onFinish)();
                        }
                    });

                    // 3. Smoothly fade out the content
                    contentOpacity.value = withSequence(
                        withDelay(200, withTiming(0, { duration: 500, easing: Easing.inOut(Easing.ease) }))
                    );

                    // 4. Finally, fade out the whole screen (slightly later)
                    containerOpacity.value = withSequence(
                        withDelay(700, withTiming(0, { duration: 600, easing: Easing.inOut(Easing.ease) }))
                    );
                }
            });
        }
    }, [isAppReady, hasExploded, onFinish]);

    const logoStyle = useAnimatedStyle(() => {
        return {
            opacity: contentOpacity.value,
            transform: [{ scale: breathingScale.value }],
        };
    });

    const dropStyle = useAnimatedStyle(() => {
        return {
            transform: [{ scale: scale.value }],
            opacity: interpolate(scale.value, [1, 2], [0, 1], Extrapolation.CLAMP)
        };
    });

    const progressBarStyle = useAnimatedStyle(() => {
        return {
            width: `${progressWidth.value}%`,
        };
    });

    const elementsStyle = useAnimatedStyle(() => {
        return {
            opacity: elementsOpacity.value,
        };
    });

    const overlayStyle = useAnimatedStyle(() => {
        return {
            opacity: containerOpacity.value,
        };
    });

    return (
        <Animated.View style={[styles.container, overlayStyle]} pointerEvents="none">
            {/* The expanding Blue Drop that creates the screen transition */}
            <Animated.View style={[styles.drop, dropStyle]} />

            <Animated.View style={[styles.contentWrapper, elementsStyle]}>
                {/* The Logo Image */}
                <Animated.View style={[styles.logoContainer, logoStyle]}>
                    <Image
                        source={require('../../assets/images/HKCampusicon.png')}
                        style={styles.logo}
                        resizeMode="contain"
                    />
                </Animated.View>

                {/* Brand Name */}
                <Animated.View style={[styles.brandContainer, logoStyle]}>
                    <Text style={styles.brandName}>HKCampus</Text>
                </Animated.View>

                {/* The Smooth Progress Bar */}
                <Animated.View style={[styles.progressContainer, logoStyle]}>
                    <Animated.View style={[styles.progressBar, progressBarStyle]} />
                </Animated.View>

                {/* Subtitle / Slogan */}
                <Animated.View style={[styles.subtitleContainer, logoStyle]}>
                    <Text style={styles.subtitle}>All For Students</Text>
                </Animated.View>
            </Animated.View>

            {/* Footer Version Info */}
            <Animated.View style={[styles.footer, logoStyle]}>
                <Text style={styles.footerText}>Version 1.0.0 • HKBU</Text>
            </Animated.View>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
    },
    drop: {
        position: 'absolute',
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: '#FFFFFF', // Explodes into a pure white mask
    },
    contentWrapper: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    logoContainer: {
        width: 140,
        height: 140,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 40, // Space for progress bar
    },
    logo: {
        width: '100%',
        height: '100%',
    },
    brandContainer: {
        marginBottom: 20,
        alignItems: 'center',
    },
    brandName: {
        fontSize: 32,
        fontWeight: '700',
        color: '#111827',
        letterSpacing: -0.5,
    },
    progressContainer: {
        width: 160,
        height: 4,
        backgroundColor: '#E5E7EB', // Faint gray track
        borderRadius: 2,
        overflow: 'hidden',
    },
    progressBar: {
        height: '100%',
        backgroundColor: '#1E3A8A', // Blue fill
        borderRadius: 2,
    },
    subtitleContainer: {
        marginTop: 16,
        alignItems: 'center',
    },
    subtitle: {
        fontSize: 12,
        fontWeight: '500',
        color: '#86868b', // Apple gray
        letterSpacing: 2,
        textTransform: 'uppercase',
    },
    footer: {
        position: 'absolute',
        bottom: 60,
        alignItems: 'center',
    },
    footerText: {
        color: '#d2d2d7',
        fontSize: 12,
        fontWeight: '400',
        letterSpacing: 0.5,
    }
});
