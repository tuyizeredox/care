import { Global, Module } from '@nestjs/common';
import { AccessControlService } from './services/access-control.service';

/** Cross-cutting providers available to every feature module. */
@Global()
@Module({
  providers: [AccessControlService],
  exports: [AccessControlService],
})
export class CommonModule {}
