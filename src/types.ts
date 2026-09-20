export interface Student {
  id: string;
  name: string;
  password?: string;
  isAllowed: boolean;
  behaviorScore?: number;
  infractions?: string[];
  allowedClasses?: string[];
  classLevels?: Record<string, number>;
  skillLevel?: number;
}

export interface EnrollmentRecord {
  studentId: string;
  classes: string[];
  classLevels?: Record<string, number>;
  guests?: Record<string, string[]>;
  guestLevels?: Record<string, number[]>;
  skillLevel?: number;
  updatedAt: number;
  justifiedAbsence?: boolean;
  absenceReason?: string;
}

export interface ActivityLog {
  id: string;
  studentName: string;
  action: 'enrolled' | 'unenrolled' | 'changed' | 'justified';
  details: string;
  timestamp: number;
}

export interface Participant {
  key: string;
  name: string;
  isGuest: boolean;
  guestOf?: string;
  guestIndex?: number;
  studentId: string;
  level: number;
  enrolledIndex: number;
}

export interface Team {
  id: number;
  name: string;
  players: Participant[];
  totalStars: number;
  averageStars: number;
  color: string;
}

export interface DrawResult {
  classId: string;
  className: string;
  teamSize: number;
  teams: Team[];
  waitlist: Participant[];
  createdAt: number;
  totalPlayers: number;
}
