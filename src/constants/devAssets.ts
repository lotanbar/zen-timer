import { Asset } from '../types';

const CDN_BASE = 'https://zentimer-assets.b-cdn.net';
const DEV_IMAGES_BASE = `${CDN_BASE}/dev-samples`;

// Dev sample tracks for testing audio playback
export const DEV_SAMPLE_ASSETS: Asset[] = [
  // Local bundled tracks (15 seconds, use BUNDLED: prefix)
  {
    id: 'dev_local_monotonous',
    displayName: '15s Local Wind',
    type: 'ambient',
    audioUrl: 'BUNDLED:dev_wind',
    imageUrl: `${DEV_IMAGES_BASE}/dev_local_wind.png`,
    category: 'Dev Samples',
  },
  {
    id: 'dev_local_changing',
    displayName: '15s Local Frogs',
    type: 'ambient',
    audioUrl: 'BUNDLED:dev_frogs',
    imageUrl: `${DEV_IMAGES_BASE}/dev_local_frogs.png`,
    category: 'Dev Samples',
  },
  // CDN tracks (full length, from existing library)
  {
    id: 'dev_cdn_monotonous',
    displayName: '15s Cloud Water',
    type: 'ambient',
    audioUrl: `${CDN_BASE}/005%20-%20Waves/0456%20Water%20lap%20slow.mp3`,
    imageUrl: `${DEV_IMAGES_BASE}/dev_cloud_water.png`,
    category: 'Dev Samples',
  },
  {
    id: 'dev_cdn_changing',
    displayName: '15s Cloud Frogs',
    type: 'ambient',
    audioUrl: `${CDN_BASE}/009%20-%20Wetlands/1022%20Swamp%20morning%20frogs.mp3`,
    imageUrl: `${DEV_IMAGES_BASE}/dev_cloud_frogs.png`,
    category: 'Dev Samples',
  },
];

// IDs for easy filtering
export const DEV_SAMPLE_IDS = DEV_SAMPLE_ASSETS.map((a) => a.id);
