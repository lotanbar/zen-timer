import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface MeditationSession {
  id: string;
  durationSeconds: number;
  completedAt: string; // ISO string
  completed: boolean;
  ambienceId: string | null;
  bellId: string;
}

interface SessionStats {
  totalSessions: number;
  completedSessions: number;
  totalMinutes: number;
  currentStreak: number;
  longestStreak: number;
  lastSessionDate: string | null;
}

interface SessionState {
  sessions: MeditationSession[];
  addSession: (session: Omit<MeditationSession, 'id'>) => void;
  clearHistory: () => void;
  getStats: () => SessionStats;
  getRecentSessions: (limit?: number) => MeditationSession[];
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

function isConsecutiveDay(date1: Date, date2: Date): boolean {
  const d1 = new Date(date1);
  d1.setDate(d1.getDate() + 1);
  return isSameDay(d1, date2);
}

function calculateStreak(sessions: MeditationSession[]): { current: number; longest: number } {
  if (sessions.length === 0) return { current: 0, longest: 0 };

  // Get unique dates (only count completed sessions)
  const completedSessions = sessions.filter(s => s.completed);
  if (completedSessions.length === 0) return { current: 0, longest: 0 };

  const uniqueDates = [...new Set(
    completedSessions.map(s => {
      const d = new Date(s.completedAt);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    })
  )].map(dateStr => {
    const [year, month, date] = dateStr.split('-').map(Number);
    return new Date(year, month, date);
  }).sort((a, b) => b.getTime() - a.getTime()); // Most recent first

  if (uniqueDates.length === 0) return { current: 0, longest: 0 };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const mostRecent = uniqueDates[0];

  // Check if most recent session is today or yesterday (for current streak)
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  let currentStreak = 0;
  if (isSameDay(mostRecent, today) || isSameDay(mostRecent, yesterday)) {
    currentStreak = 1;
    for (let i = 1; i < uniqueDates.length; i++) {
      if (isConsecutiveDay(uniqueDates[i], uniqueDates[i - 1])) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  // Calculate longest streak
  let longestStreak = 1;
  let tempStreak = 1;
  for (let i = 1; i < uniqueDates.length; i++) {
    if (isConsecutiveDay(uniqueDates[i], uniqueDates[i - 1])) {
      tempStreak++;
      longestStreak = Math.max(longestStreak, tempStreak);
    } else {
      tempStreak = 1;
    }
  }

  return { current: currentStreak, longest: Math.max(longestStreak, currentStreak) };
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      sessions: [],

      addSession: (sessionData) => {
        const session: MeditationSession = {
          ...sessionData,
          id: generateId(),
        };
        set((state) => ({
          sessions: [session, ...state.sessions].slice(0, 1000), // Keep max 1000 sessions
        }));
      },

      clearHistory: () => set({ sessions: [] }),

      getStats: () => {
        const { sessions } = get();
        const completedSessions = sessions.filter(s => s.completed);
        const streaks = calculateStreak(sessions);

        return {
          totalSessions: sessions.length,
          completedSessions: completedSessions.length,
          totalMinutes: Math.round(
            sessions.reduce((acc, s) => acc + s.durationSeconds, 0) / 60
          ),
          currentStreak: streaks.current,
          longestStreak: streaks.longest,
          lastSessionDate: sessions.length > 0 ? sessions[0].completedAt : null,
        };
      },

      getRecentSessions: (limit = 10) => {
        return get().sessions.slice(0, limit);
      },
    }),
    {
      name: 'zen-timer-sessions',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
