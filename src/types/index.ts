// Dynamic category - 'all' is special, others come from repo folder names
export type AmbientCategory = 'all' | string;

export interface Asset {
  id: string;
  displayName: string;
  type: 'ambient' | 'bell';
  audioUrl: string;
  imageUrl: string;
  category?: AmbientCategory;
  hasDiscrepancy?: boolean;
  discrepancyReason?: string;
}

export interface Duration {
  hours: number;
  minutes: number;
  seconds: number;
}

export interface RepeatBellOptions {
  enabled: boolean;
  count: number;
  beforeEndSeconds: number;
}

export interface UserPreferences {
  duration: Duration;
  ambienceId: string | null;
  bellId: string;
  repeatBell: RepeatBellOptions;
}

export interface TimerState {
  isRunning: boolean;
  remainingSeconds: number;
  scheduledBellTimes: number[];
}

export interface MeditationSession {
  id: string;
  durationSeconds: number;
  completedAt: string;
  completed: boolean;
  ambienceId: string | null;
  bellId: string;
}

export interface SessionStats {
  totalSessions: number;
  completedSessions: number;
  totalMinutes: number;
  currentStreak: number;
  longestStreak: number;
  lastSessionDate: string | null;
}

export type RootStackParamList = {
  Home: undefined;
  Duration: undefined;
  Ambience: undefined;
  Bell: undefined;
  Timer: undefined;
};
