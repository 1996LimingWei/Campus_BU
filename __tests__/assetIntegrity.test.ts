import fs from 'fs';
import path from 'path';

describe('HKCampus icon asset integrity', () => {
    it('stores the shared app icon as a real PNG file', () => {
        const iconPath = path.resolve(__dirname, '../assets/images/HKCampusicon.png');
        const pngSignature = '89504e470d0a1a0a';
        const fileHeader = fs.readFileSync(iconPath).subarray(0, 8).toString('hex');

        expect(fileHeader).toBe(pngSignature);
    });
});
