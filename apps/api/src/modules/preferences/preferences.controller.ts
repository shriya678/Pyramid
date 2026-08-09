import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UpdatePreferenceDto } from './dto/update-preference.dto';
import { PreferencesService } from './preferences.service';

/**
 * Per-user preferences. Not workspace-scoped — same settings follow the user
 * across every workspace they belong to. No WorkspaceMemberGuard needed;
 * JwtAuthGuard is enough (Bearer required).
 */
@ApiTags('preferences')
@ApiBearerAuth()
@Controller('me/preferences')
export class PreferencesController {
  constructor(private readonly preferencesService: PreferencesService) {}

  @Get()
  @ApiOperation({ summary: "Get the current user's preferences (defaults if never set)" })
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.preferencesService.get(user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Update any subset of preference fields (upsert semantics)' })
  update(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdatePreferenceDto) {
    return this.preferencesService.update(user.id, dto);
  }
}
