import Constants from 'expo-constants';

type AppExtra = {
  internalBuild?: boolean;
};

const getExtra = (): AppExtra => {
  const extra =
    (Constants.expoConfig?.extra as AppExtra | undefined) ??
    // Legacy Expo manifests
    ((Constants as any).manifest?.extra as AppExtra | undefined) ??
    // Some Expo Go/dev-client shapes
    ((Constants as any).manifest2?.extra?.expoClient?.extra as AppExtra | undefined) ??
    {};
  return extra;
};

export const isInternalBuild = (): boolean => {
  if (__DEV__) return true;
  const extra = getExtra();
  return !!extra.internalBuild;
};

