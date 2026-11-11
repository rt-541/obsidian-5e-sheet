/** The compendium root every vault uses (also the code default). */
export const COMPENDIUM_ROOT = "compendium/5e";

/**
 * Self-healing for the compendium folder setting: when the configured folder does not exist in the vault but
 * `compendium/5e` does, the library moved and the setting is stale. Returns the folder to switch to, else undefined.
 * It never fires while the configured folder exists, and it only ever points at the root itself, never at a
 * generated library folder below it (WotC and friends).
 */
export async function healCompendiumFolder(configured: string, folderExists: (path: string) => boolean | Promise<boolean>): Promise<string | undefined> {
  const cur = configured.trim().replace(/^\/+|\/+$/g, "");
  if (cur === COMPENDIUM_ROOT) return undefined;
  if (cur && await folderExists(cur)) return undefined;
  return await folderExists(COMPENDIUM_ROOT) ? COMPENDIUM_ROOT : undefined;
}
