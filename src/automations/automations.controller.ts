import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { AutomationsService } from './automations.service';
import { SlackService } from '../slack/slack.service';
import type { NewUserPayload } from '../slack/slack.types';

@Controller('automations')
export class AutomationsController {
  private readonly LOG = new Logger(AutomationsController.name);

  constructor(
    private readonly automationsService: AutomationsService,
    private readonly slackService: SlackService,
  ) {}

  /**
   * Trigger new user automation
   * Called by linkup-api when a user completes onboarding
   *
   * POST /automations/new-user
   * Body: { user: { id, email, name? }, organization: { id, name } }
   */
  @Post('new-user')
  @HttpCode(200)
  async triggerNewUser(@Body() payload: NewUserPayload): Promise<{ ok: boolean }> {
    this.LOG.log(
      `Received new user trigger for org: ${payload.organization?.name}`,
    );

    // Fire and forget - don't block the response
    setImmediate(() => {
      this.automationsService.triggerNewUser(payload).catch((e) => {
        this.LOG.error(`Error processing new user automation: ${e.message}`);
      });
    });

    return { ok: true };
  }

  /**
   * Test the full message flow without needing Slack webhooks.
   * Creates a channel, sends welcome + Phil's messages with threading.
   *
   * POST /automations/test-flow
   * Body: { orgName: string, fakeExternalUserId: string }
   */
  @Post('test-flow')
  @HttpCode(200)
  async testFlow(
    @Body() body: { orgName: string; fakeExternalUserId: string },
  ): Promise<{ ok: boolean; channelId: string }> {
    this.LOG.log(`[TEST] Starting test flow for org: ${body.orgName}`);
    const result = await this.slackService.testFlow(
      body.orgName,
      body.fakeExternalUserId,
    );
    return { ok: true, channelId: result.channelId };
  }
}
