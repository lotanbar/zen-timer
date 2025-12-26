import { Asset, AmbientCategory } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';

const REPO_TREE_API = 'https://api.github.com/repos/lotanbar/zen-timer-assets/git/trees/master?recursive=1';
const RAW_BASE_URL = 'https://raw.githubusercontent.com/lotanbar/zen-timer-assets/master';
const CACHE_KEY = 'zen-timer-repo-tree';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface DiscoveredAsset extends Asset {
  hasDiscrepancy?: boolean;
  discrepancyReason?: string;
}

interface CategoryInfo {
  id: AmbientCategory;
  label: string;
}

interface TreeItem {
  path: string;
  type: 'blob' | 'tree';
}

interface CachedTree {
  timestamp: number;
  items: TreeItem[];
}

function toDisplayName(id: string): string {
  return id
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function toCategoryLabel(folderId: string): string {
  const labels: Record<string, string> = {
    'nature': 'Nature',
    'water': 'Water',
    'wildlife': 'Wildlife',
    'instrumental': 'Instrumental',
    'divine_spiritual': 'Spiritual',
    'frequencies_tones': 'Frequencies',
    'sound_healing': 'Healing',
    'ambient_misc': 'Misc',
  };
  return labels[folderId] || toDisplayName(folderId);
}

// Fetch entire repo tree in ONE request (avoids rate limiting)
async function fetchRepoTree(): Promise<TreeItem[]> {
  // Check cache first
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed: CachedTree = JSON.parse(cached);
      if (Date.now() - parsed.timestamp < CACHE_TTL) {
        return parsed.items;
      }
    }
  } catch (e) {
    // Cache read failed, continue to fetch
  }

  try {
    const response = await fetch(REPO_TREE_API);
    if (!response.ok) {
      console.error(`Failed to fetch repo tree: ${response.status}`);
      return [];
    }
    const data = await response.json();
    const items: TreeItem[] = (data.tree || []).map((item: any) => ({
      path: item.path,
      type: item.type,
    }));

    // Cache the result
    try {
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({
        timestamp: Date.now(),
        items,
      }));
    } catch (e) {
      // Cache write failed, ignore
    }

    return items;
  } catch (error) {
    console.error('Error fetching repo tree:', error);
    return [];
  }
}

function getFileBaseName(filename: string): string {
  return filename.replace(/\.(mp3|jpg|jpeg|png|webp)$/i, '');
}

export async function discoverCategories(): Promise<CategoryInfo[]> {
  const tree = await fetchRepoTree();

  // Find all category folders under ambient_by_category/
  const categoryFolders = new Set<string>();
  tree.forEach(item => {
    const match = item.path.match(/^ambient_by_category\/([^/]+)$/);
    if (match && item.type === 'tree') {
      categoryFolders.add(match[1]);
    }
  });

  const categories: CategoryInfo[] = [
    { id: 'all', label: 'All' },
    ...Array.from(categoryFolders).sort().map(folder => ({
      id: folder as AmbientCategory,
      label: toCategoryLabel(folder),
    })),
  ];

  return categories;
}

