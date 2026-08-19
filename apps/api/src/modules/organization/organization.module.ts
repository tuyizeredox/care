import { Module } from '@nestjs/common';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  controllers: [OrganizationController, RolesController],
  providers: [OrganizationService, RolesService],
  exports: [OrganizationService, RolesService],
})
export class OrganizationModule {}
