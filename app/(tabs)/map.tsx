import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Building, ChevronRight, Crosshair, Heart, Image as ImageIcon, MapPin, MessageCircle, Utensils, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    Easing,
    Image,
    InteractionManager,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { WebView } from 'react-native-webview';
import { CAMPUS_BUILDINGS } from '../../data/buildings';
import storage from '../../lib/storage';
import { getCurrentUser } from '../../services/auth';
import { getBuildings } from '../../services/buildings';
import { fetchPosts } from '../../services/campus';
import { CAMPUS_LOCATIONS } from '../../services/locations';
import { CampusLocation } from '../../types';
import { compressImage } from '../../utils/image';

const { width, height } = Dimensions.get('window');

// HKBU Campus coordinates (Aligned with WLB/Heart of Campus)
const HKBU_CENTER = {
    lat: 22.3377659528824,
    lng: 114.181895256042
};

// Keep edit button code path for future use, but hide it in current builds.
const SHOW_BUILDING_EDIT_BUTTON = false;

const FOOD_ORDER_OPTIONS = [
    { key: 'main-canteen', name: 'Main Canteen', orderUrl: 'https://csd2.order.place/store/112867/mode/prekiosk' },
    { key: 'chapter-coffee', name: 'Chapter Coffee', orderUrl: 'https://app.eats365pos.com/hk/tc/chaptercoffee_kowloontong/menu' },
    { key: 'harmony-cafeteria', name: 'Harmony Cafeteria', orderUrl: 'https://food.order.place/home/store/5768631610769408?mode=prekiosk' },
];

type FilterType = 'newest' | 'hottest' | 'viewed' | 'mine';

const FILTERS: { id: FilterType; label: string; color: string; bg: string }[] = [
    { id: 'newest', label: 'Newest', color: '#2196F3', bg: '#BBDEFB' },     // Blue
    { id: 'hottest', label: 'Hottest', color: '#F44336', bg: '#FFCDD2' },   // Red
    { id: 'viewed', label: 'Most Viewed', color: '#FF9800', bg: '#FFE0B2' }, // Orange
    { id: 'mine', label: 'My Pins', color: '#FFEB3B', bg: '#FFF9C4' },      // Yellow
];

