import { CampusLocation } from '../types';
import { supabase } from './supabase';

const HIDDEN_BUILDING_IDS = new Set(['lam-woo', 'sc-lw']);

export const getBuildings = async (): Promise<CampusLocation[]> => {
    const { data, error } = await supabase
        .from('buildings')
        .select('*')
        .order('id');

    if (error) {
        console.error('Error fetching buildings:', error.message);
        throw error;
    }

    // Map from database schema (snake_case) to application type (camelCase)
    return (data || [])
        .filter(b => !HIDDEN_BUILDING_IDS.has(b.id))
        .map(b => ({
            id: b.id,
            name: b.name,
            category: b.category as any,
            description: b.description,
            imageUrl: b.image_url,
            coordinates: {
                latitude: b.lat,
                longitude: b.lng
            }
        }));
};
