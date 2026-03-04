import campusFaq from '../data/campus_faq.json';

export interface FAQEntry {
    id: string;
    question: string;
    question_zh: string;
    answer: string;
    answer_zh: string;
    keywords: string[];
    related_links?: string[];
}

export interface FAQCategory {
    id: string;
    name: string;
    name_zh: string;
    description?: string;
    description_zh?: string;
    faqs?: FAQEntry[];
    subcategories?: {
        id: string;
        name: string;
        name_zh: string;
        faqs: FAQEntry[];
    }[];
}

export interface FAQData {
    metadata: {
        title: string;
        last_updated: string;
        total_categories: number;
        total_faqs: number;
    };
    categories: FAQCategory[];
}

const data = campusFaq as unknown as FAQData;

/**
 * FAQ Service
 * Handles searching and retrieving campus knowledge base information.
 */
export const FAQService = {
    /**
     * Get all categories with basic info
     */
    getCategories() {
        return data.categories.map(cat => ({
            id: cat.id,
            name: cat.name,
            name_zh: cat.name_zh,
            description: cat.description,
            description_zh: cat.description_zh,
        }));
    },

    /**
     * Get all FAQs for a specific category or subcategory
     */
    getFAQsByCategory(categoryId: string, subcategoryId?: string): FAQEntry[] {
        const category = data.categories.find(c => c.id === categoryId);
        if (!category) return [];

        if (subcategoryId && category.subcategories) {
            const sub = category.subcategories.find(s => s.id === subcategoryId);
            return sub ? sub.faqs : [];
        }

        return category.faqs || [];
    },

    /**
     * Search across all FAQs using keywords and text matching
     * @param query Search string
     * @param lang 'en' or 'zh'
     */
    searchFAQs(query: string, lang: 'en' | 'zh' = 'zh'): FAQEntry[] {
        const normalizedQuery = query.toLowerCase().trim();
        if (!normalizedQuery) return [];

        const results: FAQEntry[] = [];

        data.categories.forEach(category => {
            // Helper to process a list of FAQs
            const processFAQs = (faqs: FAQEntry[]) => {
                faqs.forEach(faq => {
                    const qText = lang === 'zh' ? faq.question_zh : faq.question;
                    const aText = lang === 'zh' ? faq.answer_zh : faq.answer;

                    // 1. Check Keywords (Highest priority)
                    const keywordMatch = faq.keywords.some(k => k.toLowerCase().includes(normalizedQuery));

                    // 2. Check Question text
                    const questionMatch = qText.toLowerCase().includes(normalizedQuery);

                    // 3. Check Answer text (Optional, lower weight)
                    const answerMatch = aText.toLowerCase().includes(normalizedQuery);

                    if (keywordMatch || questionMatch || answerMatch) {
                        results.push(faq);
                    }
                });
            };

            if (category.faqs) processFAQs(category.faqs);
            if (category.subcategories) {
                category.subcategories.forEach(sub => processFAQs(sub.faqs));
            }
        });

        // Simple de-duplication and limit
        return Array.from(new Set(results)).slice(0, 10);
    },

    /**
     * Get a specific FAQ by ID
     */
    getFAQById(id: string): FAQEntry | undefined {
        let found: FAQEntry | undefined;

        data.categories.some(category => {
            if (category.faqs) {
                found = category.faqs.find(f => f.id === id);
                if (found) return true;
            }
            if (category.subcategories) {
                category.subcategories.some(sub => {
                    found = sub.faqs.find(f => f.id === id);
                    if (found) return true;
                    return false;
                });
                if (found) return true;
            }
            return false;
        });

        return found;
    },

    /**
     * Search the Supabase knowledge base (RAG chunks)
     * Uses ILIKE for fast keyword matching on the 73 ingested chunks.
     */
    async searchKnowledgeBase(query: string) {
        const { supabase } = await import('./supabase');

        // Split query into keywords for better matching
        const words = query.split(/\s+/).filter(w => w.length > 1);

        let dbQuery = supabase
            .from('agent_knowledge_base')
            .select('content, metadata');

        if (words.length > 0) {
            // Match any word in content using OR for broader search
            const orQuery = words.map(word => `content.ilike.%${word}%`).join(',');
            dbQuery = dbQuery.or(orQuery);
        } else {
            dbQuery = dbQuery.ilike('content', `%${query}%`);
        }

        const { data: dbData, error } = await dbQuery.limit(5);

        if (error) {
            console.error('[FAQService] Supabase search error:', error);
            return [];
        }

        return dbData || [];
    }
};
