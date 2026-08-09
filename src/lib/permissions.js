import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Tiny native bridge (registered in MainActivity) that opens this app's
 * Android Settings page — used after a permission was denied so the user can
 * re-grant it. On web this is a no-op.
 */
const AppSettings = registerPlugin('AppSettings', {
  web: () => ({ open: async () => {} }),
});

/**
 * Native bridge for media (photos & videos) and file access permissions.
 * Registered in MainActivity as MediaPermissionsPlugin. On web all of these
 * resolve as granted (browsers handle picking through their own UIs).
 */
const MediaPermissions = registerPlugin('MediaPermissions', {
  web: () => ({
    check: async () => ({ photos: 'granted', files: 'granted' }),
    requestPhotos: async () => ({ status: 'granted' }),
    requestFiles: async () => ({ status: 'granted' }),
  }),
});

export async function openAppSettings() {
  try {
    await AppSettings.open();
    return true;
  } catch (e) {
    console.warn('Could not open app settings', e);
    return false;
  }
}

/* ---------------- Photos & videos ---------------- */

/** 'granted' | 'prompt' | 'denied' (never throws). */
export async function checkMediaPermission() {
  if (!Capacitor.isNativePlatform()) return 'granted';
  try {
    const s = await MediaPermissions.check();
    return s.photos || 'prompt';
  } catch (e) {
    return 'prompt';
  }
}

/** Show the native dialog; returns 'granted' | 'denied'. */
export async function requestMediaPermission() {
  if (!Capacitor.isNativePlatform()) return 'granted';
  try {
    const r = await MediaPermissions.requestPhotos();
    return r.status === 'granted' ? 'granted' : 'denied';
  } catch (e) {
    return 'denied';
  }
}

/** Ask for photos & videos access; returns 'granted' or 'denied'. */
export async function requireMediaPermission() {
  const status = await checkMediaPermission();
  if (status === 'granted') return 'granted';
  return requestMediaPermission();
}

/* ---------------- Files & media ---------------- */

/**
 * 'granted' | 'prompt' | 'denied' | 'system'.
 * 'system' means the device (Android 13+) manages file access through the
 * system document picker — there is no blanket permission to grant.
 */
export async function checkFilesPermission() {
  if (!Capacitor.isNativePlatform()) return 'granted';
  try {
    const s = await MediaPermissions.check();
    return s.files || 'granted';
  } catch (e) {
    return 'granted';
  }
}

/**
 * Show the native dialog (older Android). On Android 13+ resolves with
 * 'system' — file access is already handled by the system picker.
 * Returns 'granted' | 'denied' | 'system'.
 */
export async function requestFilesPermission() {
  if (!Capacitor.isNativePlatform()) return 'granted';
  try {
    const r = await MediaPermissions.requestFiles();
    return r.status === 'granted' ? 'granted' : r.status || 'denied';
  } catch (e) {
    return 'denied';
  }
}

/** Ask for file access; returns 'granted' or 'denied' ('system' counts as granted). */
export async function requireFilesPermission() {
  const status = await checkFilesPermission();
  if (status === 'granted' || status === 'system') return 'granted';
  const res = await requestFilesPermission();
  return res === 'granted' || res === 'system' ? 'granted' : 'denied';
}
