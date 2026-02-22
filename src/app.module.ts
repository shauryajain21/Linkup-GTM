import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AutomationsModule } from './automations/automations.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    AutomationsModule,
    DashboardModule,
  ],
})
export class AppModule {}
