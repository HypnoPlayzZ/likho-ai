// On startup, ask the deployed latest.json whether a newer signed release
// exists. If yes, download it in the background, install, and let the
// installer relaunch the app. Tauri verifies the signature against the
// pubkey baked into tauri.conf.json — an attacker who controls the GitHub
// release URL still can't ship a malicious update without the private key.
//
// Failures (no network, GitHub down, malformed manifest) are swallowed so
// they never block app startup. The user can still write rewrites; they
// just won't get the patch this session.

import { check } from "@tauri-apps/plugin-updater";

export async function runUpdateCheck(): Promise<void> {
  try {
    const update = await check();
    if (!update) return;

    console.log(
      `[updater] new version available: ${update.version} (current: ${update.currentVersion})`,
    );

    // On Windows, the bundled installer will close the running app and
    // restart it after install, so we don't need to call relaunch() here.
    await update.downloadAndInstall();
  } catch (err) {
    console.warn("[updater] check failed (non-fatal):", err);
  }
}
