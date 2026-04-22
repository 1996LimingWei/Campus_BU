// Supabase Compatible Types
export interface GeoPoint {
    latitude: number;
    longitude: number;
}

// User Types
export type FollowState = 'none' | 'following' | 'follower' | 'both';

export interface ProfileStats {
    postsCount: number;
    followersCount: number;
    followingCount: number;
    appreciationCount: number; // Likes + Favorites
}

export interface User {
    uid: string;
    displayName: string;
    major: string;
    email?: string;
    avatarUrl: string;
    location?: GeoPoint;
    createdAt: Date;
    stats?: ProfileStats;
    isFollowing?: boolean; // For viewing others
    followsYou?: boolean; // For viewing others
    bio?: string;
}

// Post Types
export type PostType = 'event' | 'review' | 'guide' | 'lost_found';
export type PostCategory = 'All' | 'Events' | 'Reviews' | 'Guides' | 'Lost & Found';

export interface PostComment {
    id: string;
    postId: string;
    authorId: string;
    authorName: string;
    authorEmail?: string;
    authorAvatar?: string;
    isAnonymous?: boolean;
    content: string;
    parentCommentId?: string;
    replyToName?: string;
    createdAt: Date;
}

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
    isAnonymous: boolean;
    isFollowingAuthor?: boolean; // Xiaohongshu badge requirement
}

// Forum Types (独立于发现板块)
export type ForumCategory = 'general' | 'activity' | 'guide' | 'lost_found' | 'marketplace' | 'teaming' | 'confession';
export type ForumSort = 'latest_reply' | 'latest_post' | 'recommended';

// 帖子类型：普通用户帖 / 编辑部攻略 / 官方公告
export type ForumContentType = 'user_post' | 'editorial' | 'official';

// 多语言版本支持
export type ForumLanguage = 'zh-Hans' | 'zh-Hant' | 'en';

// 来源引用（编辑帖追溯信息出处）
export interface ForumSourceRef {
    type: 'official_website' | 'official_document' | 'student_feedback' | 'other';
    url?: string;
    description?: string;
    accessed_at?: string; // ISO date string
}

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
    isFollowingAuthor?: boolean; // Xiaohongshu badge requirement

    // ── 编辑部攻略支持（20260420 新增）──────────────────────────────────
    contentType?: ForumContentType;          // 默认 user_post
    sources?: ForumSourceRef[];              // 来源引用数组
    lastVerifiedAt?: Date;                   // 最后核实时间
    tags?: string[];                         // 细分标签
    isPinned?: boolean;                      // 是否置顶
    pinnedAt?: Date;                         // 置顶时间
    language?: ForumLanguage;                // 内容语言
    translationGroup?: string;               // 多语言版本分组 UUID
    summary?: string;                        // TL;DR 摘要
    viewCount?: number;                      // 浏览量
}

export interface ForumComment {
    id: string;
    postId: string;
    authorId: string;
    authorName: string;
    authorEmail?: string;
    authorAvatar?: string;
    content: string;
    parentCommentId?: string;
    replyToName?: string;
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

export interface DirectMessagePeer {
    id: string;
    name: string;
    avatar: string;
    major: string;
}

export interface DirectConversationSummary {
    id: string;
    user: DirectMessagePeer;
    lastMessage: string;
    timestamp: Date;
    unreadCount: number;
}

export interface DirectMessage {
    id: string;
    conversationId: string;
    senderId: string;
    receiverId: string;
    content: string;
    replyToMessageId?: string | null;
    createdAt: Date;
    readAt?: Date | null;
    senderName: string;
    senderAvatar: string;
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
    isAnonymous?: boolean; // Whether the review is posted anonymously
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
    parentCommentId?: string;
    replyToName?: string;
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
    parentCommentId?: string;
    replyToName?: string;
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
