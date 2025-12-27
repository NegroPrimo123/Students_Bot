import { Controller, Get, Put, Body, Param, Post, NotFoundException, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam } from '@nestjs/swagger';
import type { Response } from 'express';
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

  @Get(':id/certificate')
  @ApiOperation({ summary: 'Получить информацию о сертификате участия' })
  @ApiParam({ name: 'id', description: 'ID участия', type: Number })
  @ApiResponse({ status: 200, description: 'Информация о сертификате' })
  @ApiResponse({ status: 404, description: 'Участие или сертификат не найдены' })
  async getCertificateInfo(@Param('id') id: number) {
    const participation = await this.participationsService.getParticipationWithCertificate(id);
    
    if (!participation || !participation.certificate_file_id) {
      throw new NotFoundException('Сертификат не найден');
    }

    return {
      fileId: participation.certificate_file_id,
      studentName: `${participation.student.last_name} ${participation.student.first_name}`,
      eventTitle: participation.event.title,
      status: participation.status,
      uploadedAt: participation.created_at,
      adminComment: participation.admin_comment
    };
  }

  @Get(':id/view-certificate') // Изменили с @Post на @Get и путь
  @ApiOperation({ summary: 'Просмотреть PDF сертификата' })
  @ApiParam({ name: 'id', description: 'ID участия', type: Number })
  @ApiResponse({ status: 200, description: 'PDF сертификат' })
  @ApiResponse({ status: 404, description: 'Сертификат не найден' })
  async viewCertificate(@Param('id') id: number, @Res() res: Response) {
    try {
      const { buffer, filename } = await this.participationsService.getCertificatePdf(id);
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      
      return res.send(buffer);
    } catch (error) {
      throw new NotFoundException('Сертификат не найден');
    }
  }
}
