jest.mock('../../services/supabase', () => ({
    supabase: {
        rpc: jest.fn(),
        auth: {
            signOut: jest.fn(),
        },
    },
}));

jest.mock('expo-file-system/legacy', () => ({}));
jest.mock('expo-local-authentication', () => ({
    hasHardwareAsync: jest.fn(),
    isEnrolledAsync: jest.fn(),
    authenticateAsync: jest.fn(),
}));
jest.mock('../../utils/image', () => ({
    compressImageForUpload: jest.fn(),
}));
jest.mock('../../utils/remoteImage', () => ({
    IMMUTABLE_STORAGE_CACHE_CONTROL: 'public, max-age=31536000, immutable',
}));

import { deleteAccount } from '../../services/auth';
import { supabase } from '../../services/supabase';

describe('auth deleteAccount', () => {
    const mockRpc = supabase.rpc as jest.Mock;
    const mockSignOut = supabase.auth.signOut as jest.Mock;
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
        jest.clearAllMocks();
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
    });

    afterEach(() => {
        warnSpy.mockRestore();
    });

    it('signs the user out after the delete_user RPC succeeds', async () => {
        mockRpc.mockResolvedValue({ error: null });
        mockSignOut.mockResolvedValue({ error: null });

        await deleteAccount();

        expect(mockRpc).toHaveBeenCalledWith('delete_user');
        expect(mockSignOut).toHaveBeenCalledTimes(1);
    });

    it('throws and keeps the local session when the delete_user RPC returns an error', async () => {
        const rpcError = new Error('rpc failed');
        mockRpc.mockResolvedValue({ error: rpcError });

        await expect(deleteAccount()).rejects.toThrow('rpc failed');

        expect(mockRpc).toHaveBeenCalledWith('delete_user');
        expect(mockSignOut).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalled();
    });
});
