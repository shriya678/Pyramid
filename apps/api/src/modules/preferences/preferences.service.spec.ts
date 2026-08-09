/* eslint-disable @typescript-eslint/require-await -- mock implementations
   satisfy async signatures without actually awaiting; that's the point. */
import { AccentColor, DefaultView, ThemeMode } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { PreferencesService } from './preferences.service';

interface PreferenceRow {
  userId: string;
  theme: ThemeMode;
  accentColor: AccentColor;
  defaultView: DefaultView;
  boardFieldsShown: Record<string, boolean>;
  listFieldsShown: Record<string, boolean>;
  projectListFieldsShown: Record<string, boolean>;
}

function makeMockPrisma() {
  const rows: PreferenceRow[] = [];
  const prisma = {
    userPreference: {
      findUnique: async ({ where }: { where: { userId: string } }) =>
        rows.find((r) => r.userId === where.userId) ?? null,
      upsert: async ({
        where,
        update,
        create,
      }: {
        where: { userId: string };
        update: Partial<PreferenceRow>;
        create: Partial<PreferenceRow> & { userId: string };
      }) => {
        const existing = rows.find((r) => r.userId === where.userId);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const seeded: PreferenceRow = {
          userId: create.userId,
          theme: create.theme ?? ThemeMode.LIGHT,
          accentColor: create.accentColor ?? AccentColor.BLUE,
          defaultView: create.defaultView ?? DefaultView.BOARD,
          boardFieldsShown: create.boardFieldsShown ?? {},
          listFieldsShown: create.listFieldsShown ?? {},
          projectListFieldsShown: create.projectListFieldsShown ?? {},
        };
        rows.push(seeded);
        return seeded;
      },
    },
    __rows: rows,
    __seed: (r: PreferenceRow) => rows.push(r),
  };
  return prisma;
}

describe('PreferencesService', () => {
  let service: PreferencesService;
  let prisma: ReturnType<typeof makeMockPrisma>;

  beforeEach(() => {
    prisma = makeMockPrisma();
    service = new PreferencesService(prisma as unknown as PrismaService);
  });

  describe('get', () => {
    it('returns defaults when no row exists yet', async () => {
      const prefs = await service.get('never-seeded-user');
      expect(prefs).toEqual({
        theme: ThemeMode.LIGHT,
        accentColor: AccentColor.BLUE,
        defaultView: DefaultView.BOARD,
        boardFieldsShown: {},
        listFieldsShown: {},
        projectListFieldsShown: {},
      });
    });

    it('returns the persisted row when present', async () => {
      prisma.__seed({
        userId: 'u1',
        theme: ThemeMode.DARK,
        accentColor: AccentColor.EMERALD,
        defaultView: DefaultView.LIST,
        boardFieldsShown: { priority: true },
        listFieldsShown: { members: true },
        projectListFieldsShown: {},
      });
      const prefs = await service.get('u1');
      expect(prefs.theme).toBe(ThemeMode.DARK);
      expect(prefs.accentColor).toBe(AccentColor.EMERALD);
      expect(prefs.boardFieldsShown).toEqual({ priority: true });
    });
  });

  describe('update', () => {
    it('creates a row on first update (upsert semantics)', async () => {
      const prefs = await service.update('u2', { theme: ThemeMode.DARK });
      expect(prefs.theme).toBe(ThemeMode.DARK);
      // Other fields still fall to defaults on read.
      expect(prefs.accentColor).toBe(AccentColor.BLUE);
      expect(prisma.__rows).toHaveLength(1);
    });

    it('partial update does not clobber unrelated fields', async () => {
      prisma.__seed({
        userId: 'u3',
        theme: ThemeMode.DARK,
        accentColor: AccentColor.EMERALD,
        defaultView: DefaultView.LIST,
        boardFieldsShown: { priority: true },
        listFieldsShown: {},
        projectListFieldsShown: {},
      });
      const prefs = await service.update('u3', { theme: ThemeMode.LIGHT });
      expect(prefs.theme).toBe(ThemeMode.LIGHT);
      // Untouched fields preserved.
      expect(prefs.accentColor).toBe(AccentColor.EMERALD);
      expect(prefs.defaultView).toBe(DefaultView.LIST);
      expect(prefs.boardFieldsShown).toEqual({ priority: true });
    });

    it('replaces JSON blob wholesale (no deep merge)', async () => {
      prisma.__seed({
        userId: 'u4',
        theme: ThemeMode.LIGHT,
        accentColor: AccentColor.BLUE,
        defaultView: DefaultView.BOARD,
        boardFieldsShown: { priority: true, members: true },
        listFieldsShown: {},
        projectListFieldsShown: {},
      });
      const prefs = await service.update('u4', { boardFieldsShown: { labels: true } });
      // Old keys gone — clients are expected to send the whole set.
      expect(prefs.boardFieldsShown).toEqual({ labels: true });
    });
  });
});
