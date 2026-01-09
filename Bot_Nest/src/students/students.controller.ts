import { Controller, Get, Param, Put, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam } from '@nestjs/swagger';
import { StudentsService } from './students.service';
import { Student } from './student.entity';

class UpdateProfileDto {
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  group?: string;
  course?: number;
}

@ApiTags('students')
@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Put(':telegramId/profile')
  @ApiOperation({ summary: 'Обновить профиль студента' })
  @ApiParam({ name: 'telegramId', description: 'Telegram ID студента', type: Number })
  @ApiBody({ type: UpdateProfileDto })
  @ApiResponse({ status: 200, description: 'Профиль обновлен', type: Student })
  @ApiResponse({ status: 404, description: 'Студент не найден' })
  async updateProfile(
    @Param('telegramId') telegramId: number,
    @Body() updateData: UpdateProfileDto,
  ) {
    return await this.studentsService.updateStudentProfile(telegramId, updateData);
  }
}