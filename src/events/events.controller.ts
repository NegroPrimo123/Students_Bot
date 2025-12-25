import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Param, 
  Delete, 
  Patch, 
  Put, 
  NotFoundException 
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam } from '@nestjs/swagger';
import { EventsService } from './events.service';
import { Event } from './event.entity';

class CreateEventDto {
  title: string;
  description: string;
  points_awarded?: number;
  course: number;
}

class UpdateEventDto {
  title?: string;
  description?: string;
  points_awarded?: number;
  course?: number;
}

@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @ApiOperation({ summary: 'Создать новое мероприятие' })
  @ApiBody({ type: CreateEventDto })
  @ApiResponse({ status: 201, description: 'Мероприятие создано', type: Event })
  @ApiResponse({ status: 400, description: 'Неверные данные' })
  async create(@Body() eventData: CreateEventDto) {
    return await this.eventsService.createEvent(eventData);
  }

  @Get()
  @ApiOperation({ summary: 'Получить все активные мероприятия' })
  @ApiResponse({ status: 200, description: 'Список активных мероприятий', type: [Event] })
  async findAll() {
    return await this.eventsService.findAll();
  }

  @Get('all')
  @ApiOperation({ summary: 'Получить все мероприятия (включая архивированные)' })
  @ApiResponse({ status: 200, description: 'Список всех мероприятий', type: [Event] })
  async findAllIncludingArchived() {
    return await this.eventsService.findAllIncludingArchived();
  }

  @Get('archived')
  @ApiOperation({ summary: 'Получить архивированные мероприятия' })
  @ApiResponse({ status: 200, description: 'Список архивированных мероприятий', type: [Event] })
  async findArchived() {
    return await this.eventsService.findArchivedEvents();
  }

  @Get('course/:course')
  @ApiOperation({ summary: 'Получить мероприятия по курсу' })
  @ApiParam({ name: 'course', description: 'Номер курса (1, 2, 3)', type: Number })
  @ApiResponse({ status: 200, description: 'Список мероприятий для указанного курса', type: [Event] })
  @ApiResponse({ status: 404, description: 'Мероприятия не найдены' })
  async findByCourse(@Param('course') course: number) {
    return await this.eventsService.getEventsByCourse(course);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Получить мероприятие по ID' })
  @ApiParam({ name: 'id', description: 'ID мероприятия', type: Number })
  @ApiResponse({ status: 200, description: 'Мероприятие найдено', type: Event })
  @ApiResponse({ status: 404, description: 'Мероприятие не найдено' })
  async findOne(@Param('id') id: number) {
    const event = await this.eventsService.findById(id);
    if (!event) {
      throw new NotFoundException('Мероприятие не найдено');
    }
    return event;
  }

  @Patch(':id/archive')
  @ApiOperation({ summary: 'Архивировать мероприятие' })
  @ApiParam({ name: 'id', description: 'ID мероприятия', type: Number })
  @ApiResponse({ status: 200, description: 'Мероприятие архивировано', type: Event })
  @ApiResponse({ status: 404, description: 'Мероприятие не найдено' })
  async archive(@Param('id') id: number) {
    return await this.eventsService.archiveEvent(id);
  }

  @Patch(':id/restore')
  @ApiOperation({ summary: 'Восстановить мероприятие из архива' })
  @ApiParam({ name: 'id', description: 'ID мероприятия', type: Number })
  @ApiResponse({ status: 200, description: 'Мероприятие восстановлено', type: Event })
  @ApiResponse({ status: 404, description: 'Мероприятие не найдено' })
  async restore(@Param('id') id: number) {
    return await this.eventsService.restoreEvent(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Обновить мероприятие' })
  @ApiParam({ name: 'id', description: 'ID мероприятия', type: Number })
  @ApiBody({ type: UpdateEventDto })
  @ApiResponse({ status: 200, description: 'Мероприятие обновлено', type: Event })
  @ApiResponse({ status: 404, description: 'Мероприятие не найдено' })
  async update(@Param('id') id: number, @Body() updateData: UpdateEventDto) {
    return await this.eventsService.updateEvent(id, updateData);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Безопасное удаление мероприятия (только если нет участий)' })
  @ApiParam({ name: 'id', description: 'ID мероприятия', type: Number })
  @ApiResponse({ status: 200, description: 'Мероприятие удалено' })
  @ApiResponse({ status: 404, description: 'Мероприятие не найдено' })
  @ApiResponse({ status: 400, description: 'Невозможно удалить мероприятие с участиями' })
  async remove(@Param('id') id: number) {
    await this.eventsService.safeDeleteEvent(id);
    return { message: 'Мероприятие успешно удалено' };
  }
}