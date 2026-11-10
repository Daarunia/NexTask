import type { Locator, Page } from '@playwright/test'

/**
 * Écran de connexion de NexTask Client (components/server/ServerConnect.vue) et
 * bandeau « serveur injoignable » (components/server/ServerBanner.vue).
 */
export class ServerConnect {
  readonly root: Locator
  readonly url: Locator
  readonly token: Locator
  readonly submit: Locator
  readonly retry: Locator
  readonly status: Locator
  readonly insecure: Locator
  readonly banner: Locator
  readonly bannerRetry: Locator

  constructor(readonly page: Page) {
    this.root = page.getByTestId('server-connect')
    this.url = page.getByTestId('server-connect-url')
    this.token = page.getByTestId('server-connect-token')
    this.submit = page.getByTestId('server-connect-submit')
    this.retry = page.getByTestId('server-connect-retry')
    this.status = page.getByTestId('server-connect-status')
    this.insecure = page.getByTestId('server-connect-insecure')
    this.banner = page.getByTestId('server-banner')
    this.bannerRetry = page.getByTestId('server-banner-retry')
  }

  /**
   * Saisit un serveur et un jeton, puis valide.
   * @param url Adresse du serveur
   * @param token Jeton
   */
  async connect(url: string, token: string): Promise<void> {
    await this.url.fill(url)
    await this.token.fill(token)
    await this.submit.click()
  }
}
