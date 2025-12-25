import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, JoinColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Student } from '../students/student.entity';
import { Event } from '../events/event.entity';

@Entity('participations')
export class Participation {
  @ApiProperty({ description: 'Уникальный идентификатор', example: 1 })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ description: 'Студент', type: () => Student })
  @ManyToOne(() => Student, student => student.participations)
  @JoinColumn({ name: 'student_id' })
  student: Student;

  @ApiProperty({ description: 'Мероприятие', type: () => Event })
  @ManyToOne(() => Event, event => event.participations)
  @JoinColumn({ name: 'event_id' })
  event: Event;

  @ApiProperty({ description: 'ID файла сертификата', required: false, example: 'file_123' })
  @Column({ name: 'certificate_file_id', nullable: true })
  certificate_file_id: string;

  @ApiProperty({ 
    description: 'Статус участия', 
    enum: ['pending', 'approved', 'rejected'],
    example: 'pending'
  })
  @Column({ default: 'pending' })
  status: 'pending' | 'approved' | 'rejected';

  @ApiProperty({ description: 'Комментарий администратора', required: false, example: 'Сертификат не соответствует требованиям' })
  @Column({ name: 'admin_comment', nullable: true })
  admin_comment: string;

  @ApiProperty({ description: 'Дата создания', example: '2023-12-01T12:00:00.000Z' })
  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}