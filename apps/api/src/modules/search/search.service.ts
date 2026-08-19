import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccessControlService } from '../../common/services/access-control.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user';
import { USER_SUMMARY_SELECT } from '../users/user.select';

export interface SearchHit {
  type: 'task' | 'project' | 'user' | 'department' | 'comment';
  id: string;
  title: string;
  subtitle: string | null;
  badge: string | null;
  href: string;
}

/**
 * Global search across the whole platform. Results are always filtered by the
 * caller's task visibility, so search can never leak work someone may not see.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
  ) {}

  async search(user: AuthenticatedUser, term: string, limit = 8) {
    const trimmed = (term ?? '').trim();
    if (trimmed.length < 2) {
      return { query: trimmed, groups: [], total: 0 };
    }

    const visibility = await this.accessControl.buildTaskVisibilityFilter(user);
    const numeric = Number.parseInt(trimmed.replace('#', ''), 10);

    const taskWhere: Prisma.TaskWhereInput = {
      deletedAt: null,
      AND: [
        visibility,
        {
          OR: [
            ...(Number.isFinite(numeric) ? [{ number: numeric }] : []),
            { title: { contains: trimmed, mode: 'insensitive' } },
            { description: { contains: trimmed, mode: 'insensitive' } },
            { tags: { some: { tag: { name: { contains: trimmed.toLowerCase() } } } } },
          ],
        },
      ],
    };

    const [tasks, comments, projects, users, departments] = await Promise.all([
      this.prisma.task.findMany({
        where: taskWhere,
        select: {
          id: true,
          number: true,
          title: true,
          status: true,
          currentOwner: { select: { firstName: true, lastName: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      }),
      this.prisma.taskComment.findMany({
        where: {
          deletedAt: null,
          body: { contains: trimmed, mode: 'insensitive' },
          task: { deletedAt: null, AND: [visibility] },
        },
        select: {
          id: true,
          body: true,
          task: { select: { number: true, title: true } },
          author: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.project.findMany({
        where: {
          deletedAt: null,
          OR: [
            { name: { contains: trimmed, mode: 'insensitive' } },
            { code: { contains: trimmed, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, code: true, status: true },
        take: limit,
      }),
      this.prisma.user.findMany({
        where: {
          deletedAt: null,
          OR: [
            { firstName: { contains: trimmed, mode: 'insensitive' } },
            { lastName: { contains: trimmed, mode: 'insensitive' } },
            { email: { contains: trimmed, mode: 'insensitive' } },
            { position: { title: { contains: trimmed, mode: 'insensitive' } } },
          ],
        },
        select: USER_SUMMARY_SELECT,
        take: limit,
      }),
      this.prisma.department.findMany({
        where: {
          deletedAt: null,
          OR: [
            { name: { contains: trimmed, mode: 'insensitive' } },
            { code: { contains: trimmed, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, code: true },
        take: 5,
      }),
    ]);

    const groups = [
      {
        label: 'Tasks',
        hits: tasks.map<SearchHit>((task) => ({
          type: 'task',
          id: task.id,
          title: '#' + task.number + ' ' + task.title,
          subtitle: task.currentOwner
            ? 'With ' + task.currentOwner.firstName + ' ' + task.currentOwner.lastName
            : 'Unassigned',
          badge: task.status,
          href: '/tasks/' + task.number,
        })),
      },
      {
        label: 'Comments',
        hits: comments.map<SearchHit>((comment) => ({
          type: 'comment',
          id: comment.id,
          title: comment.body.slice(0, 90),
          subtitle:
            (comment.author.firstName + ' ' + comment.author.lastName) +
            ' on #' + comment.task.number,
          badge: null,
          href: '/tasks/' + comment.task.number,
        })),
      },
      {
        label: 'Projects',
        hits: projects.map<SearchHit>((project) => ({
          type: 'project',
          id: project.id,
          title: project.name,
          subtitle: project.code,
          badge: project.status,
          href: '/projects/' + project.id,
        })),
      },
      {
        label: 'People',
        hits: users.map<SearchHit>((person) => ({
          type: 'user',
          id: person.id,
          title: person.firstName + ' ' + person.lastName,
          subtitle: person.position?.title ?? person.jobTitle ?? person.email,
          badge: person.department?.name ?? null,
          href: '/people/' + person.id,
        })),
      },
      {
        label: 'Departments',
        hits: departments.map<SearchHit>((department) => ({
          type: 'department',
          id: department.id,
          title: department.name,
          subtitle: department.code,
          badge: null,
          href: '/organization?department=' + department.id,
        })),
      },
    ].filter((group) => group.hits.length > 0);

    return {
      query: trimmed,
      groups,
      total: groups.reduce((sum, group) => sum + group.hits.length, 0),
    };
  }
}
