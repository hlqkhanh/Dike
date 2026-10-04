import { Module, type DynamicModule } from '@nestjs/common';
import type { Connection } from 'mongoose';
import { WorkflowStore } from '@dike/workflows';
import type { StoragePort } from '@dike/storage';
import { MONGO_CONNECTION } from '../common/tokens.js';
import { FILE_STORAGE } from '../files/storage.module.js';
import { AuthCoreModule } from '../auth/auth-core.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { WorkflowAccess } from './workflow-access.service.js';
import { VerificationController } from '../verification/verification.controller.js';
import { VehiclesController } from '../vehicles/vehicles.controller.js';
import { CommunitiesController } from '../communities/communities.controller.js';
import { AdminController } from '../admin/admin.controller.js';
@Module({})
export class WorkflowsModule {
  static register(enabled: boolean): DynamicModule {
    return {
      module: WorkflowsModule,
      imports: [AuthCoreModule.register(enabled), AuthorizationModule.register(enabled)],
      controllers: [
        VerificationController,
        VehiclesController,
        CommunitiesController,
        AdminController,
      ],
      providers: [
        WorkflowAccess,
        ...(enabled
          ? [
              {
                provide: WorkflowStore,
                inject: [MONGO_CONNECTION, FILE_STORAGE],
                useFactory: (mongo: Connection, storage: StoragePort) =>
                  new WorkflowStore(mongo, storage),
              },
            ]
          : []),
      ],
    };
  }
}
