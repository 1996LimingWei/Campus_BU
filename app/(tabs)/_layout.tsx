import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { Bot, Calendar as CalendarIcon, GraduationCap, Map as MapIcon, User as UserIcon } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AnimatedTabIcon } from '../../components/common/AnimatedTabIcon';
import { useCourseActivity } from '../../context/CourseActivityContext';
import { useNotifications } from '../../context/NotificationContext';
import { getTabLabel } from './tabLabels';

const AgentTabIcon = ({ color, focused }: { color: string; focused: boolean }) => (
  <View style={styles.agentTabIcon}>
    <AnimatedTabIcon focused={focused} color={color} size={20} IconComponent={Bot} />
    <View style={styles.agentChart}>
      <View style={[styles.agentChartBar, { height: 6, backgroundColor: color, opacity: focused ? 1 : 0.72 }]} />
      <View style={[styles.agentChartBar, { height: 10, backgroundColor: color, opacity: focused ? 1 : 0.72 }]} />
      <View style={[styles.agentChartBar, { height: 14, backgroundColor: color, opacity: focused ? 1 : 0.72 }]} />
    </View>
  </View>
);

export default function TabLayout() {
  const { t } = useTranslation('translation', { keyPrefix: 'tabs' });
  const scrollX = useRef(new Animated.Value(0)).current;
  const [containerWidth, setContainerWidth] = useState(0);
  const routeLabelKeyMap: Partial<Record<string, 'home' | 'map' | 'agent' | 'course' | 'me'>> = {
    campus: 'home',
    map: 'map',
    agent: 'agent',
    course: 'course',
    profile: 'me',
  };

  // Custom TabBar Component to handle the sliding indicator
  const CustomTabBar = ({ state, descriptors, navigation }: any) => {
    const { hasAnyUnread, totalUnreadCount } = useNotifications();
    const { hasAnyUnread: hasCourseActivityUnread } = useCourseActivity();
    // Filter out tabs that should be hidden (href: null) OR don't have an icon
    const visibleRoutes = state.routes.filter((r: any) => {
      const { options } = descriptors[r.key];
      return options.href !== null && options.tabBarIcon !== undefined;
    });

    const totalTabs = visibleRoutes.length;

    // Find the current active index among visible tabs
    const activeRouteName = state.routes[state.index].name;
    const activeIndex = visibleRoutes.findIndex((r: any) => r.name === activeRouteName);

    useEffect(() => {
      if (containerWidth > 0 && activeIndex !== -1 && totalTabs > 0) {
        const tabWidth = (containerWidth - 16) / totalTabs;
        Animated.spring(scrollX, {
          toValue: activeIndex * tabWidth,
          useNativeDriver: true,
          stiffness: 200,
          damping: 22,
        }).start();
      }
    }, [activeIndex, containerWidth, totalTabs]);

    return (
      <View style={styles.tabBarWrapper}>
        <View
          style={styles.tabBarContainer}
          onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
        >
          <BlurView intensity={80} tint="light" style={StyleSheet.absoluteFill} />

          {/* Sliding Indicator */}
          {containerWidth > 0 && totalTabs > 0 && activeIndex !== -1 && (
            <Animated.View
              style={[
                styles.slidingIndicator,
                {
                  width: (containerWidth - 16) / totalTabs,
                  transform: [{ translateX: scrollX }]
                }
              ]}
            />
          )}

          {visibleRoutes.map((route: any, index: number) => {
            const { options } = descriptors[route.key];
            const routeLabelKey = routeLabelKeyMap[route.name];
            const label = routeLabelKey
              ? getTabLabel(t, routeLabelKey)
              : (typeof options.tabBarLabel === 'string' ? options.tabBarLabel : route.name);
            const isFocused = activeIndex === index;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (route.name === 'map' && !event.defaultPrevented) {
                navigation.navigate(route.name, { openFoodMap: 'true' });
                return;
              }

              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            };

            return (
              <TouchableOpacity
                key={route.key}
                onPress={onPress}
                style={styles.tabButton}
                activeOpacity={0.7}
              >
                {options.tabBarIcon && options.tabBarIcon({
                  color: isFocused ? '#1E3A8A' : '#8E8E93',
                  focused: isFocused
                })}
                {route.name === 'profile' && (hasAnyUnread || totalUnreadCount > 0) && (
                  <View style={styles.unreadDot} />
                )}
                {route.name === 'course' && hasCourseActivityUnread && (
                  <View style={styles.unreadDot} />
                )}
                <Text style={[styles.tabLabel, { color: isFocused ? '#1E3A8A' : '#8E8E93' }]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        lazy: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="campus"
        options={{
          tabBarLabel: getTabLabel(t, 'home'),
          tabBarIcon: ({ color, focused }) => (
            <AnimatedTabIcon focused={focused} color={color} size={22} IconComponent={CalendarIcon} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          tabBarLabel: getTabLabel(t, 'map'),
          tabBarIcon: ({ color, focused }) => (
            <AnimatedTabIcon focused={focused} color={color} size={22} IconComponent={MapIcon} />
          ),
        }}
      />
      <Tabs.Screen
        name="classroom"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="agent"
        options={{
          tabBarLabel: getTabLabel(t, 'agent'),
          tabBarIcon: ({ color, focused }) => (
            <AgentTabIcon color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="course"
        options={{
          tabBarLabel: getTabLabel(t, 'course'),
          tabBarIcon: ({ color, focused }) => (
            <AnimatedTabIcon focused={focused} color={color} size={22} IconComponent={GraduationCap} />
          ),
        }}
      />
      <Tabs.Screen
        name="connect"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarLabel: getTabLabel(t, 'me'),
          tabBarIcon: ({ color, focused }) => (
            <AnimatedTabIcon focused={focused} color={color} size={22} IconComponent={UserIcon} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarWrapper: {
    position: 'absolute',
    bottom: 25,
    left: 20,
    right: 20,
    height: 64,
  },
  tabBarContainer: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    paddingHorizontal: 8,
  },
  slidingIndicator: {
    position: 'absolute',
    top: 8,
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(30, 58, 138, 0.1)',
    borderRadius: 18,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  unreadDot: {
    position: 'absolute',
    top: 10,
    right: '28%',
    backgroundColor: '#EF4444',
    borderRadius: 4,
    width: 8,
    height: 8,
  },
  agentTabIcon: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
  },
  agentChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 16,
    marginLeft: -1,
    gap: 1.5,
  },
  agentChartBar: {
    width: 3,
    borderRadius: 999,
  },
});
