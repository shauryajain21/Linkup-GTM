import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { AutomationsService } from './automations.service';
import type { NewUserPayload } from '../slack/slack.types';

@Controller('automations')
export class AutomationsController {
  private readonly LOG = new Logger(AutomationsController.name);

  constructor(private readonly automationsService: AutomationsService) {}

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
}
