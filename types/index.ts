// Supabase Compatible Types
export interface GeoPoint {
    latitude: number;
    longitude: number;
}

// User Types
export interface User {
    uid: string;
    displayName: string;
    socialTags: string[];
    major: string;
    avatarUrl: string;
    location?: GeoPoint;
    createdAt: Date;
}

// Social Tags Options
export const SOCIAL_TAGS = [
    'Library Ghost 📚',
    'Canteen Philosopher 🍜',
    'Shaw Campus Runner 🏃',
    'Deadline Fighter ⏰',
    'Milk Tea Connoisseur 🧋',
    'Night Owl 🦉',
    'Morning Bird 🐦',
    'Group Project Leader 👑',
    'Solo Warrior 🗡️',
    'Coffee Addict ☕',
] as const;

// Post Types
export type PostType = 'event' | 'review' | 'guide' | 'lost_found';
export type PostCategory = 'All' | 'Events' | 'Reviews' | 'Guides' | 'Lost & Found';

export interface Post {
    id: string;
    authorId: string;
    authorName: string;
    authorEmail?: string;
    authorMajor?: string;
    authorTags?: string[];
    authorAvatar?: string;
    content: string;
    type?: PostType;
    category?: PostCategory;
    imageUrl?: string;
    images?: string[];
    locationTag?: string;
    location?: {
        lat: number;
        lng: number;
        name?: string;
    };
    geoPoint?: GeoPoint;
    createdAt: Date;
    timestamp?: Date;
    likes: number;
    isLiked?: boolean;
    comments: number;
    replies?: Array<{
        id: string;
        authorName: string;
        content: string;
        createdAt: Date;
    }>;
    isAnonymous: boolean;
}

// Forum Types (独立于发现板块)
export type ForumCategory = 'general' | 'activity' | 'guide' | 'lost_found';
export type ForumSort = 'latest_reply' | 'latest_post';

export interface ForumPost {
    id: string;
    title: string;
    content?: string;
    authorId: string;
    authorName: string;
    authorEmail?: string;
    authorAvatar?: string;
    category: ForumCategory;
    images?: string[];
    replyCount: number;
    upvoteCount: number;
    isUpvoted?: boolean;
    lastReplyAt: Date;
    createdAt: Date;
}

export interface ForumComment {
    id: string;
    postId: string;
    authorId: string;
    authorName: string;
    authorEmail?: string;
    authorAvatar?: string;
    content: string;
    createdAt: Date;
}

// Location Types
export type LocationCategory = 'Food' | 'Study' | 'Campus Cats' | 'Sports' | 'Other';

export interface CampusLocation {
    id: string;
    name: string;
    category: LocationCategory;
    coordinates: {
        latitude: number;
        longitude: number;
    };
    description: string;
    rating?: number;
    imageUrl?: string;
    hours?: string;
}

// Chat Types
export interface ChatRoom {
    id: string;
    participants: string[];
    lastMessage: string;
    lastMessageTime: Date;
}

export interface Message {
    id: string;
    senderId: string;
    content: string;
    timestamp: Date;
    read: boolean;
}

// Course Reviews Types
export interface Course {
    id: string;
    code: string; // e.g., COMP3015
    name: string;
    instructor: string;
    department: string;
    credits: number;
    rating: number; // Avg rating
    reviewCount: number;
}

export interface Review {
    id: string;
    courseId: string;
    authorId: string;
    authorName: string;
    authorEmail?: string;
    authorAvatar: string;
    rating?: number; // Overall (optional for follow-up updates)
    difficulty: number; // 1-5
    content: string;
    tags: string[];
    likes: number;
    createdAt: Date;
    semester: string; // e.g., "2025 Fall"
}

// Course Exchange Types
export interface ContactMethod {
    platform: 'WeChat' | 'WhatsApp' | 'Email' | 'Instagram' | 'Telegram' | 'Other';
    otherPlatformName?: string;
    value: string;
}

export interface ExchangeCourseDetail {
    code: string;
    section?: string;
    teacher?: string;
    time?: string;
}

export interface CourseExchange {
    id: string;
    userId: string;
    userName: string;
    userAvatar: string;
    userMajor: string;
    haveCourse: string; // Course code
    haveSection?: string;
    haveTeacher?: string;
    haveTime?: string;
    wantCourses: ExchangeCourseDetail[]; // Support multiple choices
    reason?: string;
    contacts: ContactMethod[];
    createdAt: Date;
    status: 'open' | 'completed' | 'cancelled';
    commentCount: number;
    likes: number;
    isLiked?: boolean;
}

export interface ExchangeComment {
    id: string;
    exchangeId: string;
    authorId: string;
    authorName: string;
    authorAvatar: string;
    content: string;
    createdAt: Date;
}

// Course Teaming Types
export interface CourseTeaming {
    id: string;
    courseId: string;
    userId: string;
    userName: string;
    userEmail?: string;
    userAvatar: string;
    userMajor?: string;
    section: string;
    selfIntro?: string;
    targetTeammate?: string;
    contacts: ContactMethod[];
    createdAt: Date;
    status: 'open' | 'closed';
    likes: number;
    isLiked?: boolean;
    commentCount: number;
}

export interface TeamingComment {
    id: string;
    teamingId: string; // Specific ID for the teaming request
    authorId: string;
    authorName: string;
    authorEmail?: string;
    authorAvatar: string;
    content: string;
    createdAt: Date;
}

// Notification Types
export interface AppNotification {
    id: string;
    type: 'reply' | 'like';
    actorName: string;
    relatedId: string; // post id
    contentPreview: string;
    createdAt: Date;
    read: boolean;
}

// Teacher Rating Types
export interface Teacher {
    id: string;
    faculty: string;
    department: string;
    name: string;
    title: string;
    imageUrl: string;
    email: string;
    sourceUrl: string;
    ratingAvg: number;
    reviewCount: number;
    tags: string[];
}

export interface TeacherReview {
    id: string;
    teacherId: string;
    authorId: string;
    authorName: string;
    authorEmail?: string;
    authorAvatar?: string;
    rating: number;
    difficulty: number;
    workload: number;
    content: string;
    tags: string[];
    likes: number;
    isLiked?: boolean;
    createdAt: Date;
}

// Navigation Types
export type TabName = 'campus' | 'map' | 'class' | 'profile';
