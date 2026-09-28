export type AppRole = 'pending' | 'guru' | 'coordinator' | 'student' | 'kiosk';

export type StudentStatus = 'new' | 'active' | 'irregular' | 'inactive' | 'paused' | 'left';

export type VisitMethod = 'qr' | 'manual' | 'face' | 'phone';

export type CallOutcome = 'returning' | 'paused' | 'not_reachable' | 'discontinued';

export type MaterialKind = 'youtube' | 'audio' | 'pdf' | 'image' | 'note';

export type AnnouncementAudience = 'all' | 'level' | 'mentees' | 'staff' | 'group';

export interface Centre {
  id: number;
  name: string;
  lat?: number;
  lng?: number;
  radius_m: number;
  opens_at: string;
  closes_at: string;
  active: boolean;
}

export interface Profile {
  id: string;
  role: AppRole;
  full_name: string;
  email?: string;
  phone?: string;
  centre_id: number;
  is_treasurer: boolean;
  language: 'en' | 'te' | 'hi';
  active: boolean;
  created_at: string;
}

export interface Student {
  id: string;
  roll_no: string;
  profile_id?: string;
  full_name: string;
  dob?: string;
  phone?: string;
  email?: string;
  area?: string;
  pincode?: string;
  level_id: number;
  status: StudentStatus;
  paused_until?: string;
  mentor_id?: string;
  mentor_name?: string;
  home_centre_id: number;
  joined_on: string;
  photo_path?: string;
  qr_token: string;
  created_by?: string;
  created_at: string;
  is_checked_in?: boolean;
}

export interface Guardian {
  id: string;
  student_id: string;
  full_name: string;
  phone?: string;
  email?: string;
  relation?: string;
}

export interface Consent {
  id: string;
  student_id: string;
  guardian_id?: string;
  scope: 'data' | 'photo' | 'face';
  method: 'written' | 'email_code';
  id_type_checked?: string;
  verified_by?: string;
  given_at: string;
}

export interface Visit {
  id: number;
  student_id: string;
  student_name?: string;
  roll_no?: string;
  centre_id: number;
  check_in: string;
  check_out?: string;
  method: VisitMethod;
  marked_by?: string;
  device_id?: string;
}

export interface CallLog {
  id: string;
  student_id: string;
  coordinator_id: string;
  coordinator_name?: string;
  called_at: string;
  outcome: CallOutcome;
  reason?: string;
  comment: string;
  next_date?: string;
}

export interface FollowUpTask {
  id: string;
  student_id: string;
  student_name?: string;
  student_roll_no?: string;
  student_phone?: string;
  assignee_id?: string;
  kind: 'call' | 'retry';
  due_on: string;
  attempt: number;
  done_at?: string;
  call_log_id?: string;
  escalated: boolean;
  created_at: string;
}

export interface Level {
  id: number;
  name: string;
  sort: number;
}

export interface SyllabusItem {
  id: number;
  level_id: number;
  sort: number;
  title: string;
  description?: string;
  completed?: boolean;
  done_on?: string;
}

export interface StudentProgress {
  student_id: string;
  item_id: number;
  done_on: string;
  ticked_by?: string;
  remark?: string;
}

export interface Material {
  id: number;
  title: string;
  kind: MaterialKind;
  url?: string;
  storage_path?: string;
  body?: string;
  level_id?: number;
  item_id?: number;
  uploaded_by?: string;
  approved_by?: string;
  created_at: string;
}

export interface Announcement {
  id: number;
  title: string;
  body: string;
  attachments: { name: string; url: string }[];
  audience: AnnouncementAudience;
  audience_level?: number;
  audience_group?: number;
  pinned: boolean;
  publish_at: string;
  created_by?: string;
  created_at: string;
  is_read?: boolean;
}

export interface ToggleVisitResponse {
  action: 'in' | 'out' | 'unknown';
  roll_no?: string;
  full_name?: string;
  photo_path?: string;
  at?: string;
  minutes?: number;
}
