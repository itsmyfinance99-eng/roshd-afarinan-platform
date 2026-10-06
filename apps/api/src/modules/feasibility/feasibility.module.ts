import { Module } from '@nestjs/common';
import { ServiceRequestsModule } from '../service-requests/service-requests.module';
import { UsersModule } from '../users/users.module';
import { FeasibilityProjectsController } from './feasibility-projects.controller';
import { FeasibilityProjectsService } from './feasibility-projects.service';
import { ProjectQuestionnaireController } from './project-questionnaire.controller';
import { ProjectQuestionnaireService } from './project-questionnaire.service';
import { QuestionnaireReader } from './questionnaire-reader';
import { QuestionnaireTemplatesController } from './questionnaire-templates.controller';
import { QuestionnaireTemplatesService } from './questionnaire-templates.service';

/**
 * Feasibility platform (EPIC-35, ADR-0010): the project, its status history and its experts
 * (ST-35.01), and the questionnaires: templates with versions, and the questionnaire of a project
 * with its answers and its own items (ST-35.03). Documents, estimates and deliverables join in
 * later stories.
 */
@Module({
  imports: [UsersModule, ServiceRequestsModule],
  controllers: [
    FeasibilityProjectsController,
    ProjectQuestionnaireController,
    QuestionnaireTemplatesController,
  ],
  providers: [
    FeasibilityProjectsService,
    ProjectQuestionnaireService,
    QuestionnaireReader,
    QuestionnaireTemplatesService,
  ],
  exports: [FeasibilityProjectsService],
})
export class FeasibilityModule {}
