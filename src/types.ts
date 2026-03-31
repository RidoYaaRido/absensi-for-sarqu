export type AttendanceStatus = 'Hadir' | 'Sakit' | 'Izin' | 'Alpa';

export interface AttendanceRecord {
  id: string;
  studentName: string;
  className: string;
  status: AttendanceStatus;
  timestamp: string; // ISO 8601
  proofImage?: string; // Base64 or URL
}

export interface Student {
  id: string;
  name: string;
}

export interface ClassData {
  id: string;
  name: string;
  students: Student[];
}
