import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { StatisticsService } from './statistics.service';

class AdminStatisticsResponse {
  totalStudents: number;
  totalEvents: number;
  pendingParticipations: number;
  lowRatingStudents: number;
  approvalRate: string;
  averageRating: number;
}

class EventStatisticsResponse {
  event: any;
  totalParticipants: number;
  approved: number;
  pending: number;
  rejected: number;
  approvalRate: string;
}

class StudentStatisticsResponse {
  totalParticipations: number;
  approved: number;
  pending: number;
  rejected: number;
  successRate: string;
  totalPoints: number;
}

@ApiTags('statistics')
@Controller('statistics')
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get('admin')
  @ApiOperation({ summary: 'Получить общую статистику для администратора' })
  @ApiResponse({ status: 200, description: 'Статистика администратора', type: AdminStatisticsResponse })
  async getAdminStatistics() {
    return await this.statisticsService.getAdminStatistics();
  }

  @Get('events/:eventId')
  @ApiOperation({ summary: 'Получить статистику по мероприятию' })
  @ApiParam({ name: 'eventId', description: 'ID мероприятия', type: Number })
  @ApiResponse({ status: 200, description: 'Статистика мероприятия', type: EventStatisticsResponse })
  @ApiResponse({ status: 404, description: 'Мероприятие не найдено' })
  async getEventStatistics(@Param('eventId') eventId: number) {
    return await this.statisticsService.getEventStatistics(eventId);
  }

  @Get('students/:studentId')
  @ApiOperation({ summary: 'Получить статистику по студенту' })
  @ApiParam({ name: 'studentId', description: 'ID студента', type: Number })
  @ApiResponse({ status: 200, description: 'Статистика студента', type: StudentStatisticsResponse })
  @ApiResponse({ status: 404, description: 'Студент не найден' })
  async getStudentStatistics(@Param('studentId') studentId: number) {
    return await this.statisticsService.getStudentStatistics(studentId);
  }
}