import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface OrganizationResponse {
  count: number;
}

@Injectable()
export class LinkupApiClient {
  private readonly LOG = new Logger(LinkupApiClient.name);
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('LINKUP_API_URL') || '';
  }

  /**
   * Check if organizations with the given name exist in linkup-api
   * Returns count of organizations with that name
   *
   * Note: Until the linkup-api endpoint is implemented, this will return 0
   * (treating all organizations as "new")
   */
  async findOrganizationsByName(name: string): Promise<OrganizationResponse> {
    if (!this.baseUrl) {
      this.LOG.warn('LINKUP_API_URL not configured, skipping duplicate check');
      return { count: 0 };
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/organizations/by-name/${encodeURIComponent(name)}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        },
      );

      if (!response.ok) {
        // If endpoint doesn't exist yet (404) or other error, treat as "no duplicates"
        this.LOG.warn(
          `Failed to check organization duplicates: ${response.status} ${response.statusText}`,
        );
        return { count: 0 };
      }

      return await response.json();
    } catch (error) {
      // Network error or linkup-api not running - treat as "no duplicates"
      this.LOG.warn(`Error checking organization duplicates: ${error.message}`);
      return { count: 0 };
    }
  }
}
