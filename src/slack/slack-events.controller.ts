import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { SlackService } from './slack.service';
import type { SlackEventPayload } from './slack.types';

@Controller('slack/events')
export class SlackEventsController {
  private readonly LOG = new Logger(SlackEventsController.name);

  constructor(private readonly slackService: SlackService) {}

  @Post()
  @HttpCode(200)
  async handleEvent(@Body() payload: SlackEventPayload): Promise<unknown> {
    // Handle URL verification challenge from Slack
    if (payload.type === 'url_verification') {
      return { challenge: payload.challenge };
    }

    // Handle event callbacks
    if (payload.type === 'event_callback' && payload.event) {
      const { type, user, channel } = payload.event;

      if (type === 'member_joined_channel') {
        // Process asynchronously to avoid blocking the response
        setImmediate(() => {
          this.slackService
            .handleExternalUserJoined(channel, user)
            .catch((e) =>
              this.LOG.error(
                `Error handling external user joined event: ${e.message}`,
              ),
            );
        });
      }
    }

    return { ok: true };
  }
}
