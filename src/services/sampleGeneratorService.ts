import AsyncStorage from '@react-native-async-storage/async-storage';
import { Asset } from '../types';
import { assetCacheService } from './assetCacheService';

const STORAGE_KEY = 'zen_timer_generated_samples';
const STARRED_KEY = 'zen_timer_starred_samples';
const MANIFEST_CACHE_KEY = 'zen_timer_manifest_cache';
const THUMBNAILS_CACHE_KEY = 'zen_timer_thumbnails_cache';

const CDN_BASE = 'https://zentimer-assets.b-cdn.net';
const THUMBNAILS_BASE = `${CDN_BASE}/Thumbnails`;
const MANIFEST_URL = `${CDN_BASE}/manifest.json`;
const THUMBNAILS_JSON_URL = `${CDN_BASE}/thumbnails.json`;

// Types for CDN data
interface ManifestTrack {
  id: string;
  filename: string;
  folder: string;
  duration: number;
  keywords?: string[];
}

interface Manifest {
  version: string;
  generated: string;
  tracks: ManifestTrack[];
}

interface ThumbnailsData {
  version: string;
  generated: string;
  thumbnails: string[];
}

// In-memory cache for CDN data
let cachedManifest: Manifest | null = null;
let cachedThumbnails: string[] | null = null;

/**
 * Fetch manifest.json from CDN (with local caching)
 */
