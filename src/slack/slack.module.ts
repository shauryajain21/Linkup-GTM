import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebClient } from '@slack/web-api';
import { LinkupApiModule } from '../linkup-api/linkup-api.module';
import { LinkupApiClient } from '../linkup-api/linkup-api.client';
import { SlackService, InternalUserConfig } from './slack.service';
import { SlackEventsController } from './slack-events.controller';

@Module({
  imports: [LinkupApiModule],
  controllers: [SlackEventsController],
  providers: [
    {
      provide: SlackService,
      useFactory: (
        configService: ConfigService,
        linkupApiClient: LinkupApiClient,
      ) => {
        const philConfig: InternalUserConfig = {
          userId: configService.get('SLACK_PHIL_USER_ID') ?? '',
          token: configService.get('SLACK_PHIL_TOKEN') ?? '',
          message: configService.get('SLACK_PHIL_MESSAGE') ?? '',
        };

        const sashaConfig: InternalUserConfig = {
          userId: configService.get('SLACK_SASHA_USER_ID') ?? '',
          token: configService.get('SLACK_SASHA_TOKEN') ?? '',
          message: configService.get('SLACK_SASHA_MESSAGE') ?? '',
        };

        const borisConfig: InternalUserConfig = {
          userId: configService.get('SLACK_BORIS_USER_ID') ?? '',
          token: configService.get('SLACK_BORIS_TOKEN') ?? '',
          message: configService.get('SLACK_BORIS_MESSAGE') ?? '',
        };

        return new SlackService(
          configService
            .getOrThrow<string>('SLACK_USERS_CONNECT_BANNED_DOMAINS')
            .split(',')
            .map((d) => d.trim())
            .filter(Boolean),
          linkupApiClient,
          new WebClient(
            configService.getOrThrow('SLACK_USERS_CONNECT_BOT_TOKEN'),
          ),
          philConfig,
          sashaConfig,
          borisConfig,
        );
      },
      inject: [ConfigService, LinkupApiClient],
    },
  ],
  exports: [SlackService],
})
export class SlackModule {}