// Generate Leaflet HTML with markers
const generateMapHTML = (
    posts: any[],
    foodSpots: CampusLocation[] = [],
    buildings: CampusLocation[] = [],
    showFoodMap: boolean = false,
    showBuildingMap: boolean = false,
    editMode: boolean = false,
    navTarget: { lat: number, lng: number } | null = null,
    isNavigating: boolean = false,
    currentUserId: string | null = null,
    t: any
): string => {
    // Pin SVG Template (Teardrop shape like standard marker)
    const pinSvg = (color: string, isMine: boolean = false) => `
        <svg width="24" height="32" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0px 2px 3px rgba(0,0,0,0.3));">
            <path d="M12 0C5.37258 0 0 5.37258 0 12C0 21 12 32 12 32C12 32 24 21 24 12C24 5.37258 18.6274 0 12 0Z" fill="${isMine ? '#FF4500' : color}"/>
            <circle cx="12" cy="12" r="4" fill="white" fill-opacity="0.9"/>
            ${isMine ? '<circle cx="12" cy="12" r="6" stroke="white" stroke-width="1.5" fill="none"/>' : ''}
        </svg>
    `;

    // Food Marker Template (Circular with Image + Building Label)
    const foodMarkerHtml = (imageUrl: string, name: string, description: string, labelPosition: 'top' | 'bottom' = 'top') => {
        const buildingMatch = description.match(/\(([^)]+)\)/);
        const building = buildingMatch ? buildingMatch[1] : '';
        const labelHtml = building ? `
            <div style="
                background: #FF6B6B;
                color: white;
                font-size: 8px;
                font-weight: bold;
                padding: 1px 4px;
                border-radius: 4px;
                z-index: 10;
                border: 1px solid white;
                white-space: nowrap;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                ${labelPosition === 'top' ? 'margin-bottom: -6px;' : 'margin-top: -6px;'}
            ">🏢 ${building}</div>` : '';

        return `
            <div style="display: flex; flex-direction: column; align-items: center;">
                ${labelPosition === 'top' ? labelHtml : ''}
                <div style="
                    width: 36px;
                    height: 36px;
                    border-radius: 18px;
                    background: white;
                    border: 2px solid #FF6B6B;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                    overflow: hidden;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: transform 0.2s;
                    position: relative;
                " onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
                    <img src="${imageUrl}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='https://cdn-icons-png.flaticon.com/512/3170/3170733.png'"/>
                </div>
                ${labelPosition === 'bottom' ? labelHtml : ''}
            </div>
        `;
    };

    // Building Marker Template (Blue Square with Label)
    const buildingMarkerHtml = (name: string) => {
        // If name is "Full Name (ABBR)", extract "ABBR". Otherwise use clean name.
        const abbrMatch = name.match(/\(([^)]+)\)/);
        const abbr = abbrMatch ? abbrMatch[1] : name;

        return `
            <div style="display: flex; flex-direction: column; align-items: center;">
                <div style="
                    background: #4B0082;
                    color: white;
                    font-size: 10px;
                    font-weight: bold;
                    padding: 2px 6px;
                    border-radius: 4px;
                    border: 1px solid white;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                    margin-bottom: -4px;
                    z-index: 10;
                    white-space: nowrap;
                ">${abbr}</div>
                <div style="
                    width: 12px;
                    height: 12px;
                    background: #4B0082;
                    border: 2px solid white;
                    border-radius: 50%;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                "></div>
            </div>
        `;
    };

    const markers = posts.map(post => {
        if (!post || !post.location) return '';
        const isMine = !!(currentUserId && post.authorId === currentUserId);
        const color = isMine ? '#FF4500' : (post.pinColor || '#2196F3');

        // Translate category if it's one of the standards
        let displayCategory = post.category || t('map.markers.general');
        if (displayCategory === 'Events') displayCategory = t('campus.categories.events');
        else if (displayCategory === 'Reviews') displayCategory = t('campus.categories.reviews');
        else if (displayCategory === 'Guides') displayCategory = t('campus.categories.guides');
        else if (displayCategory === 'Lost & Found') displayCategory = t('campus.categories.lost_found');

        return `
        L.marker([${post.location.lat}, ${post.location.lng}], { 
            icon: L.divIcon({
                className: 'custom-pin-icon',
                html: \`${pinSvg(color, isMine)}\`,
                iconSize: [24, 32],
                iconAnchor: [12, 32],
                popupAnchor: [0, -32]
            }) 
        })
        .addTo(markerLayer)
        .bindPopup(\`
            <div style="min-width: 150px; padding: 2px;">
                <div style="font-weight: bold; margin-bottom: 4px; color: ${color};">
                    ${post.authorName || t('map.markers.user')} • ${displayCategory}
                </div>
                <div style="font-size: 11px; color: #888; margin-bottom: 6px;">
                    ${post.time || t('map.markers.just_now')}
                </div>
                <div style="font-size: 13px; line-height: 1.4; color: #333;">
                    ${post.content ? post.content.replace(/`/g, "\\`").replace(/'/g, "\\'").replace(/\n/g, '<br/>') : ''}
                </div>
                ${post.locationTag ? `<div style="font-size: 11px; color: #1E3A8A; margin-top: 6px; font-weight: 600;">📍 ${post.locationTag}</div>` : ''}
                <div style="margin-top: 8px; display: flex; align-items: center; gap: 8px; border-top: 1px solid #eee; pt: 8px;">
                     <span style="font-size: 11px;">❤️ ${post.likes || 0}</span>
                     <span style="font-size: 11px;">💬 ${post.comments || 0}</span>
                </div>
            </div>
        \`, { closeButton: false, offset: [0, -20] });
        `;
    }).join('\n');

    const foodMarkers = foodSpots.map(spot => {
        // Southern markers in crowded pairs get 'bottom' labels
        const labelPos = (['o5', 'o7', 'o14'].includes(spot.id)) ? 'bottom' : 'top';

        return `
            L.marker([${spot.coordinates.latitude}, ${spot.coordinates.longitude}], { 
                icon: L.divIcon({
                    className: 'food-marker-icon',
                    html: \`${foodMarkerHtml(spot.imageUrl || '', spot.name, spot.description || '', labelPos)}\`,
                    iconSize: [50, 50],
                    iconAnchor: [25, 25],
                    popupAnchor: [0, -18]
                }) 
            })
            .addTo(foodLayer)
            .bindPopup(\`
                <div style="min-width: 160px; padding: 2px;">
                    <img src="${spot.imageUrl}" style="width: 100%; height: 80px; object-fit: cover; border-radius: 8px; margin-bottom: 8px;" />
                    <div style="font-weight: bold; font-size: 14px; margin-bottom: 4px; color: #111;">${spot.name}</div>
                    <div style="font-size: 12px; color: #666; margin-bottom: 6px;">🕒 ${spot.hours || 'N/A'}</div>
                    <div style="font-size: 11px; color: #444; line-height: 1.4;">${spot.description}</div>
                    <div style="margin-top: 10px; display: flex; justify-content: center;">
                        <button onclick="window.ReactNativeWebView.postMessage(JSON.stringify({type: 'view_food', id: '${spot.id}'}))" style="
                            background: #FF6B6B;
                            color: white;
                            border: none;
                            padding: 6px 12px;
                            border-radius: 6px;
                            font-size: 12px;
                            font-weight: bold;
                            cursor: pointer;
                            width: 100%;
                        ">${t('map.markers.view_details')}</button>
                    </div>
                </div>
            \`, { closeButton: false });
        `;
    }).join('\n');

    const buildingMarkers = buildings.map(b => {
        return `
            var bm = L.marker([${b.coordinates.latitude}, ${b.coordinates.longitude}], { 
                icon: L.divIcon({
                    className: 'building-marker-icon',
                    html: \`${buildingMarkerHtml(b.name)}\`,
                    iconSize: [40, 40],
                    iconAnchor: [20, 26],
                    popupAnchor: [0, -20]
                }),
                draggable: ${editMode} 
            })
            .addTo(buildingLayer)
            .bindPopup(\`
                <div style="min-width: 160px; padding: 2px;">
                    <img src="${b.imageUrl}" style="width: 100%; height: 80px; object-fit: cover; border-radius: 8px; margin-bottom: 8px;" onerror="this.style.display='none'" />
                    <div style="font-weight: bold; font-size: 14px; margin-bottom: 2px; color: #111;">${b.description || b.name}</div>
                    <div style="font-size: 11px; color: #444; line-height: 1.4;">${b.description ? b.name : ''} ${t('map.markers.building')}</div>
                    ${editMode ? `<div style="font-size: 10px; color: red; margin-top: 4px;">${t('map.markers.drag_to_move')}</div>` : ''}
                </div>
            \`, { closeButton: false });

            bm.on('dragend', function(e) {
                var newLatLng = e.target.getLatLng();
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'building_dragged',
                    id: '${b.id}',
                    lat: newLatLng.lat,
                    lng: newLatLng.lng
                }));
            });
        `;
    }).join('\n');

    return `
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { height: 100%; width: 100%; }
        #map { height: 100%; width: 100%; }
        .leaflet-popup-content-wrapper {
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        .leaflet-popup-content {
            margin: 12px;
        }
        .user-marker-pulse {
            width: 18px;
            height: 18px;
            background-color: #2196F3;
            border: 2.5px solid white;
            border-radius: 50%;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            animation: pulse 2s infinite;
            position: relative;
            z-index: 5;
        }
        .user-direction-arrow {
            position: absolute;
            top: -14px;
            left: 50%;
            transform: translateX(-50%);
            width: 0;
            height: 0;
            border-left: 8px solid transparent;
            border-right: 8px solid transparent;
            border-bottom: 14px solid #2196F3;
            filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));
            pointer-events: none;
            z-index: 10;
        }
        .user-direction-container {
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.1s linear;
        }
        @keyframes pulse {
            0% { box-shadow: 0 0 0 0 rgba(33, 150, 243, 0.4); }
            70% { box-shadow: 0 0 0 10px rgba(33, 150, 243, 0); }
            100% { box-shadow: 0 0 0 0 rgba(33, 150, 243, 0); }
        }
        .custom-pin-icon {
            background: transparent;
            border: none;
        }
    </style>
</head>
<body>
    <div id="map"></div>
    <script>
        // Initial View: Prioritize Navigation Target, then HKBU Center
        const initialLat = ${navTarget?.lat || HKBU_CENTER.lat};
        const initialLng = ${navTarget?.lng || HKBU_CENTER.lng};
        const initialZoom = ${navTarget ? 18 : 17};

        var map = L.map('map', {
            zoomControl: false,
            attributionControl: false
        }).setView([initialLat, initialLng], initialZoom);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(map);
        
        // Marker Layer Group
        var markerLayer = L.layerGroup().addTo(map);
        var foodLayer = L.layerGroup();
        var buildingLayer = L.layerGroup();
        
        if (${showFoodMap}) foodLayer.addTo(map);
        if (${showBuildingMap}) buildingLayer.addTo(map);
        
        /* [COMMENTED] Post Markers - 地图上的蓝色光标标记已禁用
        ${markers}
        */
        ${foodMarkers}
        ${buildingMarkers}
        
        // Manual Toggle Function
        window.setMarkersVisible = function(visible) {
            if (visible) {
                markerLayer.addTo(map);
            } else {
                map.removeLayer(markerLayer);
            }
        };

        window.setFoodMapVisible = function(visible) {
            if (visible) {
                foodLayer.addTo(map);
            } else {
                map.removeLayer(foodLayer);
            }
        };

        window.setBuildingMapVisible = function(visible) {
            if (visible) {
                buildingLayer.addTo(map);
            } else {
                map.removeLayer(buildingLayer);
            }
        };
        
        // User Location Marker
        var userMarker = null;

        window.updateUserLocation = function(lat, lng) {
            if (userMarker) {
                userMarker.setLatLng([lat, lng]);
            } else {
                var userIcon = L.divIcon({
                    className: 'user-marker-icon-container',
                    html: '<div id="user-heading-container" class="user-direction-container"><div class="user-direction-arrow"></div><div class="user-marker-pulse"></div></div>',
                    iconSize: [32, 32],
                    iconAnchor: [16, 16]
                });
                userMarker = L.marker([lat, lng], { 
                    icon: userIcon, 
                    zIndexOffset: 1000 
                }).addTo(map);
            }
            if (userMarker && userMarker.getElement()) {
                userMarker.getElement().style.display = 'block';
            }
        };

        window.updateUserHeading = function(heading) {
            var container = document.getElementById('user-heading-container');
            if (container) {
                container.style.transform = 'rotate(' + heading + 'deg)';
            }
        };

        window.centerMap = function(lat, lng) {
            map.flyTo([lat, lng], 18);
        };
        
        // Global variable for pending marker
        var pendingMarker = null;
        
        // Pin SVG for pending marker (Blue)
        const pendingPinSvg = \`
            <svg width="24" height="32" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0px 2px 3px rgba(0,0,0,0.3));">
                <path d="M12 0C5.37258 0 0 5.37258 0 12C0 21 12 32 12 32C12 32 24 21 24 12C24 5.37258 18.6274 0 12 0Z" fill="#2196F3"/>
                <circle cx="12" cy="12" r="4" fill="white" fill-opacity="0.9"/>
            </svg>
        \`;

        /* [COMMENTED] Map Click Handler - 点击地图发布评价功能已禁用
        map.on('click', function(e) {
            var lat = e.latlng.lat;
            var lng = e.latlng.lng;

            // Remove previous pending marker if exists
            if (pendingMarker) {
                map.removeLayer(pendingMarker);
            }

            // Add new pending marker (Pin)
            var pendingIcon = L.divIcon({
                className: 'custom-pin-icon',
                html: pendingPinSvg,
                iconSize: [24, 32],
                iconAnchor: [12, 32]
            });

            pendingMarker = L.marker([lat, lng], { icon: pendingIcon }).addTo(map);

            // Send to RN
            window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'map_clicked',
                lat: lat,
                lng: lng
            }));
        });
        */
        
        // Send message when post marker clicked
        map.on('popupopen', function(e) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'popup_open',
                lat: e.popup.getLatLng().lat,
                lng: e.popup.getLatLng().lng
            }));
        });
        // Navigation Line Logic
        window.navPath = null;
        window.drawNavigationPath = function(userLat, userLng, targetLat, targetLng) {
            if (window.navPath) {
                map.removeLayer(window.navPath);
            }
            var latlngs = [
                [userLat, userLng],
                [targetLat, targetLng]
            ];
            window.navPath = L.polyline(latlngs, {
                color: '#2196F3',
                weight: 6, // Thicker line
                opacity: 0.8,
                dashArray: '10, 10',
                lineCap: 'round'
            }).addTo(map);
            
            if (latlngs[0][0] !== 0 && latlngs[1][0] !== 0) {
                map.fitBounds(latlngs, { padding: [80, 80] });
            }

        };

        window.clearNavigationPath = function() {
            if (window.navPath) {
                map.removeLayer(window.navPath);
                window.navPath = null;
            }
        };

        // --- Initial State Injection (Navigation Path) ---
        
        if (${isNavigating && navTarget ? 'true' : 'false'}) {
            try {
                // Initial path setup (user marker will be added by injectJavaScript later)
                // window.drawNavigationPath is called from React when userLoc is available
            } catch(e) { console.error('Initial path failed', e); }
        }
    </script>
</body>
</html>
    `;
};