export async function discoverAmbientAssets(): Promise<DiscoveredAsset[]> {
  const tree = await fetchRepoTree();

  // Parse tree to find audio and image files
  const audioLocations: Map<string, { category: string; path: string }[]> = new Map();
  const imageLocations: Map<string, { category: string; path: string; ext: string }[]> = new Map();

  tree.forEach(item => {
    if (item.type !== 'blob') return;

    // Match audio files: ambient_by_category/{category}/audio/{name}.mp3
    const audioMatch = item.path.match(/^ambient_by_category\/([^/]+)\/audio\/([^/]+)\.mp3$/);
    if (audioMatch) {
      const [, category, name] = audioMatch;
      const locs = audioLocations.get(name) || [];
      locs.push({ category, path: item.path });
      audioLocations.set(name, locs);
    }

    // Match image files: ambient_by_category/{category}/images/{name}.{ext}
    const imageMatch = item.path.match(/^ambient_by_category\/([^/]+)\/images\/([^/]+)\.(jpg|jpeg|png|webp)$/i);
    if (imageMatch) {
      const [, category, name, ext] = imageMatch;
      const locs = imageLocations.get(name) || [];
      locs.push({ category, path: item.path, ext });
      imageLocations.set(name, locs);
    }
  });

  // Build assets with discrepancy detection
  const allIds = new Set([...audioLocations.keys(), ...imageLocations.keys()]);
  const assets: DiscoveredAsset[] = [];

  allIds.forEach(id => {
    const audioLocs = audioLocations.get(id) || [];
    const imageLocs = imageLocations.get(id) || [];

    // Determine primary category
    let primaryCategory = audioLocs[0]?.category || imageLocs[0]?.category || 'unknown';

    // Detect discrepancies
    let hasDiscrepancy = false;
    let discrepancyReason = '';

    if (audioLocs.length === 0) {
      hasDiscrepancy = true;
      discrepancyReason = `Missing audio file (image found in: ${imageLocs.map(l => l.category).join(', ')})`;
    } else if (imageLocs.length === 0) {
      hasDiscrepancy = true;
      discrepancyReason = `Missing image file (audio found in: ${audioLocs.map(l => l.category).join(', ')})`;
    } else if (audioLocs[0].category !== imageLocs[0].category) {
      hasDiscrepancy = true;
      discrepancyReason = `Audio in "${audioLocs[0].category}" but image in "${imageLocs[0].category}"`;
    }

    const audioCategory = audioLocs[0]?.category || primaryCategory;
    const imageCategory = imageLocs[0]?.category || primaryCategory;
    const imageExt = imageLocs[0]?.ext || 'jpg';

    assets.push({
      id,
      displayName: toDisplayName(id),
      type: 'ambient',
      category: primaryCategory as AmbientCategory,
      audioUrl: `${RAW_BASE_URL}/ambient_by_category/${audioCategory}/audio/${id}.mp3`,
      imageUrl: `${RAW_BASE_URL}/ambient_by_category/${imageCategory}/images/${id}.${imageExt}`,
      hasDiscrepancy,
      discrepancyReason,
    });
  });

  return assets.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function discoverBellAssets(): Promise<Asset[]> {
  const tree = await fetchRepoTree();

  const audioFiles = new Set<string>();
  const imageFiles = new Map<string, string>(); // name -> filename with ext

  tree.forEach(item => {
    if (item.type !== 'blob') return;

    // Match bell audio: bells_audio/{name}.mp3
    const audioMatch = item.path.match(/^bells_audio\/([^/]+)\.mp3$/);
    if (audioMatch) {
      audioFiles.add(audioMatch[1]);
    }

    // Match bell images: bells_images/{name}.{ext}
    const imageMatch = item.path.match(/^bells_images\/([^/]+)\.(jpg|jpeg|png|webp)$/i);
    if (imageMatch) {
      const [, name, ext] = imageMatch;
      imageFiles.set(name, `${name}.${ext}`);
    }
  });

  // Only include bells that have both audio and image
  const assets: Asset[] = [];
  audioFiles.forEach(id => {
    const imageFileName = imageFiles.get(id);
    if (imageFileName) {
      assets.push({
        id,
        displayName: toDisplayName(id),
        type: 'bell',
        audioUrl: `${RAW_BASE_URL}/bells_audio/${id}.mp3`,
        imageUrl: `${RAW_BASE_URL}/bells_images/${imageFileName}`,
      });
    }
  });

  return assets.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// Cache for discovered assets
let cachedAmbientAssets: DiscoveredAsset[] | null = null;
let cachedBellAssets: Asset[] | null = null;
let cachedCategories: CategoryInfo[] | null = null;

export async function getAmbientAssets(): Promise<DiscoveredAsset[]> {
  if (!cachedAmbientAssets) {
    cachedAmbientAssets = await discoverAmbientAssets();
  }
  return cachedAmbientAssets;
}

export async function getBellAssets(): Promise<Asset[]> {
  if (!cachedBellAssets) {
    cachedBellAssets = await discoverBellAssets();
  }
  return cachedBellAssets;
}

export async function getCategories(): Promise<CategoryInfo[]> {
  if (!cachedCategories) {
    cachedCategories = await discoverCategories();
  }
  return cachedCategories;
}

export function clearAssetCache(): void {
  cachedAmbientAssets = null;
  cachedBellAssets = null;
  cachedCategories = null;
}
