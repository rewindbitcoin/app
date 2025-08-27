// camera-compat.ts
// Replacement for the removed Camera.getAvailableCameraTypesAsync()
// Works with Expo SDK 52/53 and newer "CameraView" API.

import { Platform } from 'react-native';

export type CameraFacing = 'front' | 'back';

type Options = {
  /**
   * Whether to request permission on web to populate device labels.
   * Without this, device labels often come back empty until the user
   * grants camera access. Requesting permission improves detection accuracy,
   * but it will trigger a browser permission prompt.
   */
  requestPermissionIfNeeded?: boolean;
};

/**
 * Get available camera facings in a way that mimics the old legacy API:
 * - On iOS/Android: always returns ['front', 'back'] (hardcoded, same as legacy).
 * - On Web: inspects mediaDevices.enumerateDevices() and tries to detect
 *   whether front and/or back cameras are available.
 */
export async function getAvailableCameraTypesAsync(
  opts: Options = { requestPermissionIfNeeded: true }
): Promise<CameraFacing[]> {
  if (Platform.OS !== 'web') {
    // Legacy API on native platforms always returned both facings.
    return ['front', 'back'];
  }

  const md = navigator.mediaDevices;
  if (!md?.enumerateDevices) {
    // Very old browsers without enumerateDevices support.
    return ['front'];
  }

  // On many browsers, labels are empty until permission is granted.
  if (opts.requestPermissionIfNeeded && md.getUserMedia) {
    try {
      const stream = await md.getUserMedia({ video: true });
      // Stop the stream immediately to avoid leaving the camera on.
      stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
    } catch {
      // If the user denies permission, continue with whatever info we can get.
    }
  }

  const devices = await md.enumerateDevices();
  const videos = devices.filter(
    (d: MediaDeviceInfo) => d.kind === 'videoinput'
  );

  // Heuristic checks to guess if a camera is front or back facing.
  const isFrontLabel = (s: string) => /front|user|selfie|face\s*time/i.test(s);
  const isBackLabel = (s: string) => /back|rear|environment|world/i.test(s);

  let hasFront = false;
  let hasBack = false;

  for (const d of videos) {
    const label = (d.label || '').toLowerCase();
    if (isFrontLabel(label)) hasFront = true;
    if (isBackLabel(label)) hasBack = true;
  }

  // If only one camera is reported and we couldn’t classify it, assume it's front.
  if (videos.length === 1 && !hasFront && !hasBack) {
    hasFront = true;
  }

  const result: CameraFacing[] = [];
  if (hasFront) result.push('front');
  if (hasBack) result.push('back');

  // Fallback: at least return 'front'.
  return result.length ? Array.from(new Set(result)) : ['front'];
}
