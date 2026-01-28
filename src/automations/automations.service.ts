import { Injectable, Logger } from '@nestjs/common';
import { SlackService } from '../slack/slack.service';
import { NewUserPayload } from '../slack/slack.types';

@Injectable()
export class AutomationsService {
  private readonly LOG = new Logger(AutomationsService.name);

  constructor(private readonly slackService: SlackService) {}

  /**
   * Triggered when a new user completes onboarding
   * Creates a Slack support channel for the organization
   */
  async triggerNewUser(payload: NewUserPayload): Promise<void> {
    this.LOG.log(
      `Triggering new user automation for org: ${payload.organization.name}`,
    );

    try {
      await this.slackService.createSupportChannel(payload);
      this.LOG.log(
        `Successfully processed new user automation for org: ${payload.organization.name}`,
      );
    } catch (error) {
      this.LOG.error(
        `Error in new user automation for org ${payload.organization.name}: ${error.message}`,
      );
      throw error;
    }
  }
}
