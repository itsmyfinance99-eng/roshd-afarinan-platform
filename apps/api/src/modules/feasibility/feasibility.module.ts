import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { FeasibilityProjectsController } from './feasibility-projects.controller';
import { FeasibilityProjectsService } from './feasibility-projects.service';

/**
 * Feasibility platform (EPIC-35, ADR-0010): the project, its status history and its experts
 * (ST-35.01). Questionnaires, documents, estimates and deliverables join in later stories.
 */
@Module({
  imports: [UsersModule],
  controllers: [FeasibilityProjectsController],
  providers: [FeasibilityProjectsService],
  exports: [FeasibilityProjectsService],
})
export class FeasibilityModule {}
