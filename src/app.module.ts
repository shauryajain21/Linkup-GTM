import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AutomationsModule } from './automations/automations.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    AutomationsModule,
  ],
})
export class AppModule {}
