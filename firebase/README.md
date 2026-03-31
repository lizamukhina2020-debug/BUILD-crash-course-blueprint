## Firebase native config files (required for Analytics)

To enable **Firebase Analytics** in Expo Dev Client and production builds, place these files in this folder:

- `GoogleService-Info.plist` (iOS)
- `google-services.json` (Android)

Download them from Firebase Console:

1. Firebase Console → Project settings (gear icon)
2. Your apps → iOS / Android
3. Download the config file

After adding the files, rebuild your dev client / production build so the native Firebase config is bundled.

