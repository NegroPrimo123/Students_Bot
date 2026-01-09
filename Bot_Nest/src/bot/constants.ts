export enum UserStep {
  REGISTRATION = 'registration',
  SELECT_COURSE = 'select_course',
  SELECT_GROUP = 'select_group',
  WAITING_FOR_CERTIFICATE = 'waiting_for_certificate',
  CERTIFICATE_UPLOADED = 'certificate_uploaded',
  WAITING_EVENT_CERTIFICATE = 'waiting_event_certificate',
  EDITING_FIO = 'editing_fio'
}

export enum UserAction {
  UPLOAD_CERTIFICATE = 'upload_certificate'
}

export enum ParticipationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected'
}

export enum CallbackAction {
  COURSE = 'course',
  GROUP = 'group',
  GROUPS_PAGE = 'groups_page',
  EDIT_COURSE = 'edit_course',
  EDIT_GROUPS_PAGE = 'edit_groups_page',
  EDIT_GROUP_SELECT = 'edit_group_select',
  EDIT_FIO = 'edit_fio',
  EDIT_GROUP = 'edit_group',
  SELECT_EVENT_FOR_CERTIFICATE = 'select_event_for_certificate',
  CERTIFICATE_EVENTS_PAGE = 'certificate_events_page',
  CERTIFICATE_EVENT = 'certificate_event',
  PARTICIPATE = 'participate',
  ALREADY_PARTICIPATING = 'already_participating'
}

export const FILE_SIZE_LIMIT = 20 * 1024 * 1024; // 20MB
export const EVENTS_PER_PAGE = 6;
export const GROUPS_PER_PAGE = 10;

export const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png'
];

export const ALLOWED_FILE_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];

// Конфигурация бота
export const BotConfig = {
  pollingInterval: 100,
  fileSizeLimit: FILE_SIZE_LIMIT,
  eventsPerPage: EVENTS_PER_PAGE,
  groupsPerPage: GROUPS_PER_PAGE,
  stateTtl: 3600, // 1 час TTL для состояний
  maxRemindersPerBatch: 30,
  reminderDelayMs: 100
};