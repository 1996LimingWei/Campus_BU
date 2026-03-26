/**
 * User utility functions
 */

import { supabase } from '../services/supabase';

// Cache for admin status (valid for 5 minutes)
let adminStatusCache: {
    userId: string;
    isAdmin: boolean;
    timestamp: number;
} | null = null;

const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Check if email is a HKBU email address
 * HKBU student emails for this app should end with @life.hkbu.edu.hk
 */
export const isHKBUEmail = (email?: string): boolean => {
    if (!email) return false;
    return email.toLowerCase().trim().endsWith('@life.hkbu.edu.hk');
};

/**
 * Check if user is an HKBU student/staff
 */
export const isHKBUUser = (email?: string): boolean => {
    return isHKBUEmail(email);
};

/**
 * Check if user is an admin
 * Uses Supabase RPC function to avoid RLS recursion issues
 */
export const isAdmin = async (userId?: string | null): Promise<boolean> => {

    if (!userId) {
        return false;
    }

    // Check cache first
    const now = Date.now();
    if (adminStatusCache &&
        adminStatusCache.userId === userId &&
        (now - adminStatusCache.timestamp) < CACHE_DURATION_MS) {
        return adminStatusCache.isAdmin;
    }

    // Use RPC function instead of direct table query to avoid RLS issues
    try {
        const { data, error } = await supabase
            .rpc('is_user_admin', { check_user_id: userId });

        if (error) {

            // Fallback: try direct query (might fail with RLS)
            const { data: directData, error: directError } = await supabase
                .from('app_admins')
                .select('is_active')
                .eq('user_id', userId)
                .eq('is_active', true)
                .maybeSingle();

            if (directError || !directData) {
                return false;
            }

            const isAdmin = !!directData?.is_active;

            adminStatusCache = {
                userId,
                isAdmin,
                timestamp: now
            };

            return isAdmin;
        }

        const isAdmin = !!data;

        // Update cache
        adminStatusCache = {
            userId,
            isAdmin,
            timestamp: now
        };

        return isAdmin;
    } catch (error) {
        return false;
    }
};

/**
 * Check if user is admin synchronously (using cache only)
 * Use this for UI rendering where async is not possible
 * Note: May return stale data if cache is outdated
 */
export const isAdminSync = (userId?: string | null): boolean => {

    if (!userId || !adminStatusCache) {
        return false;
    }

    const now = Date.now();
    if (adminStatusCache.userId === userId &&
        (now - adminStatusCache.timestamp) < CACHE_DURATION_MS) {
        return adminStatusCache.isAdmin;
    }

    return false;
};

/**
 * Clear admin status cache
 * Call this after making changes to admin status
 */
export const clearAdminCache = () => {
    adminStatusCache = null;
};
