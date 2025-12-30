# ZenTimer

A minimalist meditation timer for Android.

## Features

- **Customizable duration** - Set your meditation length
- **Ambient sounds** - Choose from nature, sound healing, and more
- **Ending bells** - Various bell sounds to signal session end
- **Interval bells** - Optional repeating bells during meditation
- **Background playback** - Works with screen off
- **Shuffle** - Randomly discover new ambient sounds

## Build

```bash
npm install
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
```

APK output: `android/app/build/outputs/apk/release/app-release.apk`
