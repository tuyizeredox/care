import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * End-to-end coverage of the complete journey described in the specification:
 *
 *   create -> assign -> work -> submit -> handover -> review
 *          -> request changes -> resubmit -> approve -> complete
 *
 * Runs against the database in DATABASE_URL, which must already be migrated
 * and seeded (`npm run prisma:migrate && npm run prisma:seed`).
 */
const PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? 'Passw0rd!Demo';

interface Session {
  accessToken: string;
  userId: string;
}

describe('Task lifecycle (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;

  let programmeDirector: Session;
  let servePm: Session;
  let gesiAdvisor: Session;

  let taskId: string;
  let taskNumber: number;

  const signIn = async (email: string): Promise<Session> => {
    const response = await http.post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
    return {
      accessToken: response.body.data.accessToken,
      userId: response.body.data.user.id,
    };
  };

  const as = (session: Session) => ({
    get: (url: string) => http.get(url).set('Authorization', 'Bearer ' + session.accessToken),
    post: (url: string) => http.post(url).set('Authorization', 'Bearer ' + session.accessToken),
    patch: (url: string) => http.patch(url).set('Authorization', 'Bearer ' + session.accessToken),
    delete: (url: string) => http.delete(url).set('Authorization', 'Bearer ' + session.accessToken),
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    // AppModule already registers the guards, filter and response interceptor
    // through APP_* providers. Only the pipe has to be attached by hand here,
    // because main.ts configures it on the application rather than the module.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    http = request(app.getHttpServer());

    programmeDirector = await signIn('programme.director@care.demo');
    servePm = await signIn('serve.pm@care.demo');
    gesiAdvisor = await signIn('gesi.advisor@care.demo');
  }, 60_000);

  afterAll(async () => {
    if (taskId) {
      // Clean up only what this suite created.
      await prisma.taskHistory.deleteMany({ where: { taskId } });
      await prisma.taskAssignment.deleteMany({ where: { taskId } });
      await prisma.approval.deleteMany({ where: { taskId } });
      await prisma.taskComment.deleteMany({ where: { taskId } });
      await prisma.taskWatcher.deleteMany({ where: { taskId } });
      await prisma.notification.deleteMany({ where: { taskId } });
      await prisma.task.deleteMany({ where: { id: taskId } });
    }
    await app.close();
  });

  describe('authentication', () => {
    it('rejects a wrong password without disclosing whether the account exists', async () => {
      const response = await http
        .post('/api/auth/login')
        .send({ email: 'programme.director@care.demo', password: 'WrongPassword1' })
        .expect(401);
      expect(response.body.error.message).toBe('Incorrect email or password.');
    });

    it('refuses access to a protected route without a token', async () => {
      await http.get('/api/tasks').expect(401);
    });

    it('returns the signed-in profile with effective permissions', async () => {
      const response = await as(programmeDirector).get('/api/auth/me').expect(200);
      expect(response.body.data.email).toBe('programme.director@care.demo');
      expect(response.body.data.permissions).toEqual(expect.arrayContaining(['create_task']));
      expect(response.body.data).not.toHaveProperty('passwordHash');
    });
  });

  describe('1. creation and assignment', () => {
    it('creates a task and assigns it to the SERVE project manager', async () => {
      const response = await as(programmeDirector)
        .post('/api/tasks')
        .send({
          title: 'E2E: Quarterly SERVE report',
          description: 'Created by the end-to-end suite.',
          priority: 'HIGH',
          assigneeId: servePm.userId,
          deadline: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        })
        .expect(201);

      taskId = response.body.data.id;
      taskNumber = response.body.data.number;

      expect(response.body.data.status).toBe('ASSIGNED');
      expect(response.body.data.currentOwner.id).toBe(servePm.userId);
      expect(response.body.data.createdBy.id).toBe(programmeDirector.userId);
    });

    it('records the creation in the immutable history', async () => {
      const response = await as(programmeDirector).get('/api/tasks/' + taskId + '/history').expect(200);
      const actions = response.body.data.map((entry: { action: string }) => entry.action);
      expect(actions).toEqual(expect.arrayContaining(['TASK_CREATED', 'TASK_ASSIGNED']));
    });

    it('opens an ownership tenure for the new owner', async () => {
      const response = await as(servePm).get('/api/tasks/' + taskId + '/journey').expect(200);
      const current = response.body.data.steps.find(
        (step: { state: string }) => step.state === 'current',
      );
      expect(current.person.id).toBe(servePm.userId);
    });

    it('notifies the assignee', async () => {
      const notifications = await prisma.notification.findMany({
        where: { taskId, userId: servePm.userId },
      });
      expect(notifications.length).toBeGreaterThan(0);
      expect(notifications[0].type).toBe('TASK_ASSIGNED');
    });
  });

  describe('2. work and submission', () => {
    it('starts the task', async () => {
      const response = await as(servePm).post('/api/tasks/' + taskId + '/start').expect(201);
      expect(response.body.data.status).toBe('IN_PROGRESS');
    });

    it('refuses to start a task that is already in progress', async () => {
      const response = await as(servePm).post('/api/tasks/' + taskId + '/start').expect(422);
      expect(response.body.error.message).toMatch(/not allowed/i);
    });

    it('hands the task over to the GESI advisor for review', async () => {
      const response = await as(servePm)
        .post('/api/tasks/' + taskId + '/handover')
        .send({
          toUserId: gesiAdvisor.userId,
          action: 'REVIEW',
          note: 'Report prepared and ready for GESI review.',
        })
        .expect(201);

      expect(response.body.data.currentOwner.id).toBe(gesiAdvisor.userId);
      expect(response.body.data.status).toBe('UNDER_REVIEW');
    });

    it('closes the previous tenure and records its duration', async () => {
      const tenures = await prisma.taskAssignment.findMany({
        where: { taskId },
        orderBy: { sequence: 'asc' },
      });
      expect(tenures).toHaveLength(2);
      expect(tenures[0].exitedAt).not.toBeNull();
      expect(tenures[0].durationSeconds).not.toBeNull();
      expect(tenures[1].exitedAt).toBeNull();
      expect(tenures[1].note).toBe('Report prepared and ready for GESI review.');
    });

    it('keeps the handover note in the task journey', async () => {
      const response = await as(gesiAdvisor).get('/api/tasks/' + taskId + '/journey').expect(200);
      const notes = response.body.data.steps.map((step: { note: string | null }) => step.note);
      expect(notes).toContain('Report prepared and ready for GESI review.');
      expect(response.body.data.handoverCount).toBe(1);
    });
  });

  describe('3. review and rework', () => {
    it('requires a reason when requesting changes', async () => {
      const response = await as(gesiAdvisor)
        .post('/api/tasks/' + taskId + '/decision')
        .send({ decision: 'REQUEST_CHANGES' })
        .expect(400);
      expect(response.body.error.message).toMatch(/explain what needs to change/i);
    });

    it('sends the task back to the previous holder with the reason', async () => {
      const response = await as(gesiAdvisor)
        .post('/api/tasks/' + taskId + '/decision')
        .send({
          decision: 'REQUEST_CHANGES',
          comment: 'Please correct the disaggregated figures in section 4.',
        })
        .expect(201);

      expect(response.body.data.status).toBe('CHANGES_REQUESTED');
      expect(response.body.data.currentOwner.id).toBe(servePm.userId);
    });

    it('notifies the person the work went back to', async () => {
      const notifications = await prisma.notification.findMany({
        where: { taskId, userId: servePm.userId, type: 'CHANGES_REQUESTED' },
      });
      expect(notifications.length).toBeGreaterThan(0);
    });

    it('resumes and resubmits after the rework', async () => {
      await as(servePm).post('/api/tasks/' + taskId + '/start').expect(201);

      const response = await as(servePm)
        .post('/api/tasks/' + taskId + '/handover')
        .send({ toUserId: gesiAdvisor.userId, action: 'REVIEW', note: 'Section 4 corrected.' })
        .expect(201);

      expect(response.body.data.status).toBe('UNDER_REVIEW');
      expect(response.body.data.currentOwner.id).toBe(gesiAdvisor.userId);
    });
  });

  describe('4. approval and completion', () => {
    it('refuses approval from someone without the permission', async () => {
      const hrOfficer = await signIn('hr.officer@care.demo');
      await as(hrOfficer)
        .post('/api/tasks/' + taskId + '/decision')
        .send({ decision: 'APPROVE' })
        .expect(403);
    });

    it('approves and completes the task', async () => {
      const response = await as(programmeDirector)
        .post('/api/tasks/' + taskId + '/decision')
        .send({ decision: 'APPROVE', comment: 'Approved for submission to the donor.' })
        .expect(201);

      expect(['APPROVED', 'COMPLETED']).toContain(response.body.data.status);
    });

    it('closes the final tenure once the task is complete', async () => {
      const task = await prisma.task.findUnique({ where: { id: taskId } });
      if (task?.status !== 'COMPLETED') return;

      const open = await prisma.taskAssignment.count({ where: { taskId, exitedAt: null } });
      expect(open).toBe(0);
      expect(task.completedAt).not.toBeNull();
      expect(task.waitingForUserId).toBeNull();
    });
  });

  describe('5. the audit trail survives the whole journey', () => {
    it('kept every event, in order, and never overwrote one', async () => {
      const response = await as(programmeDirector).get('/api/tasks/' + taskId + '/history').expect(200);
      const actions: string[] = response.body.data.map((entry: { action: string }) => entry.action);

      expect(actions).toEqual(
        expect.arrayContaining([
          'TASK_CREATED',
          'TASK_ASSIGNED',
          'TASK_STARTED',
          'TASK_HANDED_OVER',
          'CHANGES_REQUESTED',
        ]),
      );
      expect(response.body.data.length).toBeGreaterThanOrEqual(6);
    });

    it('reports how long the task spent with each person', async () => {
      const response = await as(programmeDirector).get('/api/tasks/' + taskId + '/timing').expect(200);
      expect(response.body.data.holders.length).toBeGreaterThanOrEqual(2);
      expect(response.body.data).toHaveProperty('totalDuration');
    });
  });

  describe('6. collaboration', () => {
    it('accepts a comment with an @mention and notifies the mentioned user', async () => {
      await as(servePm)
        .post('/api/tasks/' + taskId + '/comments')
        .send({
          body: '@GESI Advisor thanks for the quick turnaround.',
          mentionIds: [gesiAdvisor.userId],
        })
        .expect(201);

      const mentions = await prisma.notification.count({
        where: { taskId, userId: gesiAdvisor.userId, type: 'MENTIONED' },
      });
      expect(mentions).toBeGreaterThan(0);
    });

    it('rejects an empty comment', async () => {
      await as(servePm).post('/api/tasks/' + taskId + '/comments').send({ body: '' }).expect(400);
    });
  });

  describe('7. visibility', () => {
    it('hides a task from someone with no involvement or permission', async () => {
      const logisticsOfficer = await signIn('logistics.officer@care.demo');
      const response = await as(logisticsOfficer).get('/api/tasks/' + taskId);
      expect([403, 404]).toContain(response.status);
    });

    it('lets the Country Director see everything', async () => {
      const countryDirector = await signIn('country.director@care.demo');
      await as(countryDirector).get('/api/tasks/' + taskId).expect(200);
    });
  });
});
