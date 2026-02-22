import { Module } from '@nestjs/common';
import { SlackModule } from '../slack/slack.module';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [SlackModule],
  controllers: [DashboardController],
})
export class DashboardModule {}
