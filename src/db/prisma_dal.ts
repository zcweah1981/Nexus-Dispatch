import { PrismaClient, Prisma } from '@prisma/client';

export class PrismaDAL {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL || 'file:../../../data/nexus.db',
        },
      },
    });
  }

  // WAL and Foreign Keys are handled by Prisma internally via queries if needed, 
  // but usually Prisma handles foreign keys by default for sqlite.
  async initPragmas() {
     await this.prisma.$queryRaw`PRAGMA journal_mode = WAL;`;
     await this.prisma.$queryRaw`PRAGMA foreign_keys = ON;`;
  }

  async createTask(data: Prisma.TaskUncheckedCreateInput) {
    return await this.prisma.task.create({ data });
  }

  async updateTaskStatus(id: string, status: string) {
    return await this.prisma.task.update({
      where: { id },
      data: { status }
    });
  }

  async createRun(data: Prisma.RunUncheckedCreateInput) {
     return await this.prisma.run.create({ data });
  }

  async updateRunStatus(run_id: string, status: string, error_stack?: string) {
     return await this.prisma.run.update({
       where: { run_id },
       data: {
          status,
          error_stack,
          ended_at: new Date()
       }
     });
  }

  // For testing
  async _createProjectAndWorker(project_id: string, agent_id: string) {
      await this.prisma.project.upsert({
         where: { id: project_id },
         update: {},
         create: {
             id: project_id,
             name: 'Test Project ' + project_id
         }
      });
      await this.prisma.agent.upsert({
         where: { id: agent_id },
         update: {},
         create: {
            id: agent_id,
            agent_id: agent_id,
            lane: 'DEV',
            endpoint: 'http://localhost:9000/webhook',
            dialect: 'hermes',
            soul_prompt: 'Test soul prompt',
            tools_allowed: '[]'
         }
      });
  }

  async close() {
     await this.prisma.$disconnect();
  }
}
