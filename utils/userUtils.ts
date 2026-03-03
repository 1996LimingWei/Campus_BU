/**
 * User utility functions
 */

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
