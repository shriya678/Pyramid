import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, type Label } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { WorkspaceContext } from '../workspaces/guards/workspace-member.guard';
import type { CreateLabelDto } from './dto/create-label.dto';
import type { UpdateLabelDto } from './dto/update-label.dto';

export interface LabelResponse {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
  createdAt: string;
}

const toResponse = (l: Label): LabelResponse => ({
  id: l.id,
  workspaceId: l.workspaceId,
  name: l.name,
  color: l.color,
  createdAt: l.createdAt.toISOString(),
});

@Injectable()
export class LabelsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ctx: WorkspaceContext): Promise<LabelResponse[]> {
    const rows = await this.prisma.label.findMany({
      where: { workspaceId: ctx.id },
      orderBy: { name: 'asc' },
    });
    return rows.map(toResponse);
  }

  async create(ctx: WorkspaceContext, dto: CreateLabelDto): Promise<LabelResponse> {
    this.requireEditor(ctx);
    try {
      const created = await this.prisma.label.create({
        data: { workspaceId: ctx.id, name: dto.name, color: dto.color },
      });
      return toResponse(created);
    } catch (err: unknown) {
      throw this.mapKnownError(err);
    }
  }

  async update(
    ctx: WorkspaceContext,
    labelId: string,
    dto: UpdateLabelDto,
  ): Promise<LabelResponse> {
    this.requireEditor(ctx);
    const existing = await this.loadInWorkspace(ctx, labelId);
    try {
      const updated = await this.prisma.label.update({
        where: { id: existing.id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.color !== undefined ? { color: dto.color } : {}),
        },
      });
      return toResponse(updated);
    } catch (err: unknown) {
      throw this.mapKnownError(err);
    }
  }

  /**
   * Delete. TaskLabel join rows cascade automatically (see prisma schema),
   * so tasks that had this label just lose it — the tasks themselves stay.
   */
  async delete(ctx: WorkspaceContext, labelId: string): Promise<{ ok: true }> {
    this.requireEditor(ctx);
    const existing = await this.loadInWorkspace(ctx, labelId);
    await this.prisma.label.delete({ where: { id: existing.id } });
    return { ok: true };
  }

  private async loadInWorkspace(ctx: WorkspaceContext, labelId: string): Promise<Label> {
    const row = await this.prisma.label.findUnique({ where: { id: labelId } });
    if (!row || row.workspaceId !== ctx.id) {
      throw new NotFoundException('Label not found');
    }
    return row;
  }

  private requireEditor(ctx: WorkspaceContext): void {
    if (ctx.role !== Role.OWNER && ctx.role !== Role.ADMIN) {
      throw new ForbiddenException('Only workspace owners or admins can modify labels');
    }
  }

  private mapKnownError(err: unknown): Error {
    const code = (err as { code?: string }).code;
    if (code === 'P2002') {
      return new ConflictException('A label with that name already exists in this workspace');
    }
    return err as Error;
  }
}
