import { Asset } from '../types';

const CDN_BASE = 'https://zentimer-assets.b-cdn.net';
const BELLS_BASE = `${CDN_BASE}/bells`;

function toDisplayName(id: string): string {
  return id
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function createBellAsset(id: string): Asset {
  return {
    id,
    displayName: toDisplayName(id),
    type: 'bell',
    audioUrl: `${BELLS_BASE}/bells_audio/${id}.mp3`,
    imageUrl: `${BELLS_BASE}/bells_images/${id}.png`,
  };
}

export const BELL_ASSETS: Asset[] = [
  'temple_bell',
  'symphonic_gong',
  'tingshas',
  'bansuri',
  'bar_chimes_rich',
  'b_bowl',
  'c_bowl',
  'cello',
  'church_bell',
  'djembe',
  'duduk',
  'e_bowl',
  'flute_two_notes',
  'frame_drum_double',
  'guitar',
  'guzheng',
  'handpan',
  'harp',
  'kalimba',
  'kanun',
  'koshi_chimes_air_1',
  'koshi_chimes_earth_1',
  'koshi_chimes_fire_1',
  'koshi_chimes_water_1',
  'marimba',
  'monk',
  'native_american_flute',
  'om_mantra',
  'om_shanti_mantra',
  'oud',
  'pan_flute',
  'piano',
  'rain_stick',
  'rav_drum',
  'sarangi',
  'sarod',
  'shakuhachi',
  'sitar',
  'swinging_chimes_notes_rich',
  'tongue_drum',
  'tuning_fork',
  'turkish_ney',
  'violin',
  'vocal_hum',
  'water_gong',
  'wind_gong',
].map(createBellAsset);

export const DEFAULT_BELL_ID = 'temple_bell';

// Helper to get asset by id
export function getAssetById(id: string): Asset | undefined {
  return BELL_ASSETS.find(a => a.id === id);
}
