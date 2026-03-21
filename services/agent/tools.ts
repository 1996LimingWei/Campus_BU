import { ToolDefinition } from './types';

export const TOOLS: ToolDefinition[] = [
    {
        name: 'read_user_schedule',
        description: 'Read the current user schedule for queries like today classes, next class, or classes on a specific weekday.',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'The user request about their personal schedule, in Chinese or English.' }
            },
            required: ['query']
        }
    },
    {
        name: 'read_course_community',
        description: 'Read a course community snapshot including reviews, chatroom activity, and teaming posts for a specific course.',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'The user request about a course review, chatroom, or teaming status.' }
            },
            required: ['query']
        }
    },
    {
        name: 'post_course_review',
        description: 'Post a course review on behalf of the logged-in user after the course, rating, and review content are clear.',
        parameters: {
            type: 'object',
            properties: {
                courseCode: { type: 'string', description: 'The course code, such as COMP3015.' },
                rating: { type: 'number', description: 'A 1-5 star rating.' },
                content: { type: 'string', description: 'The review text the user wants to publish.' }
            },
            required: ['courseCode', 'rating', 'content']
        }
    },
    {
        name: 'post_course_teaming',
        description: 'Publish a teaming post for a course after course, section, intro, and contact details are clear.',
        parameters: {
            type: 'object',
            properties: {
                courseCode: { type: 'string', description: 'The course code, such as COMP3015.' },
                section: { type: 'string', description: 'The user section, such as A1.' },
                content: { type: 'string', description: 'The self-introduction or teaming note to publish.' }
            },
            required: ['courseCode', 'section', 'content']
        }
    },
    {
        name: 'send_course_chat_message',
        description: 'Send a message to the course chatroom after the course and message content are clear.',
        parameters: {
            type: 'object',
            properties: {
                courseCode: { type: 'string', description: 'The course code, such as COMP3015.' },
                content: { type: 'string', description: 'The chat message content to send.' }
            },
            required: ['courseCode', 'content']
        }
    },
    {
        name: 'read_campus_building',
        description: 'Read HKBU building information such as location, description, and nearby facilities for a named building or building code.',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'The user request about a building, such as AAB, WLB, library building, or where a building is.' }
            },
            required: ['query']
        }
    },
    {
        name: 'find_nearby_place',
        description: 'Use the current device location to find the nearest HKBU building or food outlet.',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'The user request about nearby buildings, restaurants, canteens, or current location.' }
            },
            required: ['query']
        }
    },
    {
        name: 'search_canteen_menu',
        description: 'Search for canteen menus and recommendations based on location.',
        parameters: {
            type: 'object',
            properties: {
                location: { type: 'string', description: 'User location or specific canteen name' },
                preference: { type: 'string', description: 'Food preference (e.g., spicy, vegetarian)' }
            },
            required: ['location']
        }
    },
    {
        name: 'get_user_profile',
        description: 'Get user preferences like major, residence hall, and favorite food. Used for semantic memory.',
        parameters: {
            type: 'object',
            properties: {},
            required: []
        }
    },
    {
        name: 'save_user_preference',
        description: 'Store a user preference or fact to persistent memory.',
        parameters: {
            type: 'object',
            properties: {
                key: { type: 'string', description: 'The key for the fact (e.g., hall, major, food)' },
                value: { type: 'string', description: 'The value to store' }
            },
            required: ['key', 'value']
        }
    },
    {
        name: 'search_campus_faq',
        description: 'Search the official HKBU knowledge base for questions about admissions, library policies, IT services, housing, and financial aid.',
        parameters: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'The user search query in English or Chinese' }
            },
            required: ['query']
        }
    }
];
