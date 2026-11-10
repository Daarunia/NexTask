/**
 * Adresse d'un serveur NexTask saisie par l'utilisateur : normalisation et
 * transport. Partagé entre le main (qui enregistre la connexion) et le
 * renderer (qui avertit d'une connexion non chiffrée).
 */

/**
 * Adresse normalisée d'un serveur : espaces et barres finales retirés, seule
 * l'origine et le chemin sont gardés.
 *
 * @param input Adresse saisie
 * @returns L'adresse, ou `null` si elle n'est ni en http ni en https
 */
export function normalizeServerUrl(input: string): string | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '')
}

/**
 * Vrai pour un nom d'hôte de la machine ou du réseau local : localhost, adresses
 * de bouclage et privées (IPv4 10/8, 172.16/12, 192.168/16, IPv6 fc00::/7), noms
 * en `.local` ou `.lan`.
 *
 * @param hostname Nom d'hôte d'une URL (IPv6 entre crochets)
 */
export function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.lan')) {
    return true
  }
  if (host === '::1' || /^f[cd][0-9a-f]{2}:/.test(host)) return true

  const octets = host.split('.').map(Number)
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false
  }
  const [a, b] = octets
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

/**
 * Vrai si le jeton partirait en clair sur un réseau qui n'est pas local :
 * adresse en http hors de la machine et du réseau local.
 *
 * @param url Adresse normalisée (cf. normalizeServerUrl)
 */
export function isInsecureServerUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' && !isLocalHostname(parsed.hostname)
  } catch {
    return false
  }
}
