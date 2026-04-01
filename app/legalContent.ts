export type LegalTab = 'privacy' | 'terms';

export type LegalContent = {
    title: string;
    intro: string;
    sections: Array<{ heading: string; body: string }>;
};

export const LEGAL_CONTENT: Record<'en' | 'zh-Hans' | 'zh-Hant', Record<LegalTab, LegalContent>> = {
    en: {
        privacy: {
            title: 'Privacy Policy',
            intro: 'HKCampus collects only the data needed to provide campus features, community functions, and account security.',
            sections: [
                {
                    heading: 'Data We Collect',
                    body: 'We may collect your email address, profile nickname, avatar, major, social tags, posts, comments, uploaded images, direct messages, push token, and the location you choose to attach to a map or post.',
                },
                {
                    heading: 'How We Use Data',
                    body: 'We use this data to create your account, show your profile, deliver posts and messages, support moderation, send notifications if you enable them, and provide campus map features when you request them.',
                },
                {
                    heading: 'Location, Photos, and Biometrics',
                    body: 'Location is requested only when you actively use location-based features. Photo library and camera access are used only when you choose images. Face ID is used only for local sign-in convenience on your device.',
                },
                {
                    heading: 'Storage and Sharing',
                    body: 'User content is stored in Supabase services used by HKCampus. We do not use your data for third-party advertising or cross-app tracking.',
                },
                {
                    heading: 'Contact',
                    body: 'Privacy requests and questions: huoweijia2000@163.com or huoweijia2000@gmail.com.',
                },
            ],
        },
        terms: {
            title: 'Deletion and Recall',
            intro: 'HKCampus provides in-app controls for deleting your account, removing your own content, and recalling messages in supported conversations.',
            sections: [
                {
                    heading: 'Account Deletion',
                    body: 'You can delete your account from Profile > Delete Account. This action is irreversible and is intended to remove your account and associated in-app profile data.',
                },
                {
                    heading: 'Posts and Comments',
                    body: 'You can delete your own posts and comments where the feature is available. Moderators may remove content that violates community rules.',
                },
                {
                    heading: 'Message Recall',
                    body: 'When a conversation supports recall, recalling a message removes it from the chat view. This does not guarantee removal from device screenshots, system notifications already delivered, or third-party copies.',
                },
                {
                    heading: 'Reports and Moderation',
                    body: 'Users can report content and block users. Reported content may be reviewed and removed under the community safety policy.',
                },
            ],
        },
    },
    'zh-Hans': {
        privacy: {
            title: '隐私政策',
            intro: 'HKCampus 仅收集提供校园功能、社区互动和账号安全所必需的数据。',
            sections: [
                {
                    heading: '我们收集的数据',
                    body: '我们可能收集你的邮箱、昵称、头像、专业、社交标签、帖子、评论、上传图片、私信内容、推送令牌，以及你主动附加到地图或帖子的位置。',
                },
                {
                    heading: '数据用途',
                    body: '这些数据用于创建账号、展示个人资料、发布内容与消息、处理审核与举报、在你开启通知后发送提醒，以及在你主动使用时提供地图相关功能。',
                },
                {
                    heading: '定位、相册与生物识别',
                    body: '定位权限仅在你主动使用定位功能时请求。相册和相机权限仅在你主动选择或拍摄图片时使用。Face ID 仅用于本机快速登录，不会上传你的生物特征数据。',
                },
                {
                    heading: '存储与共享',
                    body: '用户内容通过 HKCampus 使用的 Supabase 服务存储。我们不会将你的数据用于第三方广告投放或跨 App 跟踪。',
                },
                {
                    heading: '联系方式',
                    body: '隐私相关问题可联系：huoweijia2000@163.com 或 huoweijia2000@gmail.com。',
                },
            ],
        },
        terms: {
            title: '删除与撤回说明',
            intro: 'HKCampus 在应用内提供账号删除、内容删除和部分场景下的消息撤回能力。',
            sections: [
                {
                    heading: '账号删除',
                    body: '你可以在“个人中心 > 注销账号”发起删除。该操作不可恢复，目标是删除你的账号及相关应用内资料。',
                },
                {
                    heading: '帖子与评论',
                    body: '在功能开放的地方，你可以删除自己的帖子和评论。违反社区规则的内容也可能被管理员移除。',
                },
                {
                    heading: '消息撤回',
                    body: '当会话支持撤回时，撤回会将消息从聊天界面移除。但这不保证已被截图、已送达的系统通知或第三方保存副本一并消失。',
                },
                {
                    heading: '举报与审核',
                    body: '用户可以举报内容并屏蔽他人。被举报内容可能依据社区安全规则进行审核和处理。',
                },
            ],
        },
    },
    'zh-Hant': {
        privacy: {
            title: '隱私政策',
            intro: 'HKCampus 僅收集提供校園功能、社群互動和帳號安全所必需的資料。',
            sections: [
                {
                    heading: '我們收集的資料',
                    body: '我們可能收集你的電郵、暱稱、頭像、專業、社交標籤、貼文、評論、上傳圖片、私訊內容、推送令牌，以及你主動附加到地圖或貼文的位置。',
                },
                {
                    heading: '資料用途',
                    body: '這些資料用於建立帳號、展示個人資料、發布內容與訊息、處理審核與檢舉、在你開啟通知後發送提醒，以及在你主動使用時提供地圖相關功能。',
                },
                {
                    heading: '定位、相簿與生物辨識',
                    body: '定位權限僅在你主動使用定位功能時請求。相簿和相機權限僅在你主動選擇或拍攝圖片時使用。Face ID 僅用於本機快速登入，不會上傳你的生物特徵資料。',
                },
                {
                    heading: '儲存與共享',
                    body: '用戶內容透過 HKCampus 使用的 Supabase 服務儲存。我們不會將你的資料用於第三方廣告投放或跨 App 追蹤。',
                },
                {
                    heading: '聯絡方式',
                    body: '隱私相關問題可聯絡：huoweijia2000@163.com 或 huoweijia2000@gmail.com。',
                },
            ],
        },
        terms: {
            title: '刪除與撤回說明',
            intro: 'HKCampus 在應用內提供帳號刪除、內容刪除和部分場景下的訊息撤回功能。',
            sections: [
                {
                    heading: '帳號刪除',
                    body: '你可以在「個人中心 > 註銷帳號」發起刪除。此操作不可恢復，目標是刪除你的帳號及相關應用內資料。',
                },
                {
                    heading: '貼文與評論',
                    body: '在功能開放的地方，你可以刪除自己的貼文和評論。違反社群規則的內容也可能被管理員移除。',
                },
                {
                    heading: '訊息撤回',
                    body: '當會話支援撤回時，撤回會將訊息從聊天介面移除。但這不保證已被截圖、已送達的系統通知或第三方保存副本一併消失。',
                },
                {
                    heading: '檢舉與審核',
                    body: '用戶可以檢舉內容並封鎖他人。被檢舉內容可能依據社群安全規則進行審核和處理。',
                },
            ],
        },
    },
};

export const TAB_LABELS: Record<'en' | 'zh-Hans' | 'zh-Hant', Record<LegalTab, string>> = {
    en: { privacy: 'Privacy', terms: 'Deletion' },
    'zh-Hans': { privacy: '隐私', terms: '删除说明' },
    'zh-Hant': { privacy: '隱私', terms: '刪除說明' },
};

export const normalizeLanguage = (language: string): 'en' | 'zh-Hans' | 'zh-Hant' => {
    if (language.startsWith('zh-Hant')) return 'zh-Hant';
    if (language.startsWith('zh-Hans') || language.startsWith('zh')) return 'zh-Hans';
    return 'en';
};
