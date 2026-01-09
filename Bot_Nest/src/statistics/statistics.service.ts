import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Student } from '../students/student.entity';
import { Event } from '../events/event.entity';
import { Participation } from '../participations/participation.entity';

@Injectable()
export class StatisticsService {
  constructor(
    @InjectRepository(Student)
    private studentsRepository: Repository<Student>,
    @InjectRepository(Event)
    private eventsRepository: Repository<Event>,
    @InjectRepository(Participation)
    private participationsRepository: Repository<Participation>,
  ) {}

  async getAdminStatistics() {
    const [
      totalStudents,
      totalEvents,
      pendingParticipations,
      lowRatingStudents
    ] = await Promise.all([
      this.studentsRepository.count(),
      this.eventsRepository.count(),
      this.participationsRepository.count({ where: { status: 'pending' } }),
      this.studentsRepository.count({ where: { rating: 3.0 } })
    ]);

    const totalParticipations = await this.participationsRepository.count();
    const approvedParticipations = await this.participationsRepository.count({ 
      where: { status: 'approved' } 
    });

    const approvalRate = totalParticipations > 0 
      ? (approvedParticipations / totalParticipations * 100).toFixed(2)
      : '0.00';

    return {
      totalStudents,
      totalEvents,
      pendingParticipations,
      lowRatingStudents,
      approvalRate: `${approvalRate}%`,
      averageRating: await this.getAverageRating(),
    };
  }

  async getEventStatistics(eventId: number) {
    const participations = await this.participationsRepository.find({
      where: { event: { id: eventId } },
      relations: ['student'],
    });
    
    const total = participations.length;
    const approved = participations.filter(p => p.status === 'approved').length;
    const pending = participations.filter(p => p.status === 'pending').length;
    const rejected = participations.filter(p => p.status === 'rejected').length;

    return {
      event: await this.eventsRepository.findOne({ where: { id: eventId } }),
      totalParticipants: total,
      approved,
      pending,
      rejected,
      approvalRate: total > 0 ? ((approved / total) * 100).toFixed(2) + '%' : '0%',
    };
  }

  async getStudentStatistics(studentId: number) {
    const participations = await this.participationsRepository.find({
      where: { 
        student: { id: studentId }
      },
      relations: ['event'],
    });

    const total = participations.length;
    const approved = participations.filter(p => p.status === 'approved').length;
    const pending = participations.filter(p => p.status === 'pending').length;
    const rejected = participations.filter(p => p.status === 'rejected').length;

    return {
      totalParticipations: total,
      approved,
      pending,
      rejected,
      successRate: total > 0 ? ((approved / total) * 100).toFixed(2) + '%' : '0%',
      totalPoints: participations
        .filter(p => p.status === 'approved')
        .reduce((sum, p) => sum + p.event.points_awarded, 0),
    };
  }

  private async getAverageRating(): Promise<number> {
    const result = await this.studentsRepository
      .createQueryBuilder('student')
      .select('AVG(student.rating)', 'average')
      .getRawOne();
    
    return Number(parseFloat(result.average || '3.0').toFixed(2));
  }
}