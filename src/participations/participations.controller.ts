import { Controller, Get, Put, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam } from '@nestjs/swagger';
import { ParticipationsService } from './participations.service';
import { Participation } from './participation.entity';

class UpdateParticipationStatusDto {
  status: 'approved' | 'rejected';
  adminComment?: string;
}

@ApiTags('participations')
@Controller('participations')
export class ParticipationsController {
  constructor(private readonly participationsService: ParticipationsService) {}

  @Get('pending')
  @ApiOperation({ summary: 'Получить ожидающие проверки участия' })
  @ApiResponse({ status: 200, description: 'Список участий со статусом "pending"', type: [Participation] })
  async getPending() {
    return await this.participationsService.getPendingParticipations();
  }

  @Put(':id/status')
  @ApiOperation({ summary: 'Обновить статус участия' })
  @ApiParam({ name: 'id', description: 'ID участия', type: Number })
  @ApiBody({ type: UpdateParticipationStatusDto })
  @ApiResponse({ status: 200, description: 'Статус участия обновлен', type: Participation })
  @ApiResponse({ status: 404, description: 'Участие не найдено' })
  async updateStatus(
    @Param('id') id: number,
    @Body() body: UpdateParticipationStatusDto,
  ) {
    return await this.participationsService.updateParticipationStatus(
      id,
      body.status,
      body.adminComment,
    );
  }
}