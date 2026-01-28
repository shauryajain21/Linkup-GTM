import { Module } from '@nestjs/common';
import { LinkupApiClient } from './linkup-api.client';

@Module({
  providers: [LinkupApiClient],
  exports: [LinkupApiClient],
})
export class LinkupApiModule {}
