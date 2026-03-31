import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTH_KEYS = {
  SIGNUP_COMPLETED: 'seedmind_signup_completed',
};

export const hasCompletedSignup = async (): Promise<boolean> => {
  try {
    const value = await AsyncStorage.getItem(AUTH_KEYS.SIGNUP_COMPLETED);
    return value === 'true';
  } catch (error) {
    console.error('Error checking signup completion:', error);
    return false;
  }
};

export const completeSignup = async (): Promise<void> => {
  try {
    await AsyncStorage.setItem(AUTH_KEYS.SIGNUP_COMPLETED, 'true');
  } catch (error) {
    console.error('Error completing signup:', error);
  }
};

export const resetSignup = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(AUTH_KEYS.SIGNUP_COMPLETED);
  } catch (error) {
    console.error('Error resetting signup:', error);
  }
};