async function fetchManifest(): Promise<Manifest> {
  // Return memory cache if available
  if (cachedManifest) {
    return cachedManifest;
  }

  // Try local storage cache first
  try {
    const cached = await AsyncStorage.getItem(MANIFEST_CACHE_KEY);
    if (cached) {
      cachedManifest = JSON.parse(cached);
      return cachedManifest!;
    }
  } catch (error) {
    console.warn('[SampleGenerator] Failed to load cached manifest:', error);
  }

  // Fetch from CDN
  try {
    const response = await fetch(MANIFEST_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const manifest: Manifest = await response.json();
    cachedManifest = manifest;

    // Cache locally
    await AsyncStorage.setItem(MANIFEST_CACHE_KEY, JSON.stringify(manifest));
    console.log(`[SampleGenerator] Fetched manifest: ${manifest.tracks.length} tracks`);

    return manifest;
  } catch (error) {
    console.error('[SampleGenerator] Failed to fetch manifest:', error);
    throw error;
  }
}

/**
 * Fetch thumbnails.json from CDN (with local caching)
 */
async function fetchThumbnails(): Promise<string[]> {
  // Return memory cache if available
  if (cachedThumbnails) {
    return cachedThumbnails;
  }

  // Try local storage cache first
  try {
    const cached = await AsyncStorage.getItem(THUMBNAILS_CACHE_KEY);
    if (cached) {
      const data: ThumbnailsData = JSON.parse(cached);
      cachedThumbnails = data.thumbnails;
      return cachedThumbnails;
    }
  } catch (error) {
    console.warn('[SampleGenerator] Failed to load cached thumbnails:', error);
  }

  // Fetch from CDN
  try {
    const response = await fetch(THUMBNAILS_JSON_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data: ThumbnailsData = await response.json();
    cachedThumbnails = data.thumbnails;

    // Cache locally
    await AsyncStorage.setItem(THUMBNAILS_CACHE_KEY, JSON.stringify(data));
    console.log(`[SampleGenerator] Fetched thumbnails: ${data.thumbnails.length} images`);

    return cachedThumbnails;
  } catch (error) {
    console.error('[SampleGenerator] Failed to fetch thumbnails:', error);
    throw error;
  }
}

/**
 * Extract keywords from a filename for matching
 * "0001 Soft wind.mp3" -> ["soft", "wind"]
 * "wild_wind.jpg" -> ["wild", "wind"]
 */
function extractKeywords(filename: string): string[] {
  return filename
    .toLowerCase()
    .replace(/^\d+\s*/, '') // Remove leading numbers
    .replace(/\.(mp3|jpg|png)$/i, '') // Remove extension
    .replace(/v\d+$/i, '') // Remove version suffix
    .replace(/_/g, ' ') // Replace underscores with spaces
    .split(/\s+/)
    .filter(word => word.length > 2) // Skip tiny words
    .filter(word => !['the', 'and', 'with', 'for'].includes(word)); // Skip common words
}

/**
 * Calculate match score between track keywords and thumbnail keywords
 */
function calculateMatchScore(trackKeywords: string[], thumbnailKeywords: string[]): number {
  let score = 0;

  for (const trackWord of trackKeywords) {
    for (const thumbWord of thumbnailKeywords) {
      // Exact match
      if (trackWord === thumbWord) {
        score += 10;
      }
      // Partial match (one contains the other)
      else if (trackWord.includes(thumbWord) || thumbWord.includes(trackWord)) {
        score += 5;
      }
      // Similar words (share root)
      else if (trackWord.length > 4 && thumbWord.length > 4) {
        const minLen = Math.min(trackWord.length, thumbWord.length);
        const prefix = Math.floor(minLen * 0.6);
        if (trackWord.slice(0, prefix) === thumbWord.slice(0, prefix)) {
          score += 3;
        }
      }
    }
  }

  return score;
}

/**
 * Category-based keyword hints for better matching
 */
const CATEGORY_HINTS: Record<string, string[]> = {
  'Nature Essentials': ['wind', 'rain', 'thunder', 'stream', 'river', 'nature'],
  'Winds Of Nature': ['wind', 'storm', 'breeze', 'gust'],
  'Thunder And Rain': ['thunder', 'rain', 'storm', 'lightning'],
  'Flowing Water': ['water', 'stream', 'brook', 'waterfall', 'river', 'cave', 'drip'],
  'Waves': ['wave', 'ocean', 'sea', 'surf', 'beach', 'water'],
  'Prairies': ['prairie', 'meadow', 'field', 'dawn', 'bird', 'country'],
  'Tropical Forests': ['jungle', 'tropical', 'forest', 'rainforest', 'night', 'evening'],
  'Deciduous Forests': ['forest', 'woodland', 'bird', 'dawn', 'tree'],
  'Wetlands': ['swamp', 'marsh', 'frog', 'wetland', 'pond'],
  'Upwellings': ['volcano', 'geothermal', 'bubble', 'steam', 'cave'],
  'Coniferous Forests': ['pine', 'forest', 'conifer', 'mountain', 'bird'],
  'Canyons': ['canyon', 'desert', 'echo', 'expanse', 'horizon'],
  'Deserts': ['desert', 'savanna', 'outback', 'campfire', 'dry'],
  'Quietudes': ['quiet', 'gentle', 'calm', 'peaceful', 'dewdrop', 'morning'],
  'Riparian Zones': ['stream', 'river', 'bank', 'garden', 'spring'],
  'Ocean Shores': ['ocean', 'shore', 'beach', 'seagull', 'island', 'coast'],
  'Hawaii': ['hawaii', 'tropical', 'island', 'pacific', 'wave', 'beach'],
};

/**
 * Find the best matching thumbnail for a track, avoiding already-used thumbnails
 */
function matchThumbnail(
  track: ManifestTrack,
  thumbnails: string[],
  usedThumbnails: Set<string>
): string {
  // Filter out already-used thumbnails
  const availableThumbnails = thumbnails.filter(t => !usedThumbnails.has(t));

  // If all thumbnails are used, reset (shouldn't happen normally)
  const pool =
    availableThumbnails.length > 0 ? availableThumbnails : thumbnails;

  const trackKeywords = extractKeywords(track.filename);
  const categoryName = track.folder.replace(/^\d+\s*-\s*/, '');
  const categoryHints = CATEGORY_HINTS[categoryName] || [];

  // Combine track keywords with category hints
  const allKeywords = [...trackKeywords, ...categoryHints];

  // Score all thumbnails
  const scored: { thumbnail: string; score: number }[] = [];
  for (const thumbnail of pool) {
    const thumbKeywords = extractKeywords(thumbnail);
    const score = calculateMatchScore(allKeywords, thumbKeywords);
    scored.push({ thumbnail, score });
  }

  // Collect all "acceptable" matches (score >= 3)
  const acceptable = scored.filter(s => s.score >= 3);

  // If we have acceptable matches, randomly pick from them (prioritize variety)
  if (acceptable.length > 0) {
    const chosen = acceptable[Math.floor(Math.random() * acceptable.length)];
    return chosen.thumbnail;
  }

  // No acceptable matches - pick randomly from entire pool
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Convert filename to display name
 * "0003 Moderate wind.mp3" -> "Moderate Wind"
 */
function toDisplayName(filename: string): string {
  return filename
    .replace(/^\d+\s+/, '') // Remove leading numbers
    .replace(/\.mp3$/i, '') // Remove extension
    .replace(/V\d+$/i, '') // Remove version suffix
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Encode URL component
 */
function encodeUrl(str: string): string {
  return encodeURIComponent(str);
}

/**
 * Create an Asset from a track and thumbnail
 */
function createAsset(track: ManifestTrack, thumbnailFilename: string): Asset {
  const folderEncoded = encodeUrl(track.folder);
  const filenameEncoded = encodeUrl(track.filename);

  return {
    id: `bunny_${track.id}`,
    displayName: toDisplayName(track.filename),
    type: 'ambient',
    category: track.folder.replace(/^\d+\s*-\s*/, ''), // Remove "001 - " prefix
    audioUrl: `${CDN_BASE}/${folderEncoded}/${filenameEncoded}`,
    imageUrl: `${THUMBNAILS_BASE}/${thumbnailFilename}`,
  };
}

/**
 * Group tracks by folder/category
 */
function groupTracksByCategory(tracks: ManifestTrack[]): Map<string, ManifestTrack[]> {
  const grouped = new Map<string, ManifestTrack[]>();

  for (const track of tracks) {
    const existing = grouped.get(track.folder) || [];
    existing.push(track);
    grouped.set(track.folder, existing);
  }

  return grouped;
}

/**
 * Generate samples by picking one random track from each category
 * and intelligently matching thumbnails (with deduplication)
 */
async function generateRandomSamplesFromCDN(): Promise<Asset[]> {
  const manifest = await fetchManifest();
  const thumbnails = await fetchThumbnails();

  const tracksByCategory = groupTracksByCategory(manifest.tracks);
  const samples: Asset[] = [];
  const usedThumbnails = new Set<string>();

  // Sort categories by folder name to maintain consistent order
  const sortedCategories = Array.from(tracksByCategory.keys()).sort();

  for (const category of sortedCategories) {
    const tracks = tracksByCategory.get(category)!;

    // Pick random track from this category
    const randomTrack = tracks[Math.floor(Math.random() * tracks.length)];

    // Find best matching thumbnail (avoiding duplicates)
    const matchedThumbnail = matchThumbnail(randomTrack, thumbnails, usedThumbnails);
    usedThumbnails.add(matchedThumbnail);

    samples.push(createAsset(randomTrack, matchedThumbnail));
  }

  console.log(`[SampleGenerator] Generated ${samples.length} samples from CDN`);
  return samples;
}

/**
 * Save generated samples to AsyncStorage
 */
export async function saveSamples(samples: Asset[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(samples));
  } catch (error) {
    console.error('Failed to save samples:', error);
  }
}

/**
 * Load saved samples from AsyncStorage
 */
export async function loadSamples(): Promise<Asset[] | null> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as Asset[];
    }
  } catch (error) {
    console.error('Failed to load samples:', error);
  }
  return null;
}

