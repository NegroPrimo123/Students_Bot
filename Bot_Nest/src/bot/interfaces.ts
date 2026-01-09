import { UserStep, UserAction } from './constants';

export interface UserState {
  step?: UserStep;
  action?: UserAction;
  fio?: {
    last_name: string;
    first_name: string;
    middle_name: string | null;
  };
  course?: number;
  groupsPage?: number;
  editingCourse?: number;
  certificateFileId?: string;
  certificateFileName?: string;
  selectedEventId?: number;
  data?: any;
}

export interface StudentData {
  telegram_id: number;
  username?: string;
  first_name: string;
  last_name: string;
  middle_name?: string; // Изменено: string | null | undefined → string | undefined
  course: number;
  group: string;
}

export interface ParticipationData {
  studentId: number;
  eventId: number;
  certificateFileId?: string;
}

export interface UpdateStudentProfileData {
  first_name?: string;
  last_name?: string;
  middle_name?: string; // Изменено: string | null → string | undefined
  course?: number;
  group?: string;
}