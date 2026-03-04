// lib/storage.ts - Universal storage implementation for both web and native
import { Platform } from "react-native";

interface StorageInterface {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

class UniversalStorage implements StorageInterface {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === "web") {
      // Web implementation
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage.getItem(key);
      }
      return null;
    } else {
      // Native implementation
      const AsyncStorage =
        await import("@react-native-async-storage/async-storage");
      return await AsyncStorage.default.getItem(key);
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") {
      // Web implementation
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } else {
      // Native implementation
      const AsyncStorage =
        await import("@react-native-async-storage/async-storage");
      await AsyncStorage.default.setItem(key, value);
    }
  }

  async removeItem(key: string): Promise<void> {
    if (Platform.OS === "web") {
      // Web implementation
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } else {
      // Native implementation
      const AsyncStorage =
        await import("@react-native-async-storage/async-storage");
      await AsyncStorage.default.removeItem(key);
    }
  }
}

export default new UniversalStorage();