export default function MapScreen() {
    const { t } = useTranslation();
    const router = useRouter();
    const params = useLocalSearchParams();

    const FILTERS: { id: FilterType; label: string; color: string; bg: string }[] = [
        { id: 'newest', label: t('map.filters.newest'), color: '#2196F3', bg: '#BBDEFB' },     // Blue
        { id: 'hottest', label: t('map.filters.hottest'), color: '#F44336', bg: '#FFCDD2' },   // Red
        { id: 'viewed', label: t('map.filters.viewed'), color: '#FF9800', bg: '#FFE0B2' }, // Orange
        { id: 'mine', label: t('map.filters.mine'), color: '#FFEB3B', bg: '#FFF9C4' },      // Yellow
    ];

    const [activeFilter, setActiveFilter] = useState<FilterType>('newest');
    const [selectedPost, setSelectedPost] = useState<any>(null);
    const [heading, setHeading] = useState<number>(0);
    const [pendingLocation, setPendingLocation] = useState<{ lat: number, lng: number } | null>(null);
    const [locating, setLocating] = useState(false);
    const [markersVisible, setMarkersVisible] = useState(true);
    const [showFoodMap, setShowFoodMap] = useState(false);
    const [showBuildingMap, setShowBuildingMap] = useState(false);
    const [posts, setPosts] = useState<any[]>([]);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [loadingPosts, setLoadingPosts] = useState(true);
    const [editMode, setEditMode] = useState(false);
    const [buildingsData, setBuildingsData] = useState(CAMPUS_BUILDINGS);
    const [isCommentModalVisible, setIsCommentModalVisible] = useState(false);
    const [isFoodOrderModalVisible, setIsFoodOrderModalVisible] = useState(false);
    const [foodOrderWebUrl, setFoodOrderWebUrl] = useState<string | null>(null);
    const [commentText, setCommentText] = useState('');
    const [commentImage, setCommentImage] = useState<string | null>(null);

    // Navigation State
    const [navTarget, setNavTarget] = useState<{ lat: number, lng: number } | null>(null);
    const [userLocation, setUserLocation] = useState<{ lat: number, lng: number } | null>(null);
    const [isNavigating, setIsNavigating] = useState(false);

    // Handle navigation params
    useEffect(() => {
        if (params.navLat && params.navLng) {
            const lat = parseFloat(params.navLat as string);
            const lng = parseFloat(params.navLng as string);

            // Only update if target has changed to prevent infinite loop
            if (!navTarget || navTarget.lat !== lat || navTarget.lng !== lng) {
                setNavTarget({ lat, lng });
                setIsNavigating(true);
                setShowBuildingMap(true); // 1. 建筑地图：开
                setMarkersVisible(false); // 4. 隐藏原本Map出现的其他Newest出现的蓝色箭头标
                setShowFoodMap(false);

                // 1. Immediately focus on target in existing view if possible
                webViewRef.current?.injectJavaScript(`
                    if (window.centerMap) window.centerMap(${lat}, ${lng});
                    true;
                `);

                // 2. Trigger location fetch
                handleLocationPress(false);
            }
        }
    }, [params.navLat, params.navLng]);

    // Re-open food overlay when returning from food detail.
    useEffect(() => {
        const openFoodMapParam = params.openFoodMap;
        const shouldOpenFoodMap = Array.isArray(openFoodMapParam)
            ? openFoodMapParam.includes('true')
            : openFoodMapParam === 'true';

        if (!shouldOpenFoodMap) return;

        setShowFoodMap(true);
        router.setParams({ openFoodMap: '' });
    }, [params.openFoodMap, router]);

    // Effect to draw line when both locations are known and navigating
    useEffect(() => {
        if (isNavigating && navTarget && userLocation) {
            // Give the WebView a small delay to ensure it's finished loading its internal script
            const timer = setTimeout(() => {
                webViewRef.current?.injectJavaScript(`
                    console.log('Navigating: Injecting user marker and path');
                    if (window.updateUserLocation) {
                        window.updateUserLocation(${userLocation.lat}, ${userLocation.lng});
                    }
                    if (window.drawNavigationPath) {
                        window.drawNavigationPath(${userLocation.lat}, ${userLocation.lng}, ${navTarget.lat}, ${navTarget.lng});
                    }
                    true;
                `);
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [isNavigating, navTarget, userLocation]);

    const loadPostsData = useCallback(async () => {
        try {
            setLoadingPosts(true);
            const user = await getCurrentUser();
            setCurrentUserId(user?.uid || null);
            // Fetch all posts first, filter locally for categories
            const data = await fetchPosts('All', user?.uid);
            setPosts(data || []);
        } catch (e) {
            console.error('Error loading posts for map:', e);
        } finally {
            setLoadingPosts(false);
        }
    }, []);

    useEffect(() => {
        const loadBuildings = async () => {
            try {
                const cloudBuildings = await getBuildings();
                if (cloudBuildings && cloudBuildings.length > 0) {
                    setBuildingsData(cloudBuildings);
                    return;
                }
            } catch (e) {
                console.warn("Failed to fetch buildings from Supabase", e);
            }
        };

        loadBuildings();
        loadPostsData();
    }, [loadPostsData]);

    // Refresh data when screen is focused
    useFocusEffect(
        useCallback(() => {
            const task = InteractionManager.runAfterInteractions(() => {
                loadPostsData();
            });
            return () => task.cancel();
        }, [loadPostsData])
    );

    // Save to storage whenever buildingsData changes (debounced or on key events)
    // For simplicity, we'll save on drag end (which updates state) and on export.

    useEffect(() => {
        if (buildingsData !== CAMPUS_BUILDINGS) {
            storage.setItem('savedBuildingsData', JSON.stringify(buildingsData)).catch((e: any) => console.error(e));
        }
    }, [buildingsData]);

    const webViewRef = useRef<WebView>(null);
    const fadeAnim = useRef(new Animated.Value(0)).current;

    // Track heading
    React.useEffect(() => {
        let headingSubscription: Location.LocationSubscription | null = null;

        async function startHeadingTrack() {
            try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') return;

                headingSubscription = await Location.watchHeadingAsync((data) => {
                    const h = Math.round(data.trueHeading || data.magHeading);
                    setHeading(h);
                });
            } catch (err) {
                console.log('Heading error:', err);
            }
        }

        let positionSubscription: Location.LocationSubscription | null = null;
        async function startLocationTrack() {
            try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') return;

                positionSubscription = await Location.watchPositionAsync(
                    { accuracy: Location.Accuracy.Balanced, distanceInterval: 5 },
                    (location) => {
                        const { latitude, longitude } = location.coords;
                        setUserLocation({ lat: latitude, lng: longitude });
                    }
                );
            } catch (err) {
                console.log('Location track error:', err);
            }
        }

        startHeadingTrack();
        startLocationTrack();

        return () => {
            if (headingSubscription) headingSubscription.remove();
            if (positionSubscription) positionSubscription.remove();
        };
    }, []);

    // Sync userLocation with WebView (without re-centering)
    React.useEffect(() => {
        if (userLocation && webViewRef.current) {
            webViewRef.current.injectJavaScript(`
                if (window.updateUserLocation) {
                    window.updateUserLocation(${userLocation.lat}, ${userLocation.lng});
                }
                true;
            `);
        }
    }, [userLocation]);

    // Sync heading with WebView
    React.useEffect(() => {
        if (webViewRef.current) {
            webViewRef.current.injectJavaScript(`
                if (window.updateUserHeading) {
                    window.updateUserHeading(${heading});
                }
                true;
            `);
        }
    }, [heading]);

    // Trigger animation when selection changes
    React.useEffect(() => {
        if (pendingLocation || selectedPost) {
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
                easing: Easing.out(Easing.back(1.5)),
            }).start();
        } else {
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }).start();
        }
    }, [pendingLocation, selectedPost]);

    // Sync markers visibility with WebView
    React.useEffect(() => {
        webViewRef.current?.injectJavaScript(`
            if (window.setMarkersVisible) {
                window.setMarkersVisible(${markersVisible && !showFoodMap});
            }
            if (window.setFoodMapVisible) {
                window.setFoodMapVisible(${showFoodMap});
            }
            true;
        `);
    }, [markersVisible, showFoodMap]);

    // Sync building map visibility with WebView
    React.useEffect(() => {
        webViewRef.current?.injectJavaScript(`
            if (window.setBuildingMapVisible) {
                window.setBuildingMapVisible(${showBuildingMap});
            }
            // Auto hide other layers if one is active to reduce clutter? For now keep independent or managed by user
            true;
        `);
    }, [showBuildingMap]);

    // Filter data based on active filter and navigation state
    const currentPosts = useMemo(() => {
        let filtered = isNavigating ? [] : (posts || []).filter(p => {
            if (activeFilter === 'newest') return true;
            if (activeFilter === 'mine') return !!(currentUserId && p.authorId === currentUserId);
            return true;
        });

        if (activeFilter === 'hottest') {
            return [...filtered].sort((a, b) => (b.likes || 0) - (a.likes || 0));
        }
        if (activeFilter === 'viewed') {
            return [...filtered].sort((a, b) => (b.views || 0) - (a.views || 0));
        }
        return filtered;
    }, [posts, activeFilter, currentUserId, isNavigating]);

    const currentFoodSpots = useMemo(() => {
        return isNavigating ? [] : (CAMPUS_LOCATIONS || []).filter(l => l.category === 'Food');
    }, [isNavigating]);

    // For buildings, if navigating, only show the target building if possible
    const currentBuildings = useMemo(() => {
        return isNavigating && navTarget
            ? buildingsData.filter(b => Math.abs(b.coordinates.latitude - navTarget.lat) < 0.0001 && Math.abs(b.coordinates.longitude - navTarget.lng) < 0.0001)
            : buildingsData;
    }, [buildingsData, isNavigating, navTarget]);

    // Memoize the HTML to prevent reloads when location/heading changes
    const mapHtml = useMemo(() => {
        return generateMapHTML(
            currentPosts,
            currentFoodSpots,
            currentBuildings,
            showFoodMap,
            showBuildingMap,
            editMode,
            navTarget,
            isNavigating,
            currentUserId,
            t
        );
    }, [
        currentPosts,
        currentFoodSpots,
        currentBuildings,
        editMode,
        navTarget,
        isNavigating,
        currentUserId,
        t
    ]);

    // Memoize the source object to prevent WebView reloads on unrelated state updates
    const mapSource = useMemo(() => ({
        html: mapHtml
    }), [mapHtml]);

    const handleLocationPress = async (autoCenter = true) => {
        setLocating(true);
        try {
            // 1. Request permissions
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission to access location was denied');
                return;
            }

            // 2. Get location
            let location = await Location.getCurrentPositionAsync({});
            const { latitude, longitude } = location.coords;

            // 3. Update Map via JS injection
            // Using a small timeout to ensure the WebView has finished any pending re-renders
            setTimeout(() => {
                webViewRef.current?.injectJavaScript(`
                    if (window.updateUserLocation) {
                        window.updateUserLocation(${latitude}, ${longitude});
                    }
                    if (${autoCenter} && window.centerMap) {
                        window.centerMap(${latitude}, ${longitude});
                    }
                    true;
                `);
            }, 100);

            setUserLocation({ lat: latitude, lng: longitude }); // Update state to persist through reloads
        } catch (error) {
            Alert.alert(t('courses.error'), t('map.alerts.location_error'));
        } finally {
            setLocating(false);
        }
    };

    const handleAddPost = () => {
        if (pendingLocation) {
            router.push({
                pathname: '/campus/compose',
                params: {
                    lat: pendingLocation.lat,
                    lng: pendingLocation.lng,
                    fromMap: 'true'
                }
            } as any);
            setPendingLocation(null);
        } else {
            Alert.alert(
                t('map.alerts.create_post_title'),
                t('map.alerts.create_post_msg'),
                [
                    { text: t('map.alerts.pin_first'), style: 'cancel' },
                    { text: t('map.alerts.post_anyway'), onPress: () => router.push('/campus/compose') }
                ]
            );
        }
    };


    const handleFindClassroom = () => {
        router.push('/classroom' as any);
    };

    const handleFindFood = () => {
        setIsFoodOrderModalVisible(true);
    };

    const handleFoodOrderPress = async (orderUrl: string) => {
        try {
            setIsFoodOrderModalVisible(false);
            setFoodOrderWebUrl(orderUrl);
        } catch (error) {
            console.error('Failed to open order online link', error);
            Alert.alert(t('common.error'), t('common.retry'));
        }
    };

    const handleWebViewMessage = (event: any) => {
        try {
            const data = JSON.parse(event.nativeEvent.data);

            /* [COMMENTED] 点击地图发布评价功能已禁用
            if (data.type === 'map_clicked') {
                setPendingLocation({ lat: data.lat, lng: data.lng });
                return;
            }
            */

            if (data.type === 'popup_open') {
                const lat = Number(data.lat);
                const lng = Number(data.lng);
                if (isNaN(lat) || isNaN(lng)) return;

                const post = (currentPosts || []).find(p =>
                    p?.location &&
                    Math.abs((p.location.lat || 0) - lat) < 0.0001 &&
                    Math.abs((p.location.lng || 0) - lng) < 0.0001
                );
                if (post) {
                    setSelectedPost(post);
                }
            }
            if (data.type === 'view_food') {
                router.push(`/food/${data.id}` as any);
                return;
            }
            if (data.type === 'building_dragged') {
                const { id, lat, lng } = data;
                setBuildingsData(prev => prev.map(b =>
                    b.id === id ? { ...b, coordinates: { latitude: lat, longitude: lng } } : b
                ));
            }
        } catch (e) {
            // Ignore
        }
    };

    const handleExportBuildings = async () => {
        const json = JSON.stringify(buildingsData, null, 4);
        console.log(json);
        await Clipboard.setStringAsync(json);
        Alert.alert(t('map.alerts.data_exported'), t('map.alerts.export_msg'));
    };

    const handleLike = () => {
        if (!selectedPost) return;
        setSelectedPost((prev: any) => ({
            ...prev,
            isLiked: !prev.isLiked,
            likes: prev.isLiked ? prev.likes - 1 : prev.likes + 1
        }));
    };

    const handleComment = () => {
        setCommentText('');
        setCommentImage(null);
        setIsCommentModalVisible(true);
    };

    const handleExitNavigation = () => {
        setIsNavigating(false);
        setNavTarget(null);
        // Clear navigation params so we don't re-enter navigation on reload
        router.setParams({ navLat: '', navLng: '', navName: '' });

        webViewRef.current?.injectJavaScript(`
            if (window.clearNavigationPath) {
                window.clearNavigationPath();
            }
            true;
        `);
        // Optionally recenter map to user location
        if (userLocation) {
            webViewRef.current?.injectJavaScript(`
                window.centerMap(${userLocation.lat}, ${userLocation.lng});
                true;
            `);
        }
    };

    const pickCommentImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.8,
        });

        if (!result.canceled) {
            const compressedUri = await compressImage(result.assets[0].uri);
            setCommentImage(compressedUri);
        }
    };

    const handleSubmitComment = () => {
        if (commentText.trim()) {
            const newComment = {
                id: `new_${Date.now()}`,
                author: t('map.markers.user'),
                content: commentText.trim(),
                image: commentImage,
                time: t('map.markers.just_now')
            };

            setSelectedPost((prev: any) => ({
                ...prev,
                commentList: [...(prev.commentList || []), newComment],
                comments: (prev.comments || 0) + 1
            }));
            setCommentText('');
            setCommentImage(null);
            setIsCommentModalVisible(false);
            // Alert.alert('Success', 'Comment posted!'); // No need for alert if it appears in list
        }
    };

    return (
        <View style={styles.container}>
            <WebView
                ref={webViewRef}
                key={isNavigating ? 'nav_mode' : 'normal_mode'} // Only reload when entering/exiting nav
                originWhitelist={['*']}
                source={mapSource}
                style={styles.map}
                onMessage={handleWebViewMessage}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                startInLoadingState={true}
                renderLoading={() => (
                    <View style={styles.loadingOverlay}>
                        <ActivityIndicator size="large" color="#1E3A8A" />
                    </View>
                )}
            />

            {/* Header Overlay */}
            <View style={styles.header}>
                <View style={styles.headerLeft}>
                    <Text style={styles.headerTitle} numberOfLines={1}>{t('campus.campus_filter')}</Text>
                </View>
                <View style={styles.headerRight}>
                    <TouchableOpacity
                        style={[
                            styles.foodMapBadge,
                            showFoodMap ? styles.foodMapBadgeActive : styles.foodMapBadgeInactive
                        ]}
                        onPress={() => {
                            const next = !showFoodMap;
                            setShowFoodMap(next);
                            if (next) setShowBuildingMap(false);
                        }}
                    >
                        <Utensils size={18} color={showFoodMap ? "#fff" : "#FF6B6B"} />
                        <Text style={[styles.foodMapBadgeText, showFoodMap && { color: '#fff' }]}>
                            {showFoodMap ? `${t('map.overlay.food')}: ${t('map.overlay.on')}` : t('map.overlay.food')}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[
                            styles.foodMapBadge,
                            { marginLeft: 8 },
                            showBuildingMap ? { backgroundColor: '#4B0082', borderColor: '#4B0082' } : styles.foodMapBadgeInactive
                        ]}
                        onPress={() => {
                            const next = !showBuildingMap;
                            setShowBuildingMap(next);
                            if (next) setShowFoodMap(false);
                        }}
                    >
                        <Building size={16} color={showBuildingMap ? "#fff" : "#4B0082"} />
                        <Text style={[styles.foodMapBadgeText, showBuildingMap && { color: '#fff' }]}>
                            {showBuildingMap ? `${t('map.overlay.buildings')}: ${t('map.overlay.on')}` : t('map.overlay.buildings')}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>


            {/* [COMMENTED] Filter Bar - 最新/最热/最多查看/我的标记已禁用
            <View style={styles.filterContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
                    {FILTERS.map((filter) => {
                        const isActive = activeFilter === filter.id;
                        return (
                            <TouchableOpacity
                                key={filter.id}
                                style={[
                                    styles.filterChip,
                                    isActive && { backgroundColor: filter.color, borderColor: filter.color }
                                ]}
                                onPress={() => {
                                    setActiveFilter(filter.id);
                                    // Reset user loc on filter change? maybe not
                                }}
                            >
                                <Text
                                    style={[
                                        styles.filterText,
                                        isActive && { color: '#fff', fontWeight: 'bold' }
                                    ]}
                                >
                                    {filter.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>
            */}

            <View style={styles.bottomControls}>
                {/* [COMMENTED] Marker Toggle Button (隐藏按钮) - 已禁用
                <TouchableOpacity
                    style={[styles.iconButton, !markersVisible && { backgroundColor: '#F3F4F6' }]}
                    onPress={() => setMarkersVisible(!markersVisible)}
                >
                    {markersVisible ? (
                        <MapPin size={22} color="#1E3A8A" />
                    ) : (
                        <MapPinOff size={22} color="#6B7280" />
                    )}
                    <Text style={[styles.iconButtonText, !markersVisible && { color: '#6B7280' }]}>
                        {markersVisible ? t('map.overlay.hide') : t('map.overlay.show')}
                    </Text>
                </TouchableOpacity>
                */}

                <TouchableOpacity style={styles.iconButton} onPress={handleFindClassroom}>
                    <Building size={20} color="#4B0082" />
                    <Text style={styles.iconButtonText}>{t('map.overlay.find_classroom')}</Text>
                </TouchableOpacity>

                {showBuildingMap && SHOW_BUILDING_EDIT_BUTTON && (
                    <TouchableOpacity
                        style={[styles.iconButton, editMode && { backgroundColor: '#FFD700' }]}
                        onPress={() => {
                            if (editMode) {
                                // Save/Exit
                                handleExportBuildings();
                            }
                            setEditMode(!editMode);
                        }}
                    >
                        <MapPin size={20} color={editMode ? "#000" : "#4B0082"} />
                        <Text style={styles.iconButtonText}>{editMode ? t('map.overlay.save') : t('map.overlay.edit')}</Text>
                    </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.iconButton} onPress={handleFindFood}>
                    <Utensils size={20} color="#E65100" />
                    <Text style={styles.iconButtonText}>{t('map.overlay.order_food')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.locationButton, locating && { opacity: 0.7 }]}
                    onPress={() => handleLocationPress(true)}
                    disabled={locating}
                >
                    {locating ? (
                        <ActivityIndicator size="small" color="#4B0082" />
                    ) : (
                        <Crosshair size={22} color="#333" />
                    )}
                </TouchableOpacity>

                {isNavigating && (
                    <TouchableOpacity
                        style={[styles.locationButton, { backgroundColor: '#FF5252' }]}
                        onPress={handleExitNavigation}
                    >
                        <X size={22} color="#fff" />
                    </TouchableOpacity>
                )}

                {/* [COMMENTED] 活动按钮 (Add Button) - 已禁用
                <Animated.View style={{ opacity: fadeAnim, transform: [{ scale: fadeAnim }] }}>
                    <TouchableOpacity
                        style={styles.addButton}
                        onPress={handleAddPost}
                        activeOpacity={0.7}
                    >
                        <Plus size={28} color="#fff" />
                    </TouchableOpacity>
                </Animated.View>
                */}
            </View>

            {/* [COMMENTED] Floating Post Cards - 浮动帖子卡片已禁用
            {
                markersVisible && (
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.postsScroll}
                        contentContainerStyle={styles.postsContent}
                    >
                        {(currentPosts || []).map((post) => {
                            if (!post || !post.location) return null;
                            return (
                                <TouchableOpacity
                                    key={post.id}
                                    style={[styles.floatingCard, { backgroundColor: post.color || '#fff' }]}
                                    onPress={() => setSelectedPost(post)}
                                >
                                    <View style={styles.cardHeader}>
                                        <Text style={styles.cardAvatar}>{post.author?.avatar || '👤'}</Text>
                                        <Text style={styles.cardCategory}>{post.category || ''}</Text>
                                        <Text style={styles.cardTime}>{post.time || ''}</Text>
                                    </View>
                                    <Text style={styles.cardContent} numberOfLines={2}>
                                        {post.content || ''}
                                    </Text>
                                    <Text style={styles.locationText}>📍 {post?.location?.name || ''}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                )
            }
            */}

            {/* Post Detail Modal */}
            <Modal
                visible={selectedPost !== null}
                animationType="slide"
                transparent={true}
                onRequestClose={() => {
                    setSelectedPost(null);
                    setIsCommentModalVisible(false);
                }}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.modalOverlay}
                >
                    <TouchableOpacity
                        style={styles.modalBackdrop}
                        onPress={() => {
                            setSelectedPost(null);
                            setIsCommentModalVisible(false);
                        }}
                    />
                    {selectedPost && (
                        <View style={[styles.modalContent, { backgroundColor: selectedPost.color || '#fff' }]}>
                            <TouchableOpacity
                                style={styles.closeButton}
                                onPress={() => {
                                    setSelectedPost(null);
                                    setIsCommentModalVisible(false);
                                }}
                            >
                                <X size={20} color="#666" />
                            </TouchableOpacity>

                            <View style={styles.modalHeader}>
                                <Text style={styles.modalAvatar}>{selectedPost.author?.avatar || '👤'}</Text>
                                <View style={styles.modalInfo}>
                                    <Text style={styles.modalAuthor}>{selectedPost.author?.name || t('map.markers.user')}</Text>
                                    <Text style={styles.modalCategory}>{selectedPost.category || t('map.markers.general')} · {selectedPost.time || t('map.markers.just_now')}</Text>
                                </View>
                            </View>

                            <Text style={styles.modalText}>{selectedPost.content || ''}</Text>

                            <View style={styles.modalLocation}>
                                <Text style={styles.modalLocationText}>📍 {selectedPost?.location?.name || ''}</Text>
                            </View>

                            {/* Comment List Section */}
                            {selectedPost?.commentList && selectedPost.commentList.length > 0 ? (
                                <View style={styles.commentsSection}>
                                    <Text style={styles.commentsHeader}>{t('map.modal.comments')} ({selectedPost.commentList.length})</Text>
                                    <ScrollView
                                        style={styles.commentsList}
                                        nestedScrollEnabled={true}
                                        showsVerticalScrollIndicator={true}
                                    >
                                        {selectedPost.commentList.map((comment: any) => (
                                            <View key={comment.id} style={styles.commentItem}>
                                                <View style={styles.commentHeader}>
                                                    <Text style={styles.commentAuthor}>{comment?.author || t('map.markers.user')}</Text>
                                                    <Text style={styles.commentTime}>{comment?.time || t('map.markers.just_now')}</Text>
                                                </View>
                                                <Text style={styles.commentContent}>{comment?.content || ''}</Text>
                                                {comment?.image && (
                                                    <Image source={{ uri: comment.image || '' }} style={styles.commentImage} />
                                                )}
                                            </View>
                                        ))}
                                    </ScrollView>
                                </View>
                            ) : (
                                <View style={styles.noCommentsContainer}>
                                    <Text style={styles.noCommentsText}>{t('map.modal.no_comments')}</Text>
                                </View>
                            )}

                            {!isCommentModalVisible ? (
                                <View style={styles.socialActions}>
                                    <TouchableOpacity style={styles.actionButton} onPress={handleLike}>
                                        <Heart
                                            size={24}
                                            color={selectedPost.isLiked ? "#E91E63" : "#666"}
                                            fill={selectedPost.isLiked ? "#E91E63" : "none"}
                                        />
                                        <Text style={[styles.actionText, selectedPost.isLiked && { color: "#E91E63" }]}>
                                            {t('map.modal.like')} {selectedPost.likes || 0}
                                        </Text>
                                    </TouchableOpacity>

                                    <View style={styles.divider} />

                                    <TouchableOpacity style={styles.actionButton} onPress={handleComment}>
                                        <MessageCircle size={24} color="#666" />
                                        <Text style={styles.actionText}>{selectedPost.comments || 0}</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <View style={styles.commentInputContainer}>
                                    <Text style={styles.commentModalTitle}>{t('map.modal.write_comment')}</Text>
                                    <TextInput
                                        style={styles.commentInput}
                                        placeholder={t('map.modal.comment_placeholder')}
                                        placeholderTextColor="#999"
                                        multiline
                                        autoFocus
                                        value={commentText}
                                        onChangeText={setCommentText}
                                    />

                                    {commentImage && (
                                        <View style={styles.commentImagePreviewContainer}>
                                            <Image source={{ uri: commentImage || '' }} style={styles.commentImagePreview} />
                                            <TouchableOpacity
                                                style={styles.removeCommentImageButton}
                                                onPress={() => setCommentImage(null)}
                                            >
                                                <X size={14} color="white" />
                                            </TouchableOpacity>
                                        </View>
                                    )}

                                    <TouchableOpacity style={styles.addImageButton} onPress={pickCommentImage}>
                                        <ImageIcon size={20} color="#4B0082" />
                                        <Text style={styles.addImageText}>
                                            {commentImage ? t('map.modal.change_image') : t('map.modal.add_image')}
                                        </Text>
                                    </TouchableOpacity>
                                    <View style={styles.commentActions}>
                                        <TouchableOpacity
                                            style={styles.commentCancelButton}
                                            onPress={() => setIsCommentModalVisible(false)}
                                        >
                                            <Text style={styles.commentCancelText}>{t('common.cancel')}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={styles.commentPostButton}
                                            onPress={handleSubmitComment}
                                        >
                                            <Text style={styles.commentPostText}>{t('map.modal.post')}</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}
                        </View>
                    )}
                </KeyboardAvoidingView>
            </Modal>

            <Modal
                visible={isFoodOrderModalVisible}
                animationType="fade"
                transparent={true}
                onRequestClose={() => setIsFoodOrderModalVisible(false)}
            >
                <View style={styles.foodOrderModalOverlay}>
                    <TouchableOpacity
                        style={styles.foodOrderModalBackdrop}
                        activeOpacity={1}
                        onPress={() => setIsFoodOrderModalVisible(false)}
                    />
                    <View style={styles.foodOrderModalCard}>
                        <View style={styles.foodOrderModalHeader}>
                            <View style={styles.foodOrderModalIcon}>
                                <Utensils size={16} color="#E65100" />
                            </View>
                            <View style={styles.foodOrderModalHeaderText}>
                                <Text style={styles.foodOrderModalTitle}>{t('map.overlay.order_food')}</Text>
                                <Text style={styles.foodOrderModalSubtitle}>{t('map.overlay.food')}</Text>
                            </View>
                        </View>
                        {FOOD_ORDER_OPTIONS.map(option => (
                            <TouchableOpacity
                                key={option.key}
                                style={styles.foodOrderOptionButton}
                                onPress={() => handleFoodOrderPress(option.orderUrl)}
                                activeOpacity={0.85}
                            >
                                <View style={styles.foodOrderOptionLeft}>
                                    <View style={styles.foodOrderOptionDot} />
                                    <Text style={styles.foodOrderOptionText}>{option.name}</Text>
                                </View>
                                <ChevronRight size={18} color="#9CA3AF" />
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity
                            style={styles.foodOrderCancelButton}
                            onPress={() => setIsFoodOrderModalVisible(false)}
                        >
                            <Text style={styles.foodOrderCancelText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal
                visible={!!foodOrderWebUrl}
                animationType="slide"
                transparent={false}
                onRequestClose={() => setFoodOrderWebUrl(null)}
            >
                <View style={styles.foodOrderWebContainer}>
                    <View style={styles.foodOrderWebHeader}>
                        <Text style={styles.foodOrderWebTitle}>{t('map.overlay.order_food')}</Text>
                        <TouchableOpacity
                            style={styles.foodOrderWebCloseButton}
                            onPress={() => setFoodOrderWebUrl(null)}
                        >
                            <X size={20} color="#333" />
                        </TouchableOpacity>
                    </View>
                    {foodOrderWebUrl && (
                        <WebView
                            source={{ uri: foodOrderWebUrl }}
                            startInLoadingState
                            style={styles.foodOrderWebView}
                        />
                    )}
                </View>
            </Modal>
        </View >
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    map: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    header: {
        position: 'absolute',
        top: 50,
        left: 20,
        right: 20,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        zIndex: 100,
    },
    headerLeft: {
        flexShrink: 0,
        marginRight: 10,
    },
    headerRight: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#111',
        textShadowColor: 'rgba(255,255,255,0.8)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
        marginBottom: 8,
    },
    iconButton: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 3,
    },
    iconButtonText: {
        fontSize: 10,
        color: '#333',
        fontWeight: '700',
        marginTop: 2,
    },
    foodMapBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 25,
        gap: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
        elevation: 5,
    },
    foodMapBadgeInactive: {
        backgroundColor: '#fff',
        borderWidth: 1.5,
        borderColor: '#FF6B6B',
    },
    foodMapBadgeActive: {
        backgroundColor: '#FF6B6B',
    },
    foodMapBadgeText: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#FF6B6B',
    },
    filterContainer: {
        position: 'absolute',
        top: 130, // Below header
        left: 0,
        right: 0,
        zIndex: 90,
    },
    filterScroll: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        gap: 10,
    },
    filterChip: {
        backgroundColor: 'rgba(255,255,255,0.9)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#eee',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    filterText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#555',
    },
    bottomControls: {
        position: 'absolute',
        right: 20,
        bottom: 280,
        alignItems: 'center',
        gap: 12,
        zIndex: 100,
    },
    locationButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 3,
    },
    addButton: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#1E3A8A', // Using primary blue for the add button
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
        elevation: 8,
    },
    postsScroll: {
        position: 'absolute',
        bottom: 100,
        left: 0,
        right: 0,
        zIndex: 100,
    },
    postsContent: {
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    floatingCard: {
        width: 200,
        padding: 14,
        borderRadius: 16,
        marginRight: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 5,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    cardAvatar: {
        fontSize: 16,
        marginRight: 6,
    },
    cardCategory: {
        fontSize: 13,
        fontWeight: '600',
        color: '#333',
        flex: 1,
    },
    cardTime: {
        fontSize: 10,
        color: '#888',
    },
    cardContent: {
        fontSize: 13,
        color: '#333',
        lineHeight: 18,
        marginBottom: 8,
    },
    locationText: {
        fontSize: 11,
        color: '#666',
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    modalBackdrop: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    modalContent: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        paddingBottom: 40,
    },
    closeButton: {
        position: 'absolute',
        top: 16,
        right: 16,
        padding: 8,
        zIndex: 10,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    modalAvatar: {
        fontSize: 32,
        marginRight: 12,
    },
    modalInfo: {
        flex: 1,
    },
    modalAuthor: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#111',
    },
    modalCategory: {
        fontSize: 13,
        color: '#666',
        marginTop: 2,
    },
    modalText: {
        fontSize: 16,
        lineHeight: 24,
        color: '#333',
        marginBottom: 16,
    },
    modalLocation: {
        backgroundColor: 'rgba(0,0,0,0.05)',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        marginBottom: 16,
        alignSelf: 'flex-start',
    },
    modalLocationText: {
        fontSize: 13,
        color: '#555',
    },
    socialActions: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 8,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#f0f0f0',
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        marginHorizontal: 16,
    },
    actionText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#666',
        marginLeft: 8,
    },
    divider: {
        width: 1,
        height: 24,
        backgroundColor: '#eee',
    },
    commentModalOverlay: {
        flex: 1,
        justifyContent: 'flex-end', // Or center if preferred, but bottom sheet style is nice
    },
    commentModalBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    commentModalContent: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 20,
        paddingBottom: 40,
        minHeight: 250,
    },
    commentModalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 16,
        color: '#333',
        textAlign: 'center',
    },
    commentInput: {
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 12,
        padding: 12,
        height: 100,
        fontSize: 16,
        textAlignVertical: 'top',
        marginBottom: 16,
        backgroundColor: '#f9f9f9',
    },
    commentActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
    },
    commentCancelButton: {
        flex: 1,
        padding: 14,
        borderRadius: 12,
        backgroundColor: '#f0f0f0',
        alignItems: 'center',
    },
    commentCancelText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#666',
    },
    commentPostButton: {
        flex: 1,
        padding: 14,
        borderRadius: 12,
        backgroundColor: '#1E3A8A',
        alignItems: 'center',
    },
    commentPostText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
    commentInputContainer: {
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#f0f0f0',
    },
    commentsSection: {
        marginTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#eee',
        paddingTop: 16,
        maxHeight: 300,
    },
    noCommentsContainer: {
        marginTop: 16,
        paddingVertical: 10,
        alignItems: 'center',
    },
    noCommentsText: {
        fontSize: 13,
        color: '#888',
        fontStyle: 'italic',
    },
    commentsHeader: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 10,
    },
    commentsList: {
        marginBottom: 10,
    },
    commentItem: {
        marginBottom: 12,
        backgroundColor: '#f9f9f9',
        padding: 10,
        borderRadius: 12,
    },
    commentHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    commentAuthor: {
        fontSize: 13,
        fontWeight: '600',
        color: '#333',
    },
    commentTime: {
        fontSize: 11,
        color: '#999',
    },
    commentContent: {
        fontSize: 13,
        color: '#555',
        lineHeight: 18,
    },
    commentImage: {
        width: '100%',
        height: 150,
        borderRadius: 8,
        marginTop: 8,
        backgroundColor: '#eee',
    },
    addImageButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        marginBottom: 10,
    },
    addImageText: {
        fontSize: 14,
        color: '#1E3A8A',
        fontWeight: '600',
        marginLeft: 8,
    },
    commentImagePreviewContainer: {
        position: 'relative',
        marginBottom: 12,
        borderRadius: 12,
        overflow: 'hidden',
        width: 120,
        height: 120,
    },
    commentImagePreview: {
        width: '100%',
        height: '100%',
    },
    removeCommentImageButton: {
        position: 'absolute',
        top: 4,
        right: 4,
        backgroundColor: 'rgba(0,0,0,0.6)',
        padding: 4,
        borderRadius: 10,
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(255,255,255,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
    },
    foodOrderModalOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    foodOrderModalBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    foodOrderModalCard: {
        width: '100%',
        maxWidth: 340,
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 16,
        gap: 10,
        zIndex: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 5,
    },
    foodOrderModalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    foodOrderModalIcon: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#FFF7ED',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    foodOrderModalHeaderText: {
        flex: 1,
    },
    foodOrderModalTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111',
    },
    foodOrderModalSubtitle: {
        marginTop: 2,
        fontSize: 12,
        color: '#666',
    },
    foodOrderOptionButton: {
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 14,
        paddingVertical: 12,
        paddingHorizontal: 14,
        backgroundColor: '#FFFFFF',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    foodOrderOptionLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    foodOrderOptionDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#E65100',
    },
    foodOrderOptionText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#1F2937',
    },
    foodOrderCancelButton: {
        marginTop: 2,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 11,
        borderRadius: 12,
        backgroundColor: '#F3F4F6',
    },
    foodOrderCancelText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#4B5563',
    },
    foodOrderWebContainer: {
        flex: 1,
        backgroundColor: '#fff',
    },
    foodOrderWebHeader: {
        paddingTop: 56,
        paddingBottom: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    foodOrderWebTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111',
    },
    foodOrderWebCloseButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F3F4F6',
    },
    foodOrderWebView: {
        flex: 1,
    },
});
