import { Asset } from '../types';
import { BELL_ASSETS } from '../constants/assets';

export async function getBellAssets(): Promise<Asset[]> {
  return BELL_ASSETS;
}
