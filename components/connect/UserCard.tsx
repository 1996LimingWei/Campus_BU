import { Hand, MessageCircle } from 'lucide-react-native';
import React from 'react';
import { Dimensions, Text, TouchableOpacity, View } from 'react-native';
import { User } from '../../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 48;

interface UserCardProps {
    user: Omit<User, 'createdAt'>;
    onPoke: () => void;
    onWave: () => void;
    onChat: () => void;
}

// Generate a consistent color based on user ID
const getAvatarColor = (uid: string) => {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];
    const index = uid.charCodeAt(uid.length - 1) % colors.length;
    return colors[index];
};

export const UserCard: React.FC<UserCardProps> = ({ user, onPoke, onWave, onChat }) => {
    const avatarColor = getAvatarColor(user.uid);

    return (
        <View
            style={{ width: CARD_WIDTH }}
            className="bg-white rounded-3xl shadow-lg overflow-hidden border border-gray-100"
        >
            {/* Avatar Section */}
            <View className="items-center pt-8 pb-4">
                <View
                    style={{ backgroundColor: avatarColor }}
                    className="w-24 h-24 rounded-full items-center justify-center mb-4 shadow-md"
                >
                    <Text className="text-4xl font-bold text-white">
                        {user.displayName[0].toUpperCase()}
                    </Text>
                </View>

                <Text className="text-2xl font-bold text-gray-900">{user.displayName}</Text>
                <Text className="text-gray-500 mt-1">{user.major}</Text>
            </View>

            {/* Divider */}
            <View className="h-px bg-gray-100 mx-6" />

            {/* Action Buttons */}
            <View className="flex-row justify-around p-6">
                <TouchableOpacity
                    onPress={onPoke}
                    className="items-center"
                >
                    <View className="w-14 h-14 rounded-full bg-red-100 items-center justify-center mb-2">
                        <Text className="text-2xl">👆</Text>
                    </View>
                    <Text className="text-gray-600 text-sm font-medium">Poke</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={onWave}
                    className="items-center"
                >
                    <View className="w-14 h-14 rounded-full bg-teal-100 items-center justify-center mb-2">
                        <Hand size={24} color="#14B8A6" />
                    </View>
                    <Text className="text-gray-600 text-sm font-medium">Wave</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={onChat}
                    className="items-center"
                >
                    <View className="w-14 h-14 rounded-full bg-primary/10 items-center justify-center mb-2">
                        <MessageCircle size={24} color="#1E3A8A" />
                    </View>
                    <Text className="text-gray-600 text-sm font-medium">Chat</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};
