import { Injectable } from '@nestjs/common';
import { AccentColor, DefaultView, ThemeMode, type UserPreference } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { UpdatePreferenceDto } from './dto/update-preference.dto';

export interface PreferenceResponse {
  theme: ThemeMode;
  accentColor: AccentColor;
  defaultView: DefaultView;
  boardFieldsShown: Record<string, boolean>;
  listFieldsShown: Record<string, boolean>;
  projectListFieldsShown: Record<string, boolean>;
}

const DEFAULTS: PreferenceResponse = {
  theme: ThemeMode.LIGHT,
  accentColor: AccentColor.BLUE,
  defaultView: DefaultView.BOARD,
  boardFieldsShown: {},
  listFieldsShown: {},
  projectListFieldsShown: {},
};

const toResponse = (row: UserPreference): PreferenceResponse => ({
  theme: row.theme,
  accentColor: row.accentColor,
  defaultView: row.defaultView,
  boardFieldsShown: (row.boardFieldsShown ?? {}) as Record<string, boolean>,
  listFieldsShown: (row.listFieldsShown ?? {}) as Record<string, boolean>,
  projectListFieldsShown: (row.projectListFieldsShown ?? {}) as Record<string, boolean>,
});

@Injectable()
export class PreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the caller's preferences, falling back to defaults if their row
   * was never seeded (shouldn't happen in practice — WorkspaceProvisioningService
   * creates it on user creation — but defensive).
   */
  async get(userId: string): Promise<PreferenceResponse> {
    const row = await this.prisma.userPreference.findUnique({ where: { userId } });
    return row ? toResponse(row) : DEFAULTS;
  }

  /**
   * Idempotent upsert. The frontend PATCHes any subset of fields (e.g. just
   * `{ theme: 'DARK' }` when the user flips the toggle). Missing keys stay
   * whatever they were.
   */
  async update(userId: string, dto: UpdatePreferenceDto): Promise<PreferenceResponse> {
    const partial = {
      ...(dto.theme !== undefined ? { theme: dto.theme } : {}),
      ...(dto.accentColor !== undefined ? { accentColor: dto.accentColor } : {}),
      ...(dto.defaultView !== undefined ? { defaultView: dto.defaultView } : {}),
      ...(dto.boardFieldsShown !== undefined ? { boardFieldsShown: dto.boardFieldsShown } : {}),
      ...(dto.listFieldsShown !== undefined ? { listFieldsShown: dto.listFieldsShown } : {}),
      ...(dto.projectListFieldsShown !== undefined
        ? { projectListFieldsShown: dto.projectListFieldsShown }
        : {}),
    };
    const row = await this.prisma.userPreference.upsert({
      where: { userId },
      update: partial,
      create: { userId, ...partial },
    });
    return toResponse(row);
  }
}
