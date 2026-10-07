import { Module } from '@nestjs/common';
import { FinancialModelModule } from '../financial-model/financial-model.module';
import { ServiceRequestsModule } from '../service-requests/service-requests.module';
import { UsersModule } from '../users/users.module';
import { FeasibilityProjectsController } from './feasibility-projects.controller';
import { FeasibilityProjectsService } from './feasibility-projects.service';
import { ProjectContractController } from './project-contract.controller';
import { ProjectContractService } from './project-contract.service';
import { ProjectDocumentsController } from './project-documents.controller';
import { ProjectDocumentsService } from './project-documents.service';
import { ProjectQuestionnaireController } from './project-questionnaire.controller';
import { ProjectQuestionnaireService } from './project-questionnaire.service';
import { ProjectReportController } from './project-report.controller';
import { ProjectReportService } from './project-report.service';
import { ProjectReviewController } from './project-review.controller';
import { ProjectReviewService } from './project-review.service';
import { ProjectWorkspaceController } from './project-workspace.controller';
import { ProjectWorkspaceService } from './project-workspace.service';
import { QuestionnaireReader } from './questionnaire-reader';
import { QuestionnaireTemplatesController } from './questionnaire-templates.controller';
import { QuestionnaireTemplatesService } from './questionnaire-templates.service';
import { ReportTemplatesController } from './report-templates.controller';
import { ReportTemplatesService } from './report-templates.service';

/**
 * Feasibility platform (EPIC-35, ADR-0010): the project, its status history and its experts
 * (ST-35.01), and the questionnaires: templates with versions, and the questionnaire of a project
 * with its answers and its own items (ST-35.03), the documents of a project (ST-35.06), the
 * cost estimate the applicant accepts or declines (ST-35.08) and the signed contract the staff
 * confirm to start the work (ST-35.09), and the workspace of the staff and the experts: the
 * financial model of the study and their internal notes (ST-35.10), and the comments of the review
 * of a study, in threads on its parts (ST-35.11), and the report of the study: templates of its
 * chapters, the draft the experts write and the versions it is issued in (ST-35.12). The PDF and
 * the approvals of a version join in later stories.
 */
@Module({
  imports: [UsersModule, ServiceRequestsModule, FinancialModelModule],
  controllers: [
    FeasibilityProjectsController,
    ProjectContractController,
    ProjectDocumentsController,
    ProjectQuestionnaireController,
    ProjectReportController,
    ProjectReviewController,
    ProjectWorkspaceController,
    QuestionnaireTemplatesController,
    ReportTemplatesController,
  ],
  providers: [
    FeasibilityProjectsService,
    ProjectContractService,
    ProjectDocumentsService,
    ProjectQuestionnaireService,
    ProjectReportService,
    ProjectReviewService,
    ProjectWorkspaceService,
    QuestionnaireReader,
    QuestionnaireTemplatesService,
    ReportTemplatesService,
  ],
  exports: [FeasibilityProjectsService],
})
export class FeasibilityModule {}
