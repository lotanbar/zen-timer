# zen-timer

Android meditation timer app built with Kotlin + Jetpack Compose.

## Current status

Implemented milestone 1 from `zen-timer plans`:

- App shell with 2 screens: `Main` and `Meditation`
- Navigation between screens
- Runtime setup gate that blocks meditation start until required setup is complete:
  - Assets path present
  - Assets validity confirmed (temporary simulation switch)
  - Time selected
  - Ambience selected
  - Ending bell selected

## Project structure

- `app/src/main/java/com/zentimer/app/MainActivity.kt` - host activity and nav setup
- `app/src/main/java/com/zentimer/app/ui/MainScreen.kt` - setup screen with gate logic
- `app/src/main/java/com/zentimer/app/ui/MeditationScreen.kt` - basic countdown view
- `app/src/main/java/com/zentimer/app/ui/ZenTimerViewModel.kt` - state and guard conditions

## Next milestone

Milestone 2: implement real assets configuration flow:

- Download label
- Path picker
- Startup/path scan
- Strict exact-package match validation
- Red banner states