/**
 * Generate new samples and save them
 */
export async function generateAndSave(): Promise<Asset[]> {
  const samples = await generateRandomSamplesFromCDN();
  await saveSamples(samples);
  return samples;
}

/**
 * Load existing samples from storage, or generate from CDN if empty
 */
export async function getOrCreateSamples(): Promise<Asset[]> {
  const saved = await loadSamples();
  if (saved && saved.length > 0) {
    return saved;
  }
  // Storage is empty - generate from CDN
  return await generateAndSave();
}

/**
 * Save starred sample IDs to AsyncStorage
 */
export async function saveStarredIds(ids: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STARRED_KEY, JSON.stringify(ids));
  } catch (error) {
    console.error('Failed to save starred IDs:', error);
  }
}

/**
 * Load starred sample IDs from AsyncStorage
 */
export async function loadStarredIds(): Promise<string[]> {
  try {
    const stored = await AsyncStorage.getItem(STARRED_KEY);
    if (stored) {
      return JSON.parse(stored) as string[];
    }
  } catch (error) {
    console.error('Failed to load starred IDs:', error);
  }
  return [];
}

/**
 * Get the category folder for a given asset
 */
export function getCategoryForAsset(asset: Asset): string | null {
  // Extract category from asset - the category field has the clean name
  // We need to find the full folder name (with number prefix)
  if (!asset.category) return null;

  // The audioUrl contains the full folder name
  // e.g., https://cdn/001%20-%20Nature%20Essentials/file.mp3
  const match = asset.audioUrl.match(/\/(\d{3}%20-%20[^/]+)\//);
  if (match) {
    return decodeURIComponent(match[1]);
  }

  return null;
}

/**
 * Extract thumbnail filename from asset imageUrl
 */
function getThumbnailFromAsset(asset: Asset): string | null {
  // imageUrl format: https://cdn/Thumbnails/filename.jpg
  const match = asset.imageUrl.match(/\/Thumbnails\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Generate new samples, keeping starred assets in place
 */
export async function generateWithStarred(
  currentAssets: Asset[],
  starredIds: string[]
): Promise<Asset[]> {
  const manifest = await fetchManifest();
  const thumbnails = await fetchThumbnails();
  const tracksByCategory = groupTracksByCategory(manifest.tracks);

  // Find which categories are locked (have starred assets)
  const lockedCategories = new Set<string>();
  const starredAssets = new Map<string, Asset>();

  for (const asset of currentAssets) {
    if (starredIds.includes(asset.id)) {
      const category = getCategoryForAsset(asset);
      if (category) {
        lockedCategories.add(category);
        starredAssets.set(category, asset);
      }
    }
  }

  // Pre-populate usedThumbnails with thumbnails from starred assets
  const usedThumbnails = new Set<string>();
  for (const asset of starredAssets.values()) {
    const thumb = getThumbnailFromAsset(asset);
    if (thumb) {
      usedThumbnails.add(thumb);
    }
  }

  // Generate new samples
  const newSamples: Asset[] = [];
  const sortedCategories = Array.from(tracksByCategory.keys()).sort();

  for (const category of sortedCategories) {
    if (lockedCategories.has(category)) {
      // Keep the starred asset
      const starred = starredAssets.get(category);
      if (starred) {
        newSamples.push(starred);
      }
    } else {
      // Generate new random track
      const tracks = tracksByCategory.get(category)!;
      const randomTrack = tracks[Math.floor(Math.random() * tracks.length)];
      const matchedThumbnail = matchThumbnail(randomTrack, thumbnails, usedThumbnails);
      usedThumbnails.add(matchedThumbnail);
      newSamples.push(createAsset(randomTrack, matchedThumbnail));
    }
  }

  return newSamples;
}

/**
 * Generate new samples (preserving starred) and save them
 */
export async function generateAndSaveWithStarred(
  currentAssets: Asset[],
  starredIds: string[]
): Promise<Asset[]> {
  // Clear image cache to ensure fresh downloads
  await assetCacheService.clearCache();
  const samples = await generateWithStarred(currentAssets, starredIds);
  await saveSamples(samples);
  return samples;
}

/**
 * Force refresh CDN data (clear caches)
 */
export async function refreshCDNData(): Promise<void> {
  cachedManifest = null;
  cachedThumbnails = null;
  await AsyncStorage.multiRemove([MANIFEST_CACHE_KEY, THUMBNAILS_CACHE_KEY]);
  console.log('[SampleGenerator] CDN cache cleared');
}
