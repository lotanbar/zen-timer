import { Asset } from '../types';

const CDN_BASE = 'https://zentimer-assets.b-cdn.net';
const DEV_CDN_BASE = `${CDN_BASE}/dev-samples-DONOTREMOVE`;

// Dev sample tracks for testing (4 total: 2 local bundled, 2 from CDN)
export const DEV_SAMPLE_ASSETS: Asset[] = [
  // Local bundled tracks (audio + thumbnails bundled)
  {
    id: 'dev_local_wind',
    displayName: '15s Local Wind',
    type: 'ambient',
    audioUrl: 'BUNDLED:dev_wind',
    imageUrl: 'BUNDLED:dev_local_wind',
    category: 'Dev Local',
    duration: 15,
  },
  {
    id: 'dev_local_frogs',
    displayName: '15s Local Frogs',
    type: 'ambient',
    audioUrl: 'BUNDLED:dev_frogs',
    imageUrl: 'BUNDLED:dev_local_frogs',
    category: 'Dev Local',
    duration: 15,
  },
  // CDN tracks (audio from CDN, thumbnails bundled)
  {
    id: 'dev_cloud_wind',
    displayName: '15s Cloud Wind',
    type: 'ambient',
    audioUrl: `${DEV_CDN_BASE}/dev_wind.mp3`,
    imageUrl: 'BUNDLED:dev_local_wind',
    category: 'Dev Cloud',
    duration: 15,
  },
  {
    id: 'dev_cloud_frogs',
    displayName: '15s Cloud Frogs',
    type: 'ambient',
    audioUrl: `${DEV_CDN_BASE}/dev_frogs.mp3`,
    imageUrl: 'BUNDLED:dev_local_frogs',
    category: 'Dev Cloud',
    duration: 15,
  },
];

// IDs for easy filtering
export const DEV_SAMPLE_IDS = DEV_SAMPLE_ASSETS.map((a) => a.id);
